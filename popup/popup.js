'use strict';

const PageType = {
  VTO: 'vto',
  VET: 'vet',
  UNKNOWN: 'unknown'
};

function detectPageType(url) {
  if (!url) return PageType.UNKNOWN;
  if (url.includes('atoz.amazon.work/voluntary_time_off')) return PageType.VTO;
  if (url.includes('atoz.amazon.work/shifts/schedule/find')) return PageType.VET;
  return PageType.UNKNOWN;
}

function showSection(pageType) {
  document.getElementById('vto-section').classList.add('hidden');
  document.getElementById('vet-section').classList.add('hidden');
  document.getElementById('not-supported').classList.add('hidden');

  if (pageType === PageType.VTO) {
    document.getElementById('vto-section').classList.remove('hidden');
  } else if (pageType === PageType.VET) {
    document.getElementById('vet-section').classList.remove('hidden');
  } else {
    document.getElementById('not-supported').classList.remove('hidden');
  }
}

function updateStatus(pageType, isRunning) {
  const statusEl = document.getElementById(`${pageType}-status`);
  const startBtn = document.getElementById(`${pageType}-start`);
  const stopBtn = document.getElementById(`${pageType}-stop`);

  if (isRunning) {
    statusEl.textContent = 'Running...';
    statusEl.className = 'status running';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusEl.textContent = 'Stopped';
    statusEl.className = 'status stopped';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

async function startAutomation(pageType) {
  const dateInput = document.getElementById(`${pageType}-date`);
  const timeInput = document.getElementById(`${pageType}-time`);

  const config = {
    pageType: pageType,
    date: dateInput.value,
    time: timeInput.value,
    isRunning: true
  };

  await chrome.storage.local.set({ [pageType]: config });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'start', config: config });

  updateStatus(pageType, true);
}

async function stopAutomation(pageType) {
  const config = { isRunning: false };
  await chrome.storage.local.set({ [pageType]: config });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'stop' });

  updateStatus(pageType, false);
}

async function loadSavedState(pageType) {
  const result = await chrome.storage.local.get(pageType);
  const config = result[pageType];

  if (config) {
    if (config.date) {
      document.getElementById(`${pageType}-date`).value = config.date;
    }
    if (config.time) {
      document.getElementById(`${pageType}-time`).value = config.time;
    }
    if (config.isRunning) {
      updateStatus(pageType, true);
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageType = detectPageType(tab?.url);

  showSection(pageType);

  if (pageType !== PageType.UNKNOWN) {
    await loadSavedState(pageType);
  }

  document.getElementById('vto-start').addEventListener('click', () => startAutomation(PageType.VTO));
  document.getElementById('vto-stop').addEventListener('click', () => stopAutomation(PageType.VTO));
  document.getElementById('vet-start').addEventListener('click', () => startAutomation(PageType.VET));
  document.getElementById('vet-stop').addEventListener('click', () => stopAutomation(PageType.VET));
});
