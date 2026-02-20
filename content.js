const DEBUG_MODE = false;
const TIMEOUT_MS = 3000;
const DEBOUNCE_MS = 400;
const PROCESSED_ATTR = 'data-focus-processed';

const BLACKLIST = [
    'Mix -',
    'Music',
    'Song',
    'Lyrics',
    'Live',
    'Official',
    'Shorts',
    'Gameplay',
    'React',
    'Prank',
    'ASMR',
    'vs',
    'Trailer'
];

const STOP_WORDS = [
    'i', 'want', 'to', 'learn', 'how', 'about', 'the', 'and', 'for', 'in', 'on', 'with', 'best', 'top',
    'what', 'is', 'a', 'an', 'make', 'do', 'get', 'watch', 'video', 'tutorial', 'guide', 'complete',
    'beginner', 'advanced', 'course', 'full'
];

let observer = null;
let cachedFocusGoal = '';

function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log('[YouTube Focus]', ...args);
    }
}

function debounce(fn, delayMs) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delayMs);
    };
}

function isHomeFeed() {
    return location.pathname === '/' || location.pathname === '';
}

function getFeedRoot() {
    return (
        document.querySelector('ytd-rich-grid-renderer') ||
        document.querySelector('ytd-browse[page-subtype="home"]') ||
        document.querySelector('ytd-browse')
    );
}

async function refreshFocusGoal() {
    try {
        const result = await chrome.storage.local.get('focusGoal');
        cachedFocusGoal = typeof result.focusGoal === 'string' ? result.focusGoal : '';
    } catch (err) {
        cachedFocusGoal = '';
        debugLog('Storage read failed, defaulting to allow-all.', err);
    }
}

function getVideoTitle(node) {
    let element = node.querySelector('#video-title');
    if (element && element.innerText.trim()) return element.innerText.trim();

    element = node.querySelector('a#video-title-link');
    if (element && element.title) return element.title;

    element = node.querySelector('a[aria-label]');
    if (element && element.getAttribute('aria-label')) {
        return element.getAttribute('aria-label').split(' by ')[0];
    }

    return null;
}

function getDynamicKeywords(goalPhrase) {
    if (!goalPhrase) return [];

    return goalPhrase
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((word) => !STOP_WORDS.includes(word) && word.length > 2);
}

async function processVideo(videoNode) {
    if (videoNode.getAttribute(PROCESSED_ATTR)) return;
    videoNode.setAttribute(PROCESSED_ATTR, 'pending');

    const title = getVideoTitle(videoNode);
    if (!title) {
        videoNode.removeAttribute(PROCESSED_ATTR);
        return;
    }

    if (BLACKLIST.some((entry) => title.includes(entry))) {
        videoNode.style.display = 'none';
        videoNode.setAttribute(PROCESSED_ATTR, 'done');
        return;
    }

    videoNode.style.opacity = '0.4';
    videoNode.style.transition = 'opacity 0.3s ease';

    if (!cachedFocusGoal) {
        videoNode.style.opacity = '1';
        videoNode.setAttribute(PROCESSED_ATTR, 'done');
        return;
    }

    const userKeywords = getDynamicKeywords(cachedFocusGoal);
    const lowerTitle = title.toLowerCase();

    if (userKeywords.some((keyword) => lowerTitle.includes(keyword))) {
        videoNode.style.opacity = '1';
        videoNode.setAttribute(PROCESSED_ATTR, 'done');
        debugLog(`✅ Goal Match: "${title.substring(0, 30)}..."`);
        return;
    }

    let isTimedOut = false;
    const timer = setTimeout(() => {
        isTimedOut = true;
        videoNode.style.opacity = '1';
        videoNode.setAttribute(PROCESSED_ATTR, 'done');
    }, TIMEOUT_MS);

    chrome.runtime.sendMessage(
        { type: 'classify', title, goal: cachedFocusGoal },
        (response) => {
            clearTimeout(timer);
            if (isTimedOut) return;

            videoNode.setAttribute(PROCESSED_ATTR, 'done');

            const shouldShow =
                response && Object.prototype.hasOwnProperty.call(response, 'shouldShow')
                    ? response.shouldShow
                    : true;

            if (shouldShow) {
                videoNode.style.opacity = '1';
                debugLog(`✅ AI Allowed: "${title.substring(0, 30)}..."`);
            } else {
                videoNode.style.display = 'none';
                debugLog(`⛔ AI Blocked: "${title.substring(0, 30)}..."`);
            }
        }
    );
}

async function scanPage() {
    if (!isHomeFeed()) return;

    const videos = document.querySelectorAll('ytd-rich-item-renderer');
    for (const video of videos) {
        await processVideo(video);
    }
}

const debouncedScan = debounce(() => {
    scanPage().catch((err) => debugLog('Scan failed:', err));
}, DEBOUNCE_MS);

function attachObserver() {
    if (observer) {
        observer.disconnect();
    }

    const root = getFeedRoot();
    if (!root || !isHomeFeed()) {
        return;
    }

    observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)) {
                debouncedScan();
                return;
            }
        }
    });

    observer.observe(root, {
        childList: true,
        subtree: true
    });

    debouncedScan();
}

async function resetAndRescan() {
    const processedNodes = document.querySelectorAll(`[${PROCESSED_ATTR}]`);
    for (const node of processedNodes) {
        node.removeAttribute(PROCESSED_ATTR);
        node.style.display = '';
        node.style.opacity = '';
    }

    await refreshFocusGoal();
    attachObserver();
    debouncedScan();
}

async function init() {
    debugLog('Focus Engine v4.0 (Observer Mode)');
    await refreshFocusGoal();
    attachObserver();
    debouncedScan();

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, 'focusGoal')) {
            resetAndRescan().catch((err) => debugLog('Rescan after settings change failed:', err));
        }
    });

    window.addEventListener('yt-navigate-finish', () => {
        resetAndRescan().catch((err) => debugLog('Rescan after navigation failed:', err));
    });
}

init().catch((err) => debugLog('Initialization failed:', err));
