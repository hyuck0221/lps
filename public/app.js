const state = {
  processes: [],
  rows: [],
  selectedKey: '',
  selectedIndex: 0,
  pendingKill: null,
  refreshInterval: 5000,
  timer: null,
  paused: false,
  searchQuery: '',
  updatedAt: new Date().toISOString(),
  sortKey: 'pid',
  sortDirection: 'asc'
};

let layoutFrame = 0;

const columns = [
  { key: 'pid', label: 'PID', type: 'number' },
  { key: 'ppid', label: 'PPID', type: 'number' },
  { key: 'user', label: 'User', type: 'string' },
  { key: 'state', label: 'State', type: 'string' },
  { key: 'cpu', label: 'CPU', type: 'number' },
  { key: 'memory', label: 'Mem', type: 'number' },
  { key: 'elapsed', label: 'Elapsed', type: 'string' },
  { key: 'started', label: 'Started', type: 'string' },
  { key: 'nice', label: 'NI', type: 'number' },
  { key: 'priority', label: 'PRI', type: 'number' },
  { key: 'rssKb', label: 'RSS', type: 'number' },
  { key: 'vszKb', label: 'VSZ', type: 'number' },
  { key: 'tty', label: 'TTY', type: 'string' },
  { key: 'command', label: 'Command', type: 'string' },
  { key: 'listeningPorts', label: 'Port', type: 'string' },
  { key: 'args', label: 'Args', type: 'string' }
];

const elements = {
  cpuTotal: document.querySelector('#cpu-total'),
  memoryTotal: document.querySelector('#memory-total'),
  processCount: document.querySelector('#process-count'),
  updatedAt: document.querySelector('#updated-at'),
  refreshToggle: document.querySelector('#refresh-toggle'),
  allCount: document.querySelector('#all-count'),
  processSearch: document.querySelector('#process-search'),
  processHeader: document.querySelector('#process-header'),
  allProcesses: document.querySelector('#all-processes'),
  tableShell: document.querySelector('.table-shell'),
  aiPanel: document.querySelector('#ai-panel'),
  aiList: document.querySelector('#ai-list'),
  portsPanel: document.querySelector('#ports-panel'),
  portsCount: document.querySelector('#ports-count'),
  portsList: document.querySelector('#ports-list'),
  versionLabel: document.querySelector('#version-label'),
  updateButton: document.querySelector('#update-button'),
  dialog: document.querySelector('#confirm-dialog'),
  confirmText: document.querySelector('#confirm-text')
};

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '-';
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.min(100, Math.max(0, value)).toFixed(1)}%` : '0.0%';
}

function processKey(process) {
  return `all:${process.pid}`;
}

function sortValue(process, column) {
  if (column.key === 'listeningPorts') {
    return process.listeningPorts?.[0] || 0;
  }
  return process[column.key];
}

function compareProcesses(a, b) {
  const column = columns.find((item) => item.key === state.sortKey) || columns[0];
  const direction = state.sortDirection === 'asc' ? 1 : -1;
  const left = sortValue(a, column);
  const right = sortValue(b, column);

  if (column.type === 'number') {
    return ((Number(left) || 0) - (Number(right) || 0)) * direction || a.pid - b.pid;
  }

  return String(left || '').localeCompare(String(right || '')) * direction || a.pid - b.pid;
}

function processMatchesSearch(process) {
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const values = [
    process.pid,
    process.ppid,
    process.user,
    process.state,
    process.cpu,
    process.memory,
    process.elapsed,
    process.started,
    process.nice,
    process.priority,
    process.rssKb,
    process.vszKb,
    process.tty,
    process.command,
    process.args,
    ...(process.listeningPorts || []),
    ...(process.localUrls || [])
  ];
  const haystack = values
    .filter((value) => value !== undefined && value !== null)
    .join(' ')
    .toLowerCase();

  return query.split(/\s+/).every((term) => haystack.includes(term));
}

function scheduleTableFit() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    const rect = elements.tableShell.getBoundingClientRect();
    const bottomPadding = 12;
    const available = window.innerHeight - rect.top - bottomPadding;
    elements.tableShell.style.setProperty('--process-table-height', `${Math.max(120, Math.floor(available))}px`);
  });
}

function cell(text, className = '') {
  const span = document.createElement('span');
  span.textContent = text ?? '';
  if (className) {
    span.className = className;
  }
  return span;
}

function portCell(process) {
  const span = document.createElement('span');
  span.className = 'port-cell';

  if (!process.listeningPorts?.length) {
    span.textContent = '-';
    return span;
  }

  span.textContent = process.listeningPorts.slice(0, 4).join(', ');
  if (process.listeningPorts.length > 4) {
    span.textContent += ` +${process.listeningPorts.length - 4}`;
  }

  return span;
}

function renderPorts(processes) {
  const rows = [];
  for (const process of processes.all || []) {
    for (const port of process.listeningPorts || []) {
      rows.push({
        port,
        url: `http://127.0.0.1:${port}`,
        pid: process.pid,
        command: process.command
      });
    }
  }

  rows.sort((a, b) => a.port - b.port || a.pid - b.pid);
  elements.portsPanel.hidden = rows.length === 0;
  elements.portsCount.textContent = String(rows.length);
  elements.portsList.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement('div');
      item.className = 'ports-grid ports-row';

      const port = document.createElement('span');
      port.textContent = String(row.port);
      const address = document.createElement('a');
      address.href = row.url;
      address.target = '_blank';
      address.rel = 'noreferrer';
      address.textContent = row.url.replace('http://', '');
      const pid = document.createElement('span');
      pid.textContent = String(row.pid);
      const command = document.createElement('span');
      command.textContent = row.command;

      item.append(port, address, pid, command);
      return item;
    })
  );
}

