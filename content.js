// === CONFIG ===
const REPLACEMENT_ID = 'focus-replacement-grid';
const FEED_HIDE_CLASS = 'focus-feed-hidden';
const DEBUG_MODE = true;

function debugLog(...args) { if (DEBUG_MODE) console.log('[YouTube Focus]', ...args); }

// Detect Home Page
function isHomePage() {
    return location.pathname === '/' || location.pathname === '' || location.pathname.startsWith('/?');
}

// Find the main grid to hide
function findGridRenderer() {
    return document.querySelector('ytd-rich-grid-renderer');
}
function findBrowseContainer() {
    return document.querySelector('ytd-browse') || document.querySelector('ytd-two-column-browse-results-renderer');
}
function findMainGrid() { // backwards compatible fallback
    return findGridRenderer() || document.querySelector('#contents');
}

// Hide the Default YouTube Feed
function hideDefaultGrid() {
    const grid = findMainGrid();
    if (grid) {
        grid.classList.add(FEED_HIDE_CLASS);
    }
}

// Restore the Default Feed
function showDefaultGrid() {
    const grid = findMainGrid();
    if (grid) {
        grid.classList.remove(FEED_HIDE_CLASS);
    }
    const replacement = document.getElementById(REPLACEMENT_ID);
    if (replacement) replacement.remove();
}

// Create HTML for a Video Card (thumbnail + avatar + meta)
function createCard(video) {
    const a = document.createElement('a');
    a.className = 'focus-card';
    a.href = `https://www.youtube.com/watch?v=${video.id}`;

    a.innerHTML = `
        <div class="focus-thumb-wrap">
            <img class="focus-thumb" src="${video.thumbnail}" loading="lazy" alt="${escapeHtml(video.title)}">
        </div>
        <div class="focus-meta-row">
            <img class="focus-avatar" src="${video.avatar || ''}" alt="${escapeHtml(video.channel)}">
            <div class="focus-meta">
                <div class="focus-title">${escapeHtml(video.title)}</div>
                <div class="focus-channel">${escapeHtml(video.channel)}</div>
            </div>
        </div>
    `;
    return a;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"]/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}

// Inject the Custom Grid inside the browse container so scrolling works like native
function injectCustomFeed(videos) {
    const existing = document.getElementById(REPLACEMENT_ID);
    if (existing) return; // already injected

    const container = document.createElement('div');
    container.id = REPLACEMENT_ID;
    container.className = 'focus-replacement-grid';

    const inner = document.createElement('div');
    inner.className = 'focus-replacement-inner';

    videos.forEach(v => inner.appendChild(createCard(v)));
    container.appendChild(inner);

    const browse = findBrowseContainer();
    const grid = findGridRenderer();

    if (browse) {
        // Insert before the grid inside the browse container if possible
        if (grid && grid.parentElement === browse) {
            browse.insertBefore(container, grid);
        } else {
            // Otherwise append to browse - still inside main scrollable area
            browse.appendChild(container);
        }
    } else if (grid && grid.parentElement) {
        // Fallback to previous behavior
        grid.parentElement.insertBefore(container, grid);
    } else {
        document.body.appendChild(container);
    }
}

// Helper: safely traverse nested objects
function getTextFromRuns(node) {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node.simpleText) return node.simpleText;
    if (Array.isArray(node.runs) && node.runs.length > 0) return node.runs.map(r => r.text || r).join('');
    return '';
}

// Recursively collect all videoRenderer nodes in the JSON
function collectVideoRenderers(obj, out = []) {
    if (!obj || typeof obj !== 'object') return out;
    if (obj.videoRenderer && typeof obj.videoRenderer === 'object') {
        out.push(obj.videoRenderer);
    }
    for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        const val = obj[key];
        if (typeof val === 'object') collectVideoRenderers(val, out);
    }
    return out;
}

function getChannelAvatarFromRenderer(vr) {
    try {
        const cr = vr.channelThumbnailSupportedRenderers && vr.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer;
        if (cr && cr.thumbnail && Array.isArray(cr.thumbnail.thumbnails) && cr.thumbnail.thumbnails.length > 0) {
            return cr.thumbnail.thumbnails[cr.thumbnail.thumbnails.length - 1].url;
        }
        const ot = vr.ownerText && vr.ownerText.runs && vr.ownerText.runs[0] && vr.ownerText.runs[0].thumbnail;
        if (ot && Array.isArray(ot.thumbnails) && ot.thumbnails.length > 0) return ot.thumbnails[ot.thumbnails.length - 1].url;
        const lb = vr.longBylineText && vr.longBylineText.runs && vr.longBylineText.runs[0] && vr.longBylineText.runs[0].thumbnail;
        if (lb && Array.isArray(lb.thumbnails) && lb.thumbnails.length > 0) return lb.thumbnails[lb.thumbnails.length - 1].url;
    } catch (e) {
        // ignore
    }
    return '';
}

