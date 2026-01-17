'use strict';

const REFRESH_ALARM_NAME = 'atoz-refresh';
const REFRESH_INTERVAL_MINUTES = 0.5;

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM_NAME) {
    const tabs = await chrome.tabs.query({ url: '*://atoz.amazon.work/*' });
    for (const tab of tabs) {
      if (tab.id) {
        try {
          chrome.tabs.sendMessage(tab.id, { action: 'refresh' });
        } catch (err) {
          // Tab might be closed or not ready
          console.debug('Failed to send refresh to tab', tab.id, err);
        }
      }
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