function renderHeader() {
  elements.processHeader.replaceChildren(
    ...columns.map((column) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sort-head';
      button.dataset.sort = column.key;
      button.textContent =
        column.key === state.sortKey
          ? `${column.label} ${state.sortDirection === 'asc' ? '↑' : '↓'}`
          : column.label;
      button.addEventListener('click', () => {
        if (state.sortKey === column.key) {
          state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = column.key;
          state.sortDirection = column.type === 'number' ? 'desc' : 'asc';
          if (column.key === 'pid') {
            state.sortDirection = 'asc';
          }
        }
        applyProcessView();
      });
      return button;
    })
  );
}

function createProcessRow(process) {
  const key = processKey(process);
  const row = document.createElement('div');
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  row.className = 'process-grid process-row';
  row.dataset.key = key;
  row.dataset.pid = String(process.pid);
  row.title = process.args;

  if (key === state.selectedKey) {
    row.classList.add('is-selected');
  }

  const values = [
    [process.pid],
    [process.ppid],
    [process.user],
    [process.state],
    [`${process.cpu.toFixed(1)}%`, process.cpu >= 20 ? 'metric-hot' : ''],
    [`${process.memory.toFixed(1)}%`, process.memory >= 10 ? 'metric-hot' : ''],
    [process.elapsed],
    [process.started],
    [process.nice],
    [process.priority],
    [`${formatNumber(process.rssKb)}K`],
    [`${formatNumber(process.vszKb)}K`],
    [process.tty],
    [process.command, 'command-name']
  ];

  values.forEach(([text, className]) => row.append(cell(text, className)));
  row.append(portCell(process));
  row.append(cell(process.args));

  row.addEventListener('mouseenter', () => selectByKey(key, { scroll: false }));
  row.addEventListener('focus', () => selectByKey(key, { scroll: false }));
  row.addEventListener('click', () => {
    selectByKey(key);
    askKill(process);
  });

  return row;
}

function applyProcessView() {
  const filtered = state.processes.filter(processMatchesSearch);
  const sorted = [...filtered].sort(compareProcesses);
  state.rows = sorted.map((process) => ({ process }));

  const selectedIndex = state.rows.findIndex((entry) => processKey(entry.process) === state.selectedKey);
  if (selectedIndex === -1) {
    state.selectedIndex = Math.min(state.selectedIndex, Math.max(0, state.rows.length - 1));
    const selected = state.rows[state.selectedIndex];
    state.selectedKey = selected ? processKey(selected.process) : '';
  } else {
    state.selectedIndex = selectedIndex;
  }

  renderHeader();
  elements.allProcesses.replaceChildren(...sorted.map(createProcessRow));
  elements.processCount.textContent = `${state.processes.length} processes`;
  elements.cpuTotal.textContent = `CPU ${formatPercent(
    state.processes.reduce((total, process) => total + (Number(process.cpu) || 0), 0)
  )}`;
  elements.memoryTotal.textContent = `Mem ${formatPercent(
    state.processes.reduce((total, process) => total + (Number(process.memory) || 0), 0)
  )}`;
  elements.allCount.textContent =
    sorted.length === state.processes.length ? String(sorted.length) : `${sorted.length}/${state.processes.length}`;
  elements.updatedAt.textContent = new Date(state.updatedAt).toLocaleTimeString();
  scheduleTableFit();
}

function renderProcesses(processes) {
  state.processes = processes.all || [];
  state.updatedAt = processes.updatedAt || new Date().toISOString();
  applyProcessView();
}

function renderAi(ai) {
  if (!ai.length) {
    elements.aiPanel.hidden = true;
    elements.aiList.replaceChildren();
    return;
  }

  elements.aiPanel.hidden = false;
  elements.aiList.replaceChildren(
    ...ai.map((entry) => {
      const item = document.createElement('div');
      item.className = 'ai-item';
      item.dataset.status = entry.status;
      const dot = document.createElement('span');
      dot.className = 'ai-dot';
      const label = document.createElement('span');
      const statusText =
        entry.status === 'ready'
          ? entry.user || 'signed in'
          : entry.status === 'login_required'
            ? 'login required'
            : 'uninstalled';
      label.textContent = `${entry.label}: ${statusText}`;
      item.title = entry.path || entry.command;
      item.append(dot, label);
      return item;
    })
  );
}

