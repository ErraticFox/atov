'use strict';

let isRunning = false;
let config = null;

function getPageType() {
  const url = window.location.href;
  if (url.includes('voluntary_time_off')) return 'vto';
  if (url.includes('shifts/schedule/find')) return 'vet';
  return null;
}

function findTargetElement() {
  // TODO: Implement actual element detection based on page structure
  // This is a placeholder - update selectors based on actual A-to-Z DOM
  const pageType = getPageType();

  if (pageType === 'vto') {
    // Look for VTO opportunity elements
    const elements = document.querySelectorAll('[data-testid="vto-opportunity"], .vto-card, button[contains="Accept"]');
    return elements.length > 0 ? elements[0] : null;
  } else if (pageType === 'vet') {
    // Look for VET shift elements
    const elements = document.querySelectorAll('[data-testid="vet-shift"], .shift-card, button[contains="Pick Up"]');
    return elements.length > 0 ? elements[0] : null;
  }

  return null;
}

function matchesDateTimeFilter(element) {
  if (!config || !config.date || !config.time) return true;

  // TODO: Implement date/time matching based on element content
  // This is a placeholder - parse element text to extract date/time
  return true;
}

function checkAndClick() {
  if (!isRunning) return;

  const element = findTargetElement();

  if (element && matchesDateTimeFilter(element)) {
    console.log('[A-to-Z Auto] Found target element, clicking...');
    element.click();
    stopAutomation();
  } else {
    console.log('[A-to-Z Auto] Target element not found, will refresh...');
  }
}

function startAutomation(newConfig) {
  config = newConfig;
  isRunning = true;

  chrome.runtime.sendMessage({ action: 'startAlarm' });

  checkAndClick();

  console.log('[A-to-Z Auto] Automation started');
}

function stopAutomation() {
  isRunning = false;
  config = null;

  chrome.runtime.sendMessage({ action: 'stopAlarm' });

  console.log('[A-to-Z Auto] Automation stopped');
}

function refreshPage() {
  if (isRunning) {
    window.location.reload();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start') {
    startAutomation(message.config);
    sendResponse({ success: true });
  } else if (message.action === 'stop') {
    stopAutomation();
    sendResponse({ success: true });
  } else if (message.action === 'refresh') {
    refreshPage();
    sendResponse({ success: true });
  }
  return true;
});

// Restore state on page load
async function restoreState() {
  const pageType = getPageType();
  if (!pageType) return;

  const result = await chrome.storage.local.get(pageType);
  const savedConfig = result[pageType];

  if (savedConfig && savedConfig.isRunning) {
    startAutomation(savedConfig);
  }
}

restoreState();
