'use strict';

const REFRESH_ALARM_NAME = 'atoz-refresh';
const REFRESH_INTERVAL_MINUTES = 0.5;

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM_NAME) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('atoz.amazon.work')) {
      chrome.tabs.sendMessage(tab.id, { action: 'refresh' });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startAlarm') {
    chrome.alarms.create(REFRESH_ALARM_NAME, {
      delayInMinutes: REFRESH_INTERVAL_MINUTES,
      periodInMinutes: REFRESH_INTERVAL_MINUTES
    });
    sendResponse({ success: true });
  } else if (message.action === 'stopAlarm') {
    chrome.alarms.clear(REFRESH_ALARM_NAME);
    sendResponse({ success: true });
  }
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('A-to-Z Auto extension installed');
});
