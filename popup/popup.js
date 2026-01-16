'use strict';

const PageType = {
  VTO: 'vto',
  VET: 'vet',
  UNKNOWN: 'unknown'
};

let vtoTargetCount = 0;

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

function updateStatus(pageType, isRunning, targetCount = 0) {
  const statusEl = document.getElementById(`${pageType}-status`);
  const startBtn = document.getElementById(`${pageType}-start`);
  const stopBtn = document.getElementById(`${pageType}-stop`);

  if (isRunning) {
    statusEl.textContent = `Running... Watching ${targetCount} target(s)`;
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

/**
 * Create a new VTO target entry element
 */
function createVtoTargetEntry(data = {}) {
  vtoTargetCount++;
  const entry = document.createElement('div');
  entry.className = 'vto-target-entry';
  entry.dataset.id = vtoTargetCount;

  entry.innerHTML = `
    <div class="vto-target-header">
      <span class="vto-target-num">Target #${vtoTargetCount}</span>
      <button class="vto-target-remove" title="Remove">×</button>
    </div>
    <div class="vto-target-fields">
      <div class="form-group">
        <label>Date (optional)</label>
        <input type="date" class="vto-date" value="${data.date || ''}">
      </div>
      <div class="vto-time-row">
        <div class="form-group">
          <label>Start Time</label>
          <input type="time" class="vto-start" value="${data.startTime || ''}">
        </div>
        <div class="form-group">
          <label>End Time</label>
          <input type="time" class="vto-end" value="${data.endTime || ''}">
        </div>
      </div>
    </div>
  `;

  // Add remove handler
  entry.querySelector('.vto-target-remove').addEventListener('click', () => {
    entry.remove();
    renumberVtoTargets();
    saveVtoTargets();
  });

  // Auto-save on input change
  entry.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => saveVtoTargets());
  });

  return entry;
}

/**
 * Renumber VTO targets after removal
 */
function renumberVtoTargets() {
  const entries = document.querySelectorAll('.vto-target-entry');
  entries.forEach((entry, index) => {
    entry.querySelector('.vto-target-num').textContent = `Target #${index + 1}`;
  });
}

/**
 * Get all VTO targets from the form (includes partial entries for saving)
 */
function getVtoTargets(includePartial = false) {
  const entries = document.querySelectorAll('.vto-target-entry');
  const targets = [];

  entries.forEach(entry => {
    const date = entry.querySelector('.vto-date').value;
    const startTime = entry.querySelector('.vto-start').value;
    const endTime = entry.querySelector('.vto-end').value;

    if (includePartial || (startTime && endTime)) {
      targets.push({ date, startTime, endTime });
    }
  });

  return targets;
}

/**
 * Save VTO targets to local storage
 */
async function saveVtoTargets() {
  const targets = getVtoTargets(true);
  const result = await chrome.storage.local.get('vto');
  const existing = result.vto || {};
  await chrome.storage.local.set({
    vto: { ...existing, targets }
  });
}

async function startAutomation(pageType) {
  if (pageType === PageType.VTO) {
    const targets = getVtoTargets();

    if (targets.length === 0) {
      alert('Please add at least one VTO target with start and end times');
      return;
    }

    const config = {
      pageType: pageType,
      targets: targets,
      isRunning: true
    };

    await chrome.storage.local.set({ [pageType]: config });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'start', config: config });

    updateStatus(pageType, true, targets.length);
  } else {
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

    updateStatus(pageType, true, 1);
  }
}

async function stopAutomation(pageType) {
  const result = await chrome.storage.local.get(pageType);
  const existing = result[pageType] || {};
  await chrome.storage.local.set({
    [pageType]: { ...existing, isRunning: false }
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'stop' });

  updateStatus(pageType, false);
}

async function loadSavedState(pageType) {
  const result = await chrome.storage.local.get(pageType);
  const config = result[pageType];

  if (config) {
    if (pageType === PageType.VTO && config.targets) {
      const list = document.getElementById('vto-targets-list');
      config.targets.forEach(target => {
        list.appendChild(createVtoTargetEntry(target));
      });

      if (config.isRunning) {
        updateStatus(pageType, true, config.targets.length);
      }
    } else {
      if (config.date) {
        document.getElementById(`${pageType}-date`).value = config.date;
      }
      if (config.time) {
        document.getElementById(`${pageType}-time`).value = config.time;
      }
      if (config.isRunning) {
        updateStatus(pageType, true, 1);
      }
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

  // Add default VTO target if none exist
  if (pageType === PageType.VTO) {
    const list = document.getElementById('vto-targets-list');
    if (list.children.length === 0) {
      list.appendChild(createVtoTargetEntry());
    }
  }

  // Event listeners
  document.getElementById('vto-add-target').addEventListener('click', () => {
    document.getElementById('vto-targets-list').appendChild(createVtoTargetEntry());
    saveVtoTargets();
  });

  document.getElementById('vto-start').addEventListener('click', () => startAutomation(PageType.VTO));
  document.getElementById('vto-stop').addEventListener('click', () => stopAutomation(PageType.VTO));
  document.getElementById('vet-start').addEventListener('click', () => startAutomation(PageType.VET));
  document.getElementById('vet-stop').addEventListener('click', () => stopAutomation(PageType.VET));
});