function renderUpdate(update) {
  if (!update) {
    return;
  }

  const current = update.currentVersion || '0.0.0';
  elements.versionLabel.textContent = update.updateAvailable
    ? `v${current} -> v${update.latestVersion}`
    : `v${current}`;
  elements.updateButton.hidden = !update.updateAvailable;
  elements.updateButton.disabled = false;
  elements.updateButton.textContent = 'Update';
}

function syncSelection({ scroll = false } = {}) {
  document.querySelectorAll('.process-row.is-selected').forEach((row) => {
    row.classList.remove('is-selected');
  });
  const row = document.querySelector(`.process-row[data-key="${CSS.escape(state.selectedKey)}"]`);
  if (!row) {
    return;
  }
  row.classList.add('is-selected');
  if (scroll) {
    row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    row.focus({ preventScroll: true });
  }
}

function selectByKey(key, options = {}) {
  const index = state.rows.findIndex((entry) => processKey(entry.process) === key);
  if (index === -1) {
    return;
  }
  state.selectedIndex = index;
  state.selectedKey = key;
  syncSelection(options);
}

function moveSelection(delta) {
  if (!state.rows.length) {
    return;
  }
  state.selectedIndex = (state.selectedIndex + delta + state.rows.length) % state.rows.length;
  const selected = state.rows[state.selectedIndex];
  state.selectedKey = processKey(selected.process);
  syncSelection({ scroll: true });
}

function selectedProcess() {
  return state.rows.find((entry) => processKey(entry.process) === state.selectedKey)?.process || null;
}

function askKill(process) {
  state.pendingKill = process;
  elements.confirmText.textContent = `${process.command} (PID ${process.pid}) will receive SIGTERM.`;
  elements.dialog.showModal();
}

async function killPendingProcess() {
  if (!state.pendingKill) {
    return;
  }
  const pid = state.pendingKill.pid;
  const response = await fetch(`/api/processes/${pid}/kill`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ signal: 'TERM' })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    window.alert(body.error || `Could not kill PID ${pid}`);
  }
  state.pendingKill = null;
  await refresh({ force: true });
}

async function refresh({ force = false } = {}) {
  if (state.paused && !force) {
    return;
  }
  const response = await fetch('/api/state', { cache: 'no-store' });
  const body = await response.json();
  renderAi(body.ai || []);
  renderUpdate(body.update);
  renderPorts(body.processes || { all: [] });
  renderProcesses(body.processes || { all: [], updatedAt: new Date().toISOString() });
  state.refreshInterval = body.config?.refreshIntervalMs || state.refreshInterval;
  scheduleRefresh();
}

function scheduleRefresh() {
  clearInterval(state.timer);
  if (state.paused) {
    return;
  }
  state.timer = setInterval(() => {
    refresh().catch((error) => {
      elements.updatedAt.textContent = error.message;
    });
  }, state.refreshInterval);
}

document.addEventListener('keydown', (event) => {
  if (elements.dialog.open) {
    return;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) {
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveSelection(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const process = selectedProcess();
    if (process) {
      askKill(process);
    }
  }
});

elements.dialog.addEventListener('close', () => {
  if (elements.dialog.returnValue === 'kill') {
    killPendingProcess().catch((error) => window.alert(error.message));
  } else {
    state.pendingKill = null;
  }
});

elements.refreshToggle.addEventListener('click', () => {
  state.paused = !state.paused;
  elements.refreshToggle.textContent = state.paused ? 'Resume' : 'Pause';
  elements.refreshToggle.setAttribute('aria-pressed', String(state.paused));
  if (state.paused) {
    clearInterval(state.timer);
  } else {
    refresh({ force: true }).catch((error) => {
      elements.updatedAt.textContent = error.message;
    });
  }
});

elements.processSearch.addEventListener('input', () => {
  state.searchQuery = elements.processSearch.value;
  applyProcessView();
});

elements.updateButton.addEventListener('click', async () => {
  elements.updateButton.disabled = true;
  elements.updateButton.textContent = 'Updating';
  const response = await fetch('/api/update/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    elements.updateButton.disabled = false;
    elements.updateButton.textContent = 'Update';
    window.alert(body.error || 'Could not start update.');
    return;
  }
  elements.versionLabel.textContent = 'Updating. Restarting...';
  elements.updateButton.hidden = true;
});

renderHeader();
window.addEventListener('resize', scheduleTableFit);
refresh({ force: true }).catch((error) => {
  elements.updatedAt.textContent = error.message;
});
