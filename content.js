'use strict';

let isRunning = false;
let config = null;
let refreshInterval = null;

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
 * Find a VTO slot that matches any of the user's targets
 * @returns {Element|null} The accept button element if found
 */
function findMatchingVtoSlot() {
  if (!config || !config.targets || config.targets.length === 0) return null;

  const pageType = getPageType();
  if (pageType !== 'vto') return null;

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
      for (const target of config.targets) {
        // Check date match (if date is specified)
        if (target.date) {
          const targetDateStr = formatDateForMatch(target.date);
          if (!dateText.includes(targetDateStr)) {
            continue; // Date doesn't match, try next target
          }
        }

        // Check time match
        if (matchesTimeRange(timeRange, target.startTime, target.endTime)) {
          // Find the Accept button using aria-label
          const acceptButton = card.querySelector('button[aria-label^="Accept"]');

          if (acceptButton) {
            console.log('[A-to-Z Auto] Found matching VTO:', dateText, timeRange);
            return acceptButton;
          } else {
            console.log('[A-to-Z Auto] Found matching slot but no accept button:', dateText, timeRange);
          }
        }
      }
    }
  }

  return null;
}

/**
 * Check if the confirmation dialog is open and click Accept VTO
 * @returns {boolean} True if dialog was found and clicked
 */
function handleConfirmationDialog() {
  const confirmButton = document.querySelector('button[data-test-id="VtoSummaryModal_acceptButton"]');
  if (confirmButton) {
    console.log('[A-to-Z Auto] Clicking confirmation dialog Accept VTO button...');
    confirmButton.click();
    return true;
  }
  return false;
}

function checkAndClick() {
  if (!isRunning) return;

  // First check if confirmation dialog is open
  if (handleConfirmationDialog()) {
    console.log('[A-to-Z Auto] VTO accepted! Stopping automation...');
    stopAutomation();
    return;
  }

  // Otherwise look for a matching VTO slot
  const acceptButton = findMatchingVtoSlot();

  if (acceptButton) {
    console.log('[A-to-Z Auto] Clicking Accept on matching VTO slot...');
    acceptButton.click();
    // Wait for dialog to appear, then check again
    setTimeout(() => checkAndClick(), 500);
  } else {
    console.log('[A-to-Z Auto] No matching VTO found, will refresh...');
  }
}

function startAutomation(newConfig) {
  config = newConfig;
  isRunning = true;

  // Check immediately
  checkAndClick();

  // Set up 2-second refresh interval
  if (!refreshInterval) {
    refreshInterval = setInterval(() => {
      if (isRunning) {
        console.log('[A-to-Z Auto] Refreshing page...');
        window.location.reload();
      }
    }, 2000);
  }

  const targetCount = config.targets?.length || 1;
  console.log(`[A-to-Z Auto] Started - watching ${targetCount} VTO target(s)`);
}

function stopAutomation() {
  isRunning = false;
  config = null;

  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }

  console.log('[A-to-Z Auto] Stopped');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start') {
    startAutomation(message.config);
    sendResponse({ success: true });
  } else if (message.action === 'stop') {
    stopAutomation();
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
    console.log('[A-to-Z Auto] Restoring automation...');
    startAutomation(savedConfig);
  }
}

setTimeout(() => restoreState(), 1000);
