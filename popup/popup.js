'use strict';

const PageType = {
  VTO: 'vto',
  VET: 'vet',
  UNKNOWN: 'unknown'
};

let vtoTargets = [];
let timerInterval = null;

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => n.toString().padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

let currentCycleStartTime = null;

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

function updateStatus(pageType, isRunning, statusInfo = '', cycleStartTime = null) {
  const statusEl = document.getElementById(`${pageType}-status`);
  const startBtn = document.getElementById(`${pageType}-start`);
  const stopBtn = document.getElementById(`${pageType}-stop`);

  currentCycleStartTime = cycleStartTime;

  // Clear existing interval
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (isRunning) {
    statusEl.className = 'status running';
    startBtn.disabled = true;
    stopBtn.disabled = false;

    const updateText = () => {
      let timeStr = '';
      if (currentCycleStartTime) {
        const elapsed = Date.now() - currentCycleStartTime;
        if (elapsed >= 0) {
          timeStr = ` (${formatDuration(elapsed)})`;
        } else {
          timeStr = ` (Paused ${formatDuration(Math.abs(elapsed))})`;
        }
      }
      statusEl.textContent = `Running... Watching ${statusInfo}${timeStr}`;
    };

    updateText();
    if (cycleStartTime) {
      timerInterval = setInterval(updateText, 1000);
    }
  } else {
    statusEl.textContent = 'Stopped';
    statusEl.className = 'status stopped';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

/**
 * Handle static form logic (checkbox toggles)
 */
function initFormListeners() {
  const acceptAnyCheckbox = document.getElementById('new-vto-accept-any');
  const fullShiftCheckbox = document.getElementById('new-vto-fullshift');
  const fullShiftLabel = fullShiftCheckbox.closest('.checkbox-label');
  const minDurationRow = document.getElementById('new-vto-min-duration-row');
  const timeRow = document.getElementById('new-vto-time-row');

  acceptAnyCheckbox.addEventListener('change', () => {
    if (acceptAnyCheckbox.checked) {
      fullShiftLabel.classList.add('hidden');
      minDurationRow.classList.remove('hidden');
      timeRow.classList.add('hidden');
    } else {
      fullShiftLabel.classList.remove('hidden');
      minDurationRow.classList.add('hidden');
      if (!fullShiftCheckbox.checked) {
        timeRow.classList.remove('hidden');
      }
    }
  });

  fullShiftCheckbox.addEventListener('change', () => {
    if (fullShiftCheckbox.checked) {
      timeRow.classList.add('hidden');
    } else if (!acceptAnyCheckbox.checked) {
      timeRow.classList.remove('hidden');
    }
  });
}

/**
 * Render the list of targets with headers and controls
 */
function renderVtoTargets() {
  const list = document.getElementById('vto-targets-list');
  list.innerHTML = '';

  let lastDate = null;

  vtoTargets.forEach((target, index) => {
    // Determine display date
    const displayDate = target.date ? target.date : 'Any Date';

    // Render Header if date changes
    if (displayDate !== lastDate) {
      const header = document.createElement('div');
      header.className = 'vto-date-header';
      header.textContent = displayDate;
      list.appendChild(header);
      lastDate = displayDate;
    }

    // Create Item Card
    const card = document.createElement('div');
    card.className = 'vto-item-card';

    // Description logic
    let mainText = '';
    let subText = '';

    if (target.acceptAny) {
      mainText = 'Accept Any';
      if (target.minDuration > 0) {
        subText = `Min Duration: ${target.minDuration}hr+`;
      }
    } else if (target.fullShift) {
      mainText = 'Full Shift';
    } else {
      // time range
      const formatTime = (t) => {
        if (!t) return '??:??';
        return t;
      };
      mainText = `${formatTime(target.startTime)} - ${formatTime(target.endTime)}`;
    }

    // Min duration label for non-accept-any if we want to show it? 
    // The current logic only had min duration for accept any.
    // Wait, the previous logic stored minDuration for everyone but only showed input for AcceptAny?
    // Let's stick to the previous visibility logic: Only relevant for AcceptAny?
    // Actually, looking at the code: "vto-min-duration-row ${isAcceptAny ? '' : 'hidden'}"
    // So yes, it was only for Accept Any.

    card.innerHTML = `
      <div class="vto-item-info">
        <div class="vto-item-main">${mainText}</div>
        <div class="vto-item-sub">${subText}</div>
      </div>
      <div class="vto-item-actions">
        <button class="icon-btn move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>▲</button>
        <button class="icon-btn move-down" title="Move Down" ${index === vtoTargets.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="icon-btn delete" title="Delete">×</button>
      </div>
    `;

    // Bind Actions
    card.querySelector('.move-up').addEventListener('click', () => moveTarget(index, -1));
    card.querySelector('.move-down').addEventListener('click', () => moveTarget(index, 1));
    card.querySelector('.delete').addEventListener('click', () => deleteTarget(index));

    list.appendChild(card);
  });
}

function moveTarget(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= vtoTargets.length) return;

  // Swap
  const temp = vtoTargets[index];
  vtoTargets[index] = vtoTargets[newIndex];
  vtoTargets[newIndex] = temp;

  saveVtoTargets();
  renderVtoTargets();
}

function deleteTarget(index) {
  vtoTargets.splice(index, 1);
  saveVtoTargets();
  renderVtoTargets();
}

function addTargetFromForm() {
  const dateInput = document.getElementById('new-vto-date');
  const acceptAnyInput = document.getElementById('new-vto-accept-any');
  const fullShiftInput = document.getElementById('new-vto-fullshift');
  const minDurationInput = document.getElementById('new-vto-min-duration');
  const startInput = document.getElementById('new-vto-start');
  const endInput = document.getElementById('new-vto-end');

  const newTarget = {
    date: dateInput.value,
    acceptAny: acceptAnyInput.checked,
    fullShift: fullShiftInput.checked,
    minDuration: parseInt(minDurationInput.value, 10),
    startTime: startInput.value,
    endTime: endInput.value
  };

  // Basic validation?
  // If not Accept Any and not Full Shift, must have times
  if (!newTarget.acceptAny && !newTarget.fullShift && (!newTarget.startTime || !newTarget.endTime)) {
    // We could warn, but maybe user wants to partially fill? 
    // The previous logic allowed saving anything but warned on Start.
    // Let's enforce it for the list to be clean.
    alert('Please specify Start and End times, or select Full Shift / Accept Any.');
    return;
  }

  // Add to list
  // Logic: "grouped by date". 
  // If we want to enforce grouping, we should find the index of the last item with this date and insert after it.
  // OR just push to end and let user reorder.
  // User asked: "add to the list (grouped by date) which then can be reorganized by prioirty"
  // I will check if there are existing items with this date. If so, append after the last one of that date.
  // Else append to end.

  let insertIndex = vtoTargets.length;
  if (newTarget.date) {
    // Find last index of this date
    for (let i = vtoTargets.length - 1; i >= 0; i--) {
      if (vtoTargets[i].date === newTarget.date) {
        insertIndex = i + 1;
        break;
      }
    }
  }

  vtoTargets.splice(insertIndex, 0, newTarget);
  saveVtoTargets();
  renderVtoTargets();
}

/**
 * Get shift time settings
 */
function getShiftTime() {
  return {
    start: document.getElementById('shift-start').value,
    end: document.getElementById('shift-end').value
  };
}

/**
 * Save VTO targets and shift time to local storage
 */
async function saveVtoTargets() {
  const shiftTime = getShiftTime();
  const result = await chrome.storage.local.get('vto');
  const existing = result.vto || {};
  await chrome.storage.local.set({
    vto: { ...existing, targets: vtoTargets, shiftTime }
  });
}

/**
 * Save shift time to local storage
 */
async function saveShiftTime() {
  const shiftTime = getShiftTime();
  const result = await chrome.storage.local.get('vto');
  const existing = result.vto || {};
  await chrome.storage.local.set({
    vto: { ...existing, shiftTime }
  });
}

async function startAutomation(pageType) {
  if (pageType === PageType.VTO) {
    const shiftTime = getShiftTime();

    if (vtoTargets.length === 0) {
      alert('Please add at least one VTO target');
      return;
    }

    // Check if any Accept Any or Full Shift target but no shift time set
    const needsShiftTime = vtoTargets.some(t => t.acceptAny || t.fullShift);
    if (needsShiftTime && (!shiftTime.start || !shiftTime.end)) {
      alert('Please set your shift time to use Accept Any or Full Shift');
      return;
    }

    // Resolve targets for the content script
    // We create a copy where we fill in the full shift times
    const resolvedTargets = vtoTargets.map(t => {
      const copy = { ...t };
      if (copy.fullShift) {
        copy.startTime = shiftTime.start;
        copy.endTime = shiftTime.end;
      }
      return copy;
    });

    const config = {
      pageType: pageType,
      targets: resolvedTargets,
      shiftTime: shiftTime,
      isRunning: true,
      cycleStartTime: Date.now()
    };

    await chrome.storage.local.set({ [pageType]: config });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'start', config: config });
    } catch (err) {
      alert('Cannot connect to the page. Please refresh the page and try again.');
      return;
    }

    updateStatus(pageType, true, `${resolvedTargets.length} target(s)`, config.cycleStartTime);
  } else {
    const dateInput = document.getElementById(`${pageType}-date`);
    const timeInput = document.getElementById(`${pageType}-time`);

    const config = {
      pageType: pageType,
      date: dateInput.value,
      time: timeInput.value,
      isRunning: true,
      cycleStartTime: Date.now()
    };

    await chrome.storage.local.set({ [pageType]: config });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'start', config: config });
    } catch (err) {
      alert('Cannot connect to the page. Please refresh the page and try again.');
      return;
    }

    updateStatus(pageType, true, 1, config.cycleStartTime);
  }
}