async function fetchMultipleVariants(goal) {
    const variants = [goal, `${goal} tutorial`, `${goal} course`];
    try {
        const results = await Promise.all(variants.map(q => fetchAndParseResults(q)));
        const map = new Map();
        for (const list of results) {
            for (const v of list) {
                if (!map.has(v.id)) map.set(v.id, v);
            }
        }
        const merged = Array.from(map.values());
        shuffleArray(merged);
        return merged.slice(0, 48);
    } catch (e) {
        console.error('[YouTube Focus] Error fetching variants', e);
        return [];
    }
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// Fetch Search Results (parse ytInitialData JSON and extract renderers)
async function fetchAndParseResults(query) {
    debugLog(`Fetching results for: ${query}`);
    try {
        const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
        const text = await response.text();

        // Extract ytInitialData JSON using regex (DOTALL enabled)
        const match = text.match(/var ytInitialData = (\{.*?\});/s);
        if (!match) {
            debugLog('[YouTube Focus] ytInitialData not found for query:', query);
            return [];
        }

        let data;
        try {
            data = JSON.parse(match[1]);
        } catch (e) {
            console.error('[YouTube Focus] Failed to parse ytInitialData JSON', e);
            return [];
        }

        // Collect videoRenderer objects from JSON
        const videoRenderers = collectVideoRenderers(data);
        const videos = [];

        for (const vr of videoRenderers) {
            const id = vr.videoId || (vr.navigationEndpoint && vr.navigationEndpoint.watchEndpoint && vr.navigationEndpoint.watchEndpoint.videoId) || '';
            if (!id) continue;
            if (id.toLowerCase().includes('shorts')) continue; // skip shorts

            const title = getTextFromRuns(vr.title) || (vr.title && vr.title.simpleText) || '';

            let thumbnail = '';
            if (vr.thumbnail && Array.isArray(vr.thumbnail.thumbnails) && vr.thumbnail.thumbnails.length > 0) {
                thumbnail = vr.thumbnail.thumbnails[vr.thumbnail.thumbnails.length - 1].url || vr.thumbnail.thumbnails[0].url || '';
            }

            const channel = getTextFromRuns(vr.longBylineText) || getTextFromRuns(vr.ownerText) || getTextFromRuns(vr.shortBylineText) || '';
            const avatar = getChannelAvatarFromRenderer(vr) || '';

            videos.push({ id, title: title.trim(), thumbnail, channel: channel.trim(), avatar });
        }

        debugLog(`[YouTube Focus] Found ${videos.length} videos for query: ${query}`);
        return videos;

    } catch (e) {
        console.error('[YouTube Focus] Fetch failed', e);
        return [];
    }
}

// Main Logic
async function runFocusMode() {
    if (!isHomePage()) return;

    // Prevent re-running if our replacement already exists
    if (document.getElementById(REPLACEMENT_ID)) return;

    chrome.storage.local.get(['focusGoal'], async (res) => {
        const goal = res.focusGoal;
        if (!goal) {
            // No goal set, ensure default feed visible
            showDefaultGrid();
            return;
        }

        // Fetch combined results first. Do NOT hide default grid yet to avoid blinking.
        let videos = [];
        try {
            videos = await fetchMultipleVariants(goal);
        } catch (e) {
            console.error('[YouTube Focus] Error fetching variants', e);
            videos = [];
        }

        if (videos && videos.length > 0) {
            // Found valid videos -> hide only the grid and inject our feed
            hideDefaultGrid();
            try {
                injectCustomFeed(videos);
                debugLog('[YouTube Focus] Injected custom feed with', videos.length, 'videos');
            } catch (e) {
                console.error('[YouTube Focus] Failed to inject custom feed', e);
                showDefaultGrid();
            }
        } else {
            // No results -> leave default grid alone and log
            console.warn('[YouTube Focus] No videos found for query:', goal);
            const replacement = document.getElementById(REPLACEMENT_ID);
            if (replacement) replacement.remove();
            showDefaultGrid();
            return;
        }
    });
}

// Listeners
window.addEventListener('load', runFocusMode);
// Run periodically because YouTube is a SPA (keeps simple approach)
setInterval(runFocusMode, 1000);

chrome.storage.onChanged.addListener((changes) => {
    if (changes.focusGoal) {
        // If goal changes, clear old feed and run again
        const replacement = document.getElementById(REPLACEMENT_ID);
        if (replacement) replacement.remove();
        runFocusMode();
    }
});