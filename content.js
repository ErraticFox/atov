'use strict';

let isRunning = false;
let config = null;
let sessionKeepAliveObserver = null;

/**
 * Handle the "Are you still there?" session timeout dialog
 * Clicks "Stay logged in" to prevent automatic logout
 * @returns {Promise<boolean>} True if dialog was found and handled
 */
function handleSessionTimeoutDialog() {
  return new Promise((resolve) => {
    // Look for the modal with "Are you still there?" title
    const modalTitle = document.querySelector('[data-test-component="StencilModalTitle"]');
    if (!modalTitle || !modalTitle.textContent.includes('Are you still there?')) {
      resolve(false);
      return;
    }

    console.log('[AtoV] Session timeout dialog detected');

    // Find the "Stay logged in" button
    const modal = modalTitle.closest('[data-test-component="StencilModal"]');
    if (!modal) {
      resolve(false);
      return;
    }

    const buttons = modal.querySelectorAll('[data-test-component="StencilReactButton"]');
    let stayLoggedInButton = null;

    for (const btn of buttons) {
      if (btn.textContent.includes('Stay logged in')) {
        stayLoggedInButton = btn;
        break;
      }
    }

    if (!stayLoggedInButton) {
      console.log('[AtoV] Could not find "Stay logged in" button');
      resolve(false);
      return;
    }

    console.log('[AtoV] Clicking "Stay logged in" button...');
    stayLoggedInButton.click();

    // Wait for dialog to disappear
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds max

    const checkInterval = setInterval(() => {
      attempts++;
      const dialogStillExists = document.querySelector('[data-test-component="StencilModalTitle"]');

      if (!dialogStillExists || !dialogStillExists.textContent.includes('Are you still there?')) {
        clearInterval(checkInterval);
        console.log('[AtoV] Session timeout dialog dismissed');
        resolve(true);
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.log('[AtoV] Timeout waiting for dialog to close');
        resolve(false);
      }
    }, 500);
  });
}

/**
 * Set up MutationObserver to watch for session timeout dialog
 */
function setupSessionKeepAlive() {
  if (sessionKeepAliveObserver) {
    return; // Already set up
  }

  console.log('[AtoV] Setting up session keep-alive observer');

  sessionKeepAliveObserver = new MutationObserver(async (mutations) => {
    // Check if any mutation added nodes that might be the dialog
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        // Check if the session timeout dialog appeared
        const modalTitle = document.querySelector('[data-test-component="StencilModalTitle"]');
        if (modalTitle && modalTitle.textContent.includes('Are you still there?')) {
          await handleSessionTimeoutDialog();
          break;
        }
      }
    }
  });

  // Observe the entire document for added nodes
  sessionKeepAliveObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Also check immediately in case dialog is already present
  handleSessionTimeoutDialog();
}

function getPageType() {
  const url = window.location.href;
  if (url.includes('voluntary_time_off')) return 'vto';
  if (url.includes('shifts/schedule/find')) return 'vet';
  return null;
}

/**
 * Convert 24h time string (HH:MM) to 12h format for matching
 */
