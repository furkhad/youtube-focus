// === CONFIG ===
const DEBUG_MODE = true;
const TIMEOUT_MS = 3000;
const PROCESSED_ATTR = 'data-focus-processed';

// 1. UNIVERSAL BLACKLIST
const BLACKLIST = ['Mix -', 'Music', 'Song', 'Lyrics', 'Live', 'Official', 'Shorts', 'Gameplay', 'React', 'Prank', 'ASMR', 'vs', 'Trailer'];

// 2. EXPANDED STOP WORDS (To get clean keywords from your goal)
const STOP_WORDS = [
    'i', 'want', 'to', 'learn', 'how', 'about', 'the', 'and', 'for', 'in', 'on', 'with', 'best', 'top',
'what', 'is', 'a', 'an', 'make', 'do', 'get', 'watch', 'video', 'tutorial', 'guide', 'complete',
'beginner', 'advanced', 'course', 'full'
];

function debugLog(...args) { if (DEBUG_MODE) console.log('[YouTube Focus]', ...args); }

function getVideoTitle(node) {
    let el = node.querySelector('#video-title');
    if (el && el.innerText.trim()) return el.innerText.trim();
    el = node.querySelector('a#video-title-link');
    if (el && el.title) return el.title;
    el = node.querySelector('a[aria-label]');
    if (el && el.getAttribute('aria-label')) return el.getAttribute('aria-label').split(' by ')[0];
    return null;
}

// Smart Extractor
function getDynamicKeywords(goalPhrase) {
    if (!goalPhrase) return [];
    return goalPhrase.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/) // Split by space
    .filter(w => !STOP_WORDS.includes(w) && w.length > 2); // Remove common words
}

async function processVideo(videoNode) {
    if (videoNode.getAttribute(PROCESSED_ATTR)) return;
    videoNode.setAttribute(PROCESSED_ATTR, 'pending');

    const title = getVideoTitle(videoNode);
    if (!title) {
        videoNode.removeAttribute(PROCESSED_ATTR);
        return;
    }

    // 1. Blacklist Check
    if (BLACKLIST.some(w => title.includes(w))) {
        videoNode.style.display = 'none';
        videoNode.setAttribute(PROCESSED_ATTR, 'done');
        return;
    }

    // 2. Prepare Ghost Mode
    videoNode.style.opacity = '0.4';
    videoNode.style.transition = 'opacity 0.3s ease';

    const { focusGoal } = await chrome.storage.local.get('focusGoal');
    if (!focusGoal) {
        videoNode.style.opacity = '1';
        videoNode.setAttribute(PROCESSED_ATTR, 'done');
        return;
    }

    // === LEVEL 1: SMART KEYWORD MATCHING ===
    const userKeywords = getDynamicKeywords(focusGoal);
    const lowerTitle = title.toLowerCase();

    // If title matches extracted keywords -> INSTANT SHOW
    if (userKeywords.some(keyword => lowerTitle.includes(keyword))) {
        videoNode.style.opacity = '1';
        videoNode.setAttribute(PROCESSED_ATTR, 'done');
        debugLog(`✅ Goal Match: "${title.substring(0, 30)}..."`);
        return;
    }

    // === LEVEL 2: AI JUDGMENT ===
    let isTimedOut = false;
    const timer = setTimeout(() => {
        isTimedOut = true;
        // Fail-safe: Show video if AI is stuck
        videoNode.style.opacity = '1';
        videoNode.setAttribute(PROCESSED_ATTR, 'done');
    }, TIMEOUT_MS);

    chrome.runtime.sendMessage(
        { type: 'classify', title: title, goal: focusGoal },
        (response) => {
            clearTimeout(timer);
            if (isTimedOut) return;

            videoNode.setAttribute(PROCESSED_ATTR, 'done');

            const shouldShow = response && response.hasOwnProperty('shouldShow') ? response.shouldShow : true;

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

function scanPage() {
    if (location.pathname !== '/' && location.pathname !== '') return;
    const videos = document.querySelectorAll('ytd-rich-item-renderer');
    videos.forEach(processVideo);
}

debugLog('Focus Engine v3.2 (Zero Tolerance)');
scanPage();
setInterval(scanPage, 1000);
window.addEventListener('scroll', scanPage, { passive: true });