async function stopAutomation(pageType) {
  const result = await chrome.storage.local.get(pageType);
  const existing = result[pageType] || {};
  await chrome.storage.local.set({
    [pageType]: { ...existing, isRunning: false }
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
  } catch (err) {
    console.warn('Could not send stop message (tab might be closed/disconnected)', err);
  }

  updateStatus(pageType, false);
}

async function loadSavedState(pageType) {
  const result = await chrome.storage.local.get(pageType);
  const config = result[pageType];

  if (config) {
    if (pageType === PageType.VTO) {
      // Load shift time
      if (config.shiftTime) {
        document.getElementById('shift-start').value = config.shiftTime.start || '';
        document.getElementById('shift-end').value = config.shiftTime.end || '';
      }

      // Load targets
      if (config.targets) {
        vtoTargets = config.targets;
        renderVtoTargets();
      }

      if (config.isRunning) {
        updateStatus(pageType, true, `${config.targets?.length || 0} target(s)`, config.cycleStartTime);
      }
    } else {
      if (config.date) {
        document.getElementById(`${pageType}-date`).value = config.date;
      }
      if (config.time) {
        document.getElementById(`${pageType}-time`).value = config.time;
      }
      if (config.isRunning) {
        updateStatus(pageType, true, 1, config.cycleStartTime);
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
  } else {
    // TEMPORARY: For development testing of the popup logic without being on the Amazon page
    // Uncomment this block to test UI in a normal tab if needed, but for extension logic we usually need the context.
    // However, to show the UI even if unknown:
    // showSection(PageType.VTO);
    // initFormListeners();
  }

  // Always init form listeners for VTO (so they work if the section is shown)
  if (pageType === PageType.VTO) {
    initFormListeners();
  } else if (pageType === PageType.UNKNOWN) {
    const navVtoBtn = document.getElementById('nav-vto');
    if (navVtoBtn) {
      navVtoBtn.addEventListener('click', () => {
        chrome.tabs.update({ url: 'https://atoz.amazon.work/voluntary_time_off' });
      });
    }
  }

  // Event listeners
  document.getElementById('shift-start').addEventListener('change', () => saveShiftTime());
  document.getElementById('shift-end').addEventListener('change', () => saveShiftTime());

  // Changed from previous "add blank" to "add from form"
  const addBtn = document.getElementById('vto-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => addTargetFromForm());
  }

  document.getElementById('vto-start').addEventListener('click', () => startAutomation(PageType.VTO));
  document.getElementById('vto-stop').addEventListener('click', () => stopAutomation(PageType.VTO));
  document.getElementById('vet-start').addEventListener('click', () => startAutomation(PageType.VET));
  document.getElementById('vet-stop').addEventListener('click', () => stopAutomation(PageType.VET));
});

// Listen for storage changes to sync timer if cycle resets
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    // Check if VTO config changed
    if (changes.vto && changes.vto.newValue) {
      const newConfig = changes.vto.newValue;
      // If it's running and cycleStartTime changed, update the timer
      if (newConfig.isRunning && newConfig.cycleStartTime && newConfig.cycleStartTime !== currentCycleStartTime) {
        updateStatus(PageType.VTO, true, `${newConfig.targets?.length || 0} target(s)`, newConfig.cycleStartTime);
      }
      // If it stopped running
      if (!newConfig.isRunning && changes.vto.oldValue?.isRunning) {
        updateStatus(PageType.VTO, false);
      }
    }
  }
});
