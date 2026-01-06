/**
 * Popup Script - Smart-Context Scoring Engine
 * 
 * Handles user input for intelligent filtering with proper sanitization
 * and error handling for Chrome Extension context invalidation
 */

// ============================================================================
// SECURITY & SANITIZATION
// ============================================================================

/**
 * Sanitizes user input to prevent injection attacks
 * Removes potentially dangerous characters while preserving natural language input
 * @param {string} input - Raw user input (focus goal)
 * @returns {string} Sanitized string safe for storage
 */
function sanitizeInput(input) {
    if (!input || typeof input !== 'string') return '';
    
    // Remove any HTML tags and script tags
    // Keep natural language characters, punctuation, and spaces
    return input
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>\"']/g, '') // Remove potentially dangerous characters
        .trim();
}

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

/**
 * Saves focus goal to Chrome storage with error handling
 * Handles cases where extension context might be invalidated
 */
function saveFocusGoal() {
    const textareaElement = document.getElementById('focusGoal');
    const statusElement = document.getElementById('status');
    
    if (!textareaElement) {
        console.error('Focus goal textarea element not found');
        return;
    }
    
    const rawInput = textareaElement.value;
    const sanitizedGoal = sanitizeInput(rawInput);
    
    // Validate that user has entered a goal
    if (!sanitizedGoal || sanitizedGoal.length === 0) {
        statusElement.textContent = 'Please enter your focus goal.';
        statusElement.className = 'status error';
        statusElement.style.display = 'block';
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 3000);
        return;
    }
    
    // Error handling: Extension context might be invalidated
    try {
        chrome.storage.local.set({ focusGoal: sanitizedGoal }, () => {
            // Check for runtime errors
            if (chrome.runtime.lastError) {
                console.error('Storage error:', chrome.runtime.lastError);
                statusElement.textContent = 'Error saving settings. Please try again.';
                statusElement.className = 'status error';
                statusElement.style.display = 'block';
                setTimeout(() => {
                    statusElement.style.display = 'none';
                }, 3000);
                return;
            }
            
            // Success feedback
            statusElement.textContent = 'Settings saved! Reload YouTube to see changes.';
            statusElement.className = 'status';
            statusElement.style.display = 'block';
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 3000);
        });
    } catch (error) {
        // Handle cases where chrome.storage API is unavailable
        console.error('Storage API error:', error);
        statusElement.textContent = 'Error: Extension context invalidated. Please reload the extension.';
        statusElement.className = 'status error';
        statusElement.style.display = 'block';
    }
}

/**
 * Loads saved focus goal from Chrome storage
 * Handles errors gracefully
 */
function loadFocusGoal() {
    const textareaElement = document.getElementById('focusGoal');
    
    if (!textareaElement) {
        console.error('Focus goal textarea element not found');
        return;
    }
    
    // Error handling: Extension context might be invalidated
    try {
        chrome.storage.local.get(['focusGoal'], (result) => {
            // Check for runtime errors
            if (chrome.runtime.lastError) {
                console.error('Storage retrieval error:', chrome.runtime.lastError);
                // Don't show error to user, just use default empty textarea
                return;
            }
            
            // Populate textarea with saved goal
            if (result.focusGoal && typeof result.focusGoal === 'string') {
                textareaElement.value = result.focusGoal;
            }
        });
    } catch (error) {
        // Handle cases where chrome.storage API is unavailable
        console.error('Storage API error:', error);
        // Silently fail - user can still enter new goal
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Initialize popup when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('saveBtn');
    
    if (saveButton) {
        saveButton.addEventListener('click', saveFocusGoal);
    } else {
        console.error('Save button element not found');
    }
    
    // Load saved settings when popup opens
    loadFocusGoal();
    
    // Allow saving with Ctrl+Enter or Cmd+Enter
    const goalTextarea = document.getElementById('focusGoal');
    if (goalTextarea) {
        goalTextarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                saveFocusGoal();
            }
        });
    }
});
