/**
 * YouTube Content Script - Smart-Context Scoring Engine (Strict Mode)
 * Non-Destructive "Tag & Hide" Architecture
 * 
 * This script cleans up the YouTube interface by:
 * 1. Hiding the "Shorts" button
 * 2. Using a pure JavaScript scoring engine with STRICT whitelisting
 * 3. Zero-latency filtering with adaptive intent recognition
 * 
 * Performance: Uses debounced MutationObserver and O(1) Set lookups for maximum speed
 * Intelligence: Adapts blocklist based on user intent (e.g., "meme" becomes positive if user wants memes)
 * Strictness: Videos MUST contain at least one keyword match to be shown (Scorched Earth approach)
 * Stability: Uses CSS classes instead of DOM manipulation to avoid React Virtual DOM conflicts
 */

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

/**
 * Global blocklist of distraction words
 * These words cause -50 points (strong negative signal)
 * Uses Set for O(1) lookup performance
 */
const GLOBAL_BLOCKLIST = new Set([
    'shorts',
    'prank',
    'reaction',
    'gameplay',
    'gossip',
    'meme',
    'viral',
    'challenge'
]);

/**
 * Stopwords to remove from user input
 * These are filler words that don't carry semantic meaning
 * Enhanced with common verbs/fillers to extract only the subject
 * Uses Set for O(1) lookup performance
 */
const STOPWORDS = new Set([
    'i', 'want', 'to', 'see', 'show', 'me', 'only', 'about', 'videos',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
    // Common verbs/fillers that should be filtered out
    'learn', 'learning', 'watch', 'watching', 'looking', 'find', 'search', 'need'
]);

// Scoring constants
const SCORE_RELEVANT = 20;  // Points for matching user's core topics
const SCORE_BLOCKED = -50;  // Points for matching blocklist (overrides relevance)

// Retry configuration for empty feed detection
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Debug mode (set to false to disable verbose logging)
const DEBUG_MODE = true;

// CSS class names for the "Tag & Hide" architecture
const CLASS_CHECKED = 'focus-checked';  // Marks element as processed (prevents infinite loops)
const CLASS_HIDDEN = 'focus-hidden';    // Hides the element
const CLASS_BLUR = 'focus-blur';         // Optional blur effect (not used by default)

// ============================================================================
// CSS INJECTION (THE STABILIZER)
// ============================================================================

/**
 * Injects CSS styles into the document head
 * This is the stabilizer that prevents DOM conflicts with YouTube's React Virtual DOM
 * Uses !important to override YouTube's inline styles
 */