function to12Hour(time24) {
  if (!time24) return '';
  const [hours, mins] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'pm' : 'am';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${mins.toString().padStart(2, '0')}${period}`;
}

/**
 * Parse a date string (YYYY-MM-DD) to match page date format (e.g., "Fri, Jan 16")
 */
function formatDateForMatch(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Check if a VTO slot matches a target time range
 */
function matchesTimeRange(slotTimeRange, targetStart, targetEnd) {
  if (!slotTimeRange || !targetStart || !targetEnd) return false;

  const targetStart12 = to12Hour(targetStart).toLowerCase();
  const targetEnd12 = to12Hour(targetEnd).toLowerCase();
  const slotLower = slotTimeRange.toLowerCase();

  // Check if both start and end times appear in the slot
  return slotLower.includes(targetStart12.replace(':00', ':00').replace(':0', ':')) &&
    slotLower.includes(targetEnd12.replace(':00', ':00').replace(':0', ':'));
}

/**
 * Parse 12h time string (e.g., "1:20am") to minutes since midnight
 */
function parse12HourToMinutes(time12) {
  const match = time12.toLowerCase().match(/(\d+):(\d+)(am|pm)/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const period = match[3];

  if (period === 'pm' && hours !== 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;

  return hours * 60 + mins;
}

/**
 * Parse 24h time string (e.g., "01:20") to minutes since midnight
 */
function parse24HourToMinutes(time24) {
  if (!time24) return null;
  const [hours, mins] = time24.split(':').map(Number);
  return hours * 60 + mins;
}

/**
 * Extract start and end times from slot time range (e.g., "1:20am - 1:50am")
 */
function parseSlotTimeRange(slotTimeRange) {
  const match = slotTimeRange.toLowerCase().match(/(\d+:\d+(?:am|pm))\s*-\s*(\d+:\d+(?:am|pm))/);
  if (!match) return null;
  return {
    start: parse12HourToMinutes(match[1]),
    end: parse12HourToMinutes(match[2])
  };
}

/**
 * Check if a VTO slot is within the user's shift time and meets min duration
 */
function isWithinShiftAndMinDuration(slotTimeRange, shiftTime, minDurationHours) {
  if (!slotTimeRange || !shiftTime?.start || !shiftTime?.end) return false;

  const slot = parseSlotTimeRange(slotTimeRange);
  if (!slot) return false;

  const shiftStart = parse24HourToMinutes(shiftTime.start);
  const shiftEnd = parse24HourToMinutes(shiftTime.end);

  if (shiftStart === null || shiftEnd === null) return false;

  // Check if slot is within shift time
  // Handle overnight shifts (shift end < shift start)
  let isWithinShift;
  if (shiftEnd > shiftStart) {
    // Normal shift (e.g., 9am - 5pm)
    isWithinShift = slot.start >= shiftStart && slot.end <= shiftEnd;
  } else {
    // Overnight shift (e.g., 10pm - 6am)
    isWithinShift = (slot.start >= shiftStart || slot.start < shiftEnd) &&
      (slot.end <= shiftEnd || slot.end > shiftStart);
  }

  if (!isWithinShift) return false;

  // Check minimum duration
  let durationMins = slot.end - slot.start;
  if (durationMins < 0) durationMins += 24 * 60; // Handle overnight VTO

  const minDurationMins = minDurationHours * 60;
  return durationMins >= minDurationMins;
}

/**
 * Find a VTO slot that matches any of the user's targets
 * @returns {Element|null} The accept button element if found
 */
let currentTargetIndex = -1;

/**
 * Find a VTO slot that matches any of the user's targets
 * @returns {Object|null} Object containing { element, targetIndex } if found, else null
 */
function findMatchingVtoSlot() {
  const pageType = getPageType();
  if (pageType !== 'vto') return null;

  const hasTargets = config?.targets && config.targets.length > 0;
  if (!hasTargets) return null;

  // Find all date groups (expanders)
  const expanders = document.querySelectorAll('[data-test-component="StencilExpander"]');

  for (const expander of expanders) {
    // Get the date header
    const dateHeader = expander.querySelector('[data-test-component="StencilH2"]');
    const dateText = dateHeader?.textContent?.trim() || '';

    // Find all VTO cards within this date group
    const cards = expander.querySelectorAll('[data-test-component="StencilReactCard"]');

    for (const card of cards) {
      // Get the time range text from the card
      const textElements = card.querySelectorAll('[data-test-component="StencilText"]');
      let timeRange = '';

      for (const el of textElements) {
        const text = el.textContent.trim();
        if (text.includes(' - ') && (text.includes('am') || text.includes('pm'))) {
          timeRange = text;
          break;
        }
      }

      // Check against each target
      for (let i = 0; i < config.targets.length; i++) {
        const target = config.targets[i];
        // Check date match (if date is specified)
        if (target.date) {
          const targetDateStr = formatDateForMatch(target.date);
          if (!dateText.includes(targetDateStr)) {
            continue; // Date doesn't match, try next target
          }
        }

        // Check if this target is "Accept Any" mode
        if (target.acceptAny) {
          // Accept Any: check if within shift time and meets min duration
          if (isWithinShiftAndMinDuration(timeRange, config.shiftTime, target.minDuration || 0)) {
            const acceptButton = card.querySelector('button[aria-label^="Accept"]');
            if (acceptButton) {
              console.log('[AtoV] Accept Any - Found VTO:', dateText, timeRange);
              return { element: acceptButton, targetIndex: i };
            }
          }
        } else {
          // Specific time match
          if (matchesTimeRange(timeRange, target.startTime, target.endTime)) {
            const acceptButton = card.querySelector('button[aria-label^="Accept"]');
            if (acceptButton) {
              console.log('[AtoV] Found matching VTO:', dateText, timeRange);
              return { element: acceptButton, targetIndex: i };
            } else {
              console.log('[AtoV] Found matching slot but no accept button:', dateText, timeRange);
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Wait for the dialog to update with success or failure message
 */
function waitForAcceptanceResult() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds (500ms * 20)

    const interval = setInterval(() => {
      attempts++;

      // Look for the modal body content
      const modalBody = document.querySelector('[data-test-component="StencilModalBody"]');
      if (!modalBody) {
        // If modal closed unexpectedly, maybe success? But usually it stays open with message.
        // Or if we can't find it, we stop trying after timeout
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          resolve({ status: 'unknown', message: 'Modal closed or not found' });
        }
        return;
      }

      const text = modalBody.innerText || modalBody.textContent;

      // Check for Success
      if (text.includes('successfully accepted') || text.includes('Successfully accepted')) {
        clearInterval(interval);
        resolve({ status: 'success' });
      }

      // Check for Failure
      else if (text.includes('Something went wrong') || text.includes('Full') || text.includes('full')) {
        clearInterval(interval);
        resolve({ status: 'failure', message: text });
      }

      // Timeout
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        resolve({ status: 'timeout' });
      }
    }, 500);
  });
}

/**
 * Check if the confirmation dialog is open and click Accept VTO
 * @returns {Promise<boolean>} True if dialog was found and clicked
 */
async function handleConfirmationDialog() {
  const confirmButton = document.querySelector('button[data-test-id="VtoSummaryModal_acceptButton"]');
  // Only click if it's visible and not disabled? (Usually always enabled)
  if (confirmButton) {
    console.log('[AtoV] Clicking confirmation dialog Accept VTO button...');
    confirmButton.click();

    // Now wait for the result
    console.log('[AtoV] Waiting for acceptance result...');
    const result = await waitForAcceptanceResult();

    if (result.status === 'success') {
      console.log('[AtoV] Success detected!');
      return true;
    } else {
      console.log('[AtoV] Failure or Unknown:', result);
      // Throw error or return false to indicate we shouldn't remove the item?
      // We should return false so the main loop stops but doesn't remove the item.
      if (result.status === 'failure') {
        alert('VTO Acceptance Failed: ' + (result.message || 'Unknown error'));
      }
      return false;
    }
  }
  return false;
}

async function removeAcceptedTarget() {
  if (currentTargetIndex === -1) return;

  try {
    const result = await chrome.storage.local.get('vto');
    const vtoData = result.vto || {};

    // We double check if we can remove
    // Note: vtoData.targets is the source of truth for the popup list.
    // config.targets was a snapshot or mapped version.
    // We assume index alignment.
    if (vtoData.targets && vtoData.targets.length > currentTargetIndex) {
      console.log(`[AtoV] Removing accepted target at index ${currentTargetIndex}`);
      vtoData.targets.splice(currentTargetIndex, 1);

      // Update config to match (and stop it)
      const newConfig = {
        ...config,
        targets: vtoData.targets,
        isRunning: false
      };

      // Save everything back to 'vto' key
      await chrome.storage.local.set({
        vto: { ...vtoData, targets: vtoData.targets, isRunning: false }
      });

      console.log('[AtoV] Target removed and storage updated.');
    }
  } catch (err) {
    console.error('[AtoV] Error removing accepted target:', err);
  }
}

async function checkAndClick() {
  if (!isRunning) return;

  // First check if confirmation dialog is open
  // This is now async
  const confirmButton = document.querySelector('button[data-test-id="VtoSummaryModal_acceptButton"]');
  if (confirmButton) {
    const success = await handleConfirmationDialog();
    if (success) {
      console.log('[AtoV] VTO accepted! Stopping automation and cleaning up...');
      await removeAcceptedTarget();
      stopAutomation();
    } else {
      console.log('[AtoV] VTO acceptance failed or timed out. Stopping automation.');
      stopAutomation();
    }
    return;
  }

  // Otherwise look for a matching VTO slot
  const match = findMatchingVtoSlot();

  if (match) {
    console.log('[AtoV] Clicking Accept on matching VTO slot...');
    currentTargetIndex = match.targetIndex;
    match.element.click();
    // Wait for dialog to appear, then check again
    setTimeout(() => checkAndClick(), 500);
  } else {
    // No match found, refresh immediately
    // No match found
    console.log('[AtoV] No matching VTO found');

    const now = Date.now();
    const CYCLE_DURATION = 80000; // 1m 20s
    const PAUSE_DURATION = 5000; // 5s

    if (!config.cycleStartTime) {
      config.cycleStartTime = now;
      saveConfig();
    }

    const elapsed = now - config.cycleStartTime;

    if (elapsed >= CYCLE_DURATION) {
      console.log(`[AtoV] Cycle complete (${elapsed}ms). Pausing for ${PAUSE_DURATION}ms...`);

      // Reset cycle start time for the next run (start counting after the pause)
      config.cycleStartTime = now + PAUSE_DURATION;
      saveConfig().then(() => {
        setTimeout(() => {
          console.log('[AtoV] Pause complete. Refreshing...');
          window.location.reload();
        }, PAUSE_DURATION);
      });
    } else {
      // Normal refresh
      console.log(`[AtoV] Cycle active (${elapsed}ms). Refreshing immediately...`);
      window.location.reload();
    }
  }
}

function startAutomation(newConfig) {
  config = newConfig;

  // Initialize cycle start time if not present (fresh start)
  if (!config.cycleStartTime) {
    config.cycleStartTime = Date.now();
  }

  isRunning = true;
  currentTargetIndex = -1;

  // Check immediately
  checkAndClick();

  const targetCount = config.targets?.length || 0;
  console.log(`[AtoV] Started - watching ${targetCount} VTO target(s)`);
}

async function saveConfig() {
  if (!config) return;
  const pageType = getPageType();
  if (!pageType) return;

  try {
    const result = await chrome.storage.local.get(pageType);
    const existing = result[pageType] || {};
    await chrome.storage.local.set({
      [pageType]: { ...existing, ...config }
    });
  } catch (err) {
    console.error('[AtoV] Error saving config:', err);
  }
}

function stopAutomation() {
  isRunning = false;
  config = null;
  console.log('[AtoV] Stopped');

  // Ensure we mark as stopped in storage so popup reflects it immediately if verified
  chrome.storage.local.get(['vto', 'vet'], (result) => {
    const pageType = getPageType();
    if (pageType && result[pageType]) {
      const updated = { ...result[pageType], isRunning: false };
      chrome.storage.local.set({ [pageType]: updated });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start') {
    startAutomation(message.config);
    sendResponse({ success: true });
  } else if (message.action === 'stop') {
    stopAutomation();
    sendResponse({ success: true });
  } else if (message.action === 'refresh') {
    console.log('[AtoV] Received refresh command from background script');
    window.location.reload();
    sendResponse({ success: true });
  }
  return true;
});

// Restore state on page load (with delay for SPA)
async function restoreState() {
  const pageType = getPageType();
  if (!pageType) return;

  const result = await chrome.storage.local.get(pageType);
  const savedConfig = result[pageType];

  if (savedConfig && savedConfig.isRunning) {
    console.log('[AtoV] Restoring automation...');
    startAutomation(savedConfig);
  }
}

// Initialize session keep-alive observer immediately
// This runs regardless of automation state to prevent unexpected logouts
setupSessionKeepAlive();

setTimeout(() => restoreState(), 1000);