function injectFocusStyles() {
    // Check if styles are already injected
    if (document.getElementById('youtube-focus-styles')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'youtube-focus-styles';
    style.textContent = `
        /* YouTube Focus Extension Styles - Non-Destructive Hiding */
        .${CLASS_HIDDEN} {
            display: none !important;
        }
        
        /* Optional blur effect (currently disabled, but available) */
        .${CLASS_BLUR} {
            opacity: 0.1 !important;
            filter: blur(5px) !important;
            pointer-events: none !important;
        }
        
        /* Marker class - no styles, just for tracking */
        .${CLASS_CHECKED} {
            /* This class marks elements as processed */
        }
    `;
    
    // Inject into head
    const head = document.head || document.getElementsByTagName('head')[0];
    if (head) {
        head.appendChild(style);
        debugLog('Injected focus styles into document head');
    } else {
        // Fallback: wait for head to be available
        setTimeout(() => {
            const headElement = document.head || document.getElementsByTagName('head')[0];
            if (headElement) {
                headElement.appendChild(style);
                debugLog('Injected focus styles (delayed)');
            }
        }, 100);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Debounce function to limit how often a function executes
 * Critical for SPA performance: YouTube updates DOM constantly, so we batch operations
 * @param {Function} func - The function to debounce
 * @param {number} wait - Wait time in milliseconds (500ms for optimal performance)
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Normalizes a string for comparison (handles edge cases)
 * - Converts to lowercase for case-insensitive matching
 * - Trims whitespace
 * - Handles multiple spaces
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extracts words from a string, normalizing and filtering
 * @param {string} text - Text to extract words from
 * @returns {Array<string>} Array of normalized words
 */
function extractWords(text) {
    if (!text || typeof text !== 'string') return [];
    
    const normalized = normalizeString(text);
    // Split by whitespace and punctuation, filter empty strings
    return normalized
        .split(/[\s\.,!?;:()\[\]{}'"]+/)
        .filter(word => word.length > 0);
}

/**
 * Debug logging function
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log('[YouTube Focus]', ...args);
    }
}

// ============================================================================
// NON-DESTRUCTIVE HIDING MECHANISM (TAG & HIDE)
// ============================================================================

/**
 * Checks if an element has already been processed
 * This prevents infinite loops with YouTube's React Virtual DOM
 * Uses O(1) classList.contains() for maximum performance
 * 
 * @param {Element} element - The element to check
 * @returns {boolean} True if element has been processed
 */
function isElementProcessed(element) {
    if (!element || !element.classList) {
        return false;
    }
    return element.classList.contains(CLASS_CHECKED);
}

/**
 * Hides a video element using CSS classes (non-destructive)
 * Adds both focus-checked and focus-hidden classes
 * This method doesn't conflict with YouTube's React Virtual DOM
 * 
 * @param {Element} element - The element to hide
 */
function hideVideoElement(element) {
    if (!element || !element.classList) {
        return;
    }
    
    try {
        // Add checked marker to prevent reprocessing
        element.classList.add(CLASS_CHECKED);
        // Add hidden class to hide the element
        element.classList.add(CLASS_HIDDEN);
        // Remove blur class if present (cleanup)
        element.classList.remove(CLASS_BLUR);
    } catch (error) {
        console.error('YouTube Focus: Failed to hide element', error);
    }
}

/**
 * Shows a video element (removes hidden state)
 * Keeps the focus-checked class to prevent reprocessing
 * 
 * @param {Element} element - The element to show
 */
function showVideoElement(element) {
    if (!element || !element.classList) {
        return;
    }
    
    try {
        // Add checked marker to prevent reprocessing
        element.classList.add(CLASS_CHECKED);
        // Remove hidden class to show the element
        element.classList.remove(CLASS_HIDDEN);
        // Remove blur class if present (cleanup)
        element.classList.remove(CLASS_BLUR);
    } catch (error) {
        console.error('YouTube Focus: Failed to show element', error);
    }
}

/**
 * Resets all focus classes from an element
 * Used when user clears their goal
 * 
 * @param {Element} element - The element to reset
 */
function resetVideoElement(element) {
    if (!element || !element.classList) {
        return;
    }
    
    try {
        element.classList.remove(CLASS_CHECKED);
        element.classList.remove(CLASS_HIDDEN);
        element.classList.remove(CLASS_BLUR);
    } catch (error) {
        console.error('YouTube Focus: Failed to reset element', error);
    }
}

// ============================================================================
// SMART GOAL PARSING
// ============================================================================

/**
 * Parses user goal string to extract core topics
 * Removes stopwords and returns meaningful keywords
 * 
 * Example: "I want to learn Python" -> ["python"] (not ["learn", "python"])
 * 
 * @param {string} goalString - User's focus goal text
 * @returns {Set<string>} Set of core topic words (for O(1) lookup)
 */
function parseUserGoal(goalString) {
    if (!goalString || typeof goalString !== 'string') {
        return new Set();
    }
    
    const words = extractWords(goalString);
    
    // Filter out stopwords and very short words (less than 2 characters)
    const coreTopics = words
        .filter(word => word.length >= 2 && !STOPWORDS.has(word));
    
    debugLog('Parsed goal:', goalString, '-> Topics:', Array.from(coreTopics));
    
    return new Set(coreTopics);
}

/**
 * Applies Intent Override: Removes user's core topics from blocklist
 * If user explicitly mentions a blocklist word, it becomes a positive signal
 * 
 * Example: User says "Show me memes" -> "meme" is removed from blocklist
 * 
 * @param {Set<string>} coreTopics - User's core topics
 * @param {Set<string>} blocklist - Global blocklist to modify
 * @returns {Set<string>} Modified blocklist with user topics removed
 */
function applyIntentOverride(coreTopics, blocklist) {
    // Create a copy of the blocklist to avoid mutating the original
    const modifiedBlocklist = new Set(blocklist);
    
    // Remove any user topics from blocklist (they become positive signals)
    let removedCount = 0;
    coreTopics.forEach(topic => {
        if (modifiedBlocklist.has(topic)) {
            modifiedBlocklist.delete(topic);
            removedCount++;
            debugLog('Intent Override: Removed "' + topic + '" from blocklist');
        }
    });
    
    if (removedCount > 0) {
        debugLog('Intent Override: Removed', removedCount, 'topics from blocklist');
    }
    
    return modifiedBlocklist;
}

// ============================================================================
// ROBUST TITLE EXTRACTION
// ============================================================================

/**
 * Robustly extracts video title from a container element
 * YouTube often delays rendering titles, so we try multiple selectors
 * 
 * @param {Element} container - Video container element (ytd-rich-item-renderer)
 * @returns {string|null} Video title text or null if not found
 */
function extractVideoTitle(container) {
    if (!container) return null;
    
    // Try multiple selectors in order of reliability
    const selectors = [
        '#video-title',                    // Primary selector
        'a#video-title',                   // Anchor variant
        'a[id="video-title"]',             // Attribute selector
        'yt-formatted-string#video-title',  // YouTube's formatted string variant
        'h3 a',                            // Fallback: h3 with anchor
        'a[aria-label]'                    // Fallback: anchor with aria-label
    ];
    
    for (const selector of selectors) {
        const titleElement = container.querySelector(selector);
        
        if (titleElement) {
            // Try multiple text extraction methods
            const titleText = titleElement.innerText || 
                             titleElement.textContent || 
                             titleElement.getAttribute('aria-label') || 
                             titleElement.getAttribute('title') || 
                             '';
            
            if (titleText.trim().length > 0) {
                return titleText.trim();
            }
        }
    }
    
    return null;
}

// ============================================================================
// SCORING ENGINE (STRICT MODE)
// ============================================================================

/**
 * Checks if video title contains at least one keyword from user's core topics
 * STRICT REQUIREMENT: Video must have at least one positive match
 * 
 * @param {string} videoTitle - The video title to check
 * @param {Set<string>} coreTopics - User's core topics (Set for O(1) lookup)
 * @returns {boolean} True if title contains at least one core topic
 */
function hasPositiveKeywordMatch(videoTitle, coreTopics) {
    if (!videoTitle || coreTopics.size === 0) {
        return false;
    }
    
    const titleWords = extractWords(videoTitle);
    
    // Check if any word in the title matches a core topic
    for (const word of titleWords) {
        if (coreTopics.has(word)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Evaluates a video title using the Smart-Context Scoring Engine (Strict Mode)
 * Pure JavaScript, zero-latency evaluation
 * 
 * STRICT WHITELISTING RULES:
 * 1. Video MUST contain at least one keyword from user's core topics (positive match)
 * 2. If positive match exists, apply scoring:
 *    - +20 points: Each matching core topic word
 *    - -50 points: Each matching blocklist word (strong negative)
 * 3. If NO positive match: HIDE immediately (Scorched Earth)
 * 
 * @param {string} videoTitle - The video title to evaluate
 * @param {Set<string>} coreTopics - User's core topics (Set for O(1) lookup)
 * @param {Set<string>} blocklist - Modified blocklist (after intent override)
 * @returns {Object} Evaluation result with {shouldShow: boolean, score: number, hasPositiveMatch: boolean}
 */
function evaluateVideo(videoTitle, coreTopics, blocklist) {
    if (!videoTitle || typeof videoTitle !== 'string') {
        return { shouldShow: false, score: SCORE_BLOCKED, hasPositiveMatch: false };
    }
    
    // STRICT CHECK: Must have at least one positive keyword match
    const hasPositiveMatch = hasPositiveKeywordMatch(videoTitle, coreTopics);
    
    // Scorched Earth: If no positive match, hide immediately
    if (!hasPositiveMatch) {
        return { shouldShow: false, score: SCORE_BLOCKED, hasPositiveMatch: false };
    }
    
    // If we have a positive match, calculate detailed score
    const titleWords = extractWords(videoTitle);
    let score = 0;
    let positiveMatches = 0;
    let negativeMatches = 0;
    
    // Check each word in the title
    for (const word of titleWords) {
        // Check if word matches user's core topics (+20 points)
        if (coreTopics.has(word)) {
            score += SCORE_RELEVANT;
            positiveMatches++;
        }
        
        // Check if word is in blocklist (-50 points, strong negative)
        if (blocklist.has(word)) {
            score += SCORE_BLOCKED;
            negativeMatches++;
        }
    }
    
    // Final decision: Show if score >= 0 (positive matches can outweigh negatives)
    const shouldShow = score >= 0;
    
    return {
        shouldShow,
        score,
        hasPositiveMatch: true,
        positiveMatches,
        negativeMatches
    };
}

// ============================================================================
// DOM MANIPULATION FUNCTIONS
// ============================================================================

/**
 * Removes the YouTube Shorts button from the navigation
 * Uses CSS class method to avoid React Virtual DOM conflicts
 */
function removeShorts() {
    // YouTube uses this selector for the Shorts link in the left sidebar
    const shortsButton = document.querySelector('a[title="Shorts"]');
    
    if (shortsButton && !shortsButton.classList.contains(CLASS_CHECKED)) {
        try {
            // Use class-based hiding to avoid React conflicts
            shortsButton.classList.add(CLASS_CHECKED);
            shortsButton.classList.add(CLASS_HIDDEN);
            debugLog('Hidden Shorts button using CSS classes');
        } catch (error) {
            console.error('YouTube Focus: Failed to hide Shorts button', error);
        }
    }
}

/**
 * Filters videos in the Home Feed using the Smart-Context Scoring Engine (Strict Mode)
 * Pure JavaScript, synchronous execution for zero-latency filtering
 * Uses strict whitelist approach: videos MUST have positive keyword match to be shown
 * 
 * CRITICAL: Uses "Tag & Hide" architecture to prevent infinite MutationObserver loops
 * 
 * @param {number} retryCount - Current retry attempt (for empty feed handling)
 */
function filterVideos(retryCount = 0) {
    // Error handling: Extension context might be invalidated
    try {
        chrome.storage.local.get(['focusGoal'], (result) => {
            // Additional try-catch inside callback to handle async errors
            try {
                // Get user's focus goal
                const userGoal = result.focusGoal;
                
                // If no goal is set, show all videos (don't filter)
                if (!userGoal || typeof userGoal !== 'string' || userGoal.trim().length === 0) {
                    debugLog('No goal set, showing all videos');
                    // Reset all videos to visible if no goal is set
                    const videoContainers = document.querySelectorAll('ytd-rich-item-renderer');
                    videoContainers.forEach(container => {
                        resetVideoElement(container);
                    });
                    return;
                }
                
                // Parse user goal to extract core topics
                const coreTopics = parseUserGoal(userGoal);
                
                // Apply Intent Override: Remove user topics from blocklist
                const activeBlocklist = applyIntentOverride(coreTopics, GLOBAL_BLOCKLIST);
                
                // If no core topics after parsing, show all videos
                if (coreTopics.size === 0) {
                    debugLog('No core topics extracted, showing all videos');
                    const videoContainers = document.querySelectorAll('ytd-rich-item-renderer');
                    videoContainers.forEach(container => {
                        resetVideoElement(container);
                    });
                    return;
                }
                
                // YouTube uses 'ytd-rich-item-renderer' for Home Feed video items
                // This selector targets the container for each video card
                const videoContainers = document.querySelectorAll('ytd-rich-item-renderer');
                
                debugLog(`Found ${videoContainers.length} videos`);
                
                // Empty feed detection: Retry if no videos found
                if (videoContainers.length === 0 && retryCount < MAX_RETRIES) {
                    debugLog(`Empty feed detected, retrying in ${RETRY_DELAY}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                    setTimeout(() => {
                        filterVideos(retryCount + 1);
                    }, RETRY_DELAY);
                    return;
                }
                
                if (videoContainers.length === 0) {
                    debugLog('No videos found after', MAX_RETRIES, 'retries');
                    return;
                }
                
                let shownCount = 0;
                let hiddenCount = 0;
                let skippedCount = 0;
                
                // Process all videos synchronously (zero latency, instant filtering)
                videoContainers.forEach((container, index) => {
                    // STEP 1: Check if already processed (prevents infinite loop)
                    if (isElementProcessed(container)) {
                        skippedCount++;
                        return; // Skip already processed elements
                    }
                    
                    // Robustly extract title (handles delayed rendering)
                    const titleText = extractVideoTitle(container);
                    
                    if (!titleText) {
                        // Hide videos with no title (edge case)
                        hideVideoElement(container);
                        hiddenCount++;
                        debugLog(`Video ${index + 1}: No title found -> HIDDEN`);
                        return;
                    }
                    
                    // STEP 2: Evaluate video using Smart-Context Scoring Engine (Strict Mode)
                    const evaluation = evaluateVideo(titleText, coreTopics, activeBlocklist);
                    
                    // STEP 3: Apply classes based on evaluation result
                    if (!evaluation.shouldShow) {
                        // HIDDEN: Add focus-checked AND focus-hidden
                        hideVideoElement(container);
                        hiddenCount++;
                        debugLog(`Strict Check: "${titleText.substring(0, 50)}..." -> Match? ${evaluation.hasPositiveMatch} (Score: ${evaluation.score}) -> HIDDEN`);
                    } else {
                        // SHOWN: Add focus-checked only
                        showVideoElement(container);
                        shownCount++;
                        debugLog(`Strict Check: "${titleText.substring(0, 50)}..." -> Match? ${evaluation.hasPositiveMatch} (Score: ${evaluation.score}, +${evaluation.positiveMatches}, -${evaluation.negativeMatches}) -> SHOWN`);
                    }
                });
                
                debugLog(`Filtering complete: ${shownCount} shown, ${hiddenCount} hidden, ${skippedCount} skipped (already processed)`);
                
            } catch (error) {
                // Silently handle errors in callback (extension context might be invalidated)
                console.error('YouTube Focus: Error filtering videos', error);
            }
        });
    } catch (error) {
        // Handle cases where chrome.storage API is unavailable
        console.error('YouTube Focus: Storage API error', error);
    }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

/**
 * Main filter function that runs both cleanup operations
 * This is the function that gets debounced
 */
function applyFilters() {
    removeShorts();
    filterVideos();
}

// Create debounced version of applyFilters
// 500ms delay prevents lag while still being responsive to DOM changes
const debouncedApplyFilters = debounce(applyFilters, 500);

// Inject CSS styles first (the stabilizer)
injectFocusStyles();

// Run immediately on page load (no debounce needed for initial load)
applyFilters();

// Set up MutationObserver to handle YouTube's dynamic content loading
// YouTube is an SPA that loads new videos as you scroll (infinite scroll)
// We observe the entire body with subtree to catch all DOM changes
const observer = new MutationObserver(() => {
    // Use debounced version to prevent excessive filtering operations
    debouncedApplyFilters();
});

// Start observing DOM changes
// childList: true - Watch for added/removed child nodes
// subtree: true - Watch all descendants, not just direct children
observer.observe(document.body, {
    childList: true,
    subtree: true
});

debugLog('🚀 YouTube Focus extension is active! (Strict Mode - Non-Destructive Tag & Hide Architecture)');
