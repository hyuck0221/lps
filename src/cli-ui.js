import readline from 'node:readline';
import { aiDefinitions } from './ai.js';
import { languageOptions, t } from './i18n.js';
import { readConfig, writeConfig } from './config.js';
import { disableLaunchAgent, enableLaunchAgent } from './launch-agent.js';

function cycle(options, current, direction) {
  const index = Math.max(0, options.findIndex((option) => option.value === current));
  return options[(index + direction + options.length) % options.length].value;
}

function labelForLanguage(value) {
  return languageOptions.find((option) => option.value === value)?.label || value;
}

const refreshIntervalOptions = [
  { value: 2000, label: '2s' },
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' },
  { value: 30000, label: '30s' }
];

function labelForRefreshInterval(value) {
  return refreshIntervalOptions.find((option) => option.value === value)?.label || `${value}ms`;
}

function clear() {
  process.stdout.write('\x1b[3J\x1b[2J\x1b[H');
}

function writeLine(text = '') {
  process.stdout.write(`${text}\n`);
}

function render(title, items, selectedIndex, language) {
  clear();
  writeLine(title);
  writeLine('Use arrow keys and Enter. Press q to quit.');
  writeLine('');

  items.forEach((item, index) => {
    const selected = index === selectedIndex ? '>' : ' ';
    const value = item.value ? ` ${item.value}` : '';
    const hint = item.hint ? `  ${item.hint}` : '';
    writeLine(`${selected} ${item.label}${value}${hint}`);
  });

  writeLine('');
  writeLine(`${t(language, 'language')}: ${labelForLanguage(language)}`);
}

function buildSettingsItems(draft, initialSetup) {
  const language = draft.language;
  const bool = (value) => (value ? t(language, 'enabled') : t(language, 'disabled'));
  const items = [
    {
      id: 'language',
      label: t(language, 'language'),
      value: labelForLanguage(draft.language),
      hint: '< / >'
    },
    {
      id: 'autoStart',
      label: t(language, 'autoStart'),
      value: bool(draft.autoStart),
      hint: 'Enter'
    },
    {
      id: 'autoUpdate',
      label: t(language, 'autoUpdate'),
      value: bool(draft.autoUpdate),
      hint: 'Enter'
    },
    {
      id: 'refreshIntervalMs',
      label: t(language, 'refreshInterval'),
      value: labelForRefreshInterval(draft.refreshIntervalMs),
      hint: '< / >'
    },
    {
      id: 'openBrowserOnStart',
      label: t(language, 'openBrowserOnStart'),
      value: bool(draft.openBrowserOnStart),
      hint: 'Enter'
    },
    {
      id: 'showAiStatus',
      label: t(language, 'showAiStatus'),
      value: bool(draft.showAiStatus),
      hint: 'Enter'
    },
    ...(draft.showAiStatus
      ? Object.entries(aiDefinitions).map(([id, definition]) => ({
          id: `ai:${id}`,
          label: `${t(language, 'aiTools')} - ${definition.label}`,
          value: bool(draft.aiTools[id] !== false),
          hint: 'Enter'
        }))
      : []),
    {
      id: 'save',
      label: initialSetup ? t(language, 'save') : t(language, 'save'),
      value: '',
      hint: 'Enter'
    }
  ];

  return items;
}

function boolOptions(language) {
  return [
    { value: true, label: t(language, 'yes') },
    { value: false, label: t(language, 'no') }
  ];
}

function buildSetupSteps(draft) {
  const aiSteps = draft.showAiStatus
    ? Object.entries(aiDefinitions).map(([id, definition]) => ({
        id: `ai:${id}`,
        label: `${t(draft.language, 'aiTools')} - ${definition.label}`,
        type: 'boolean',
        getValue: () => draft.aiTools[id] !== false,
        setValue: (value) => {
          draft.aiTools[id] = value;
        }
      }))
    : [];

  return [
    {
      id: 'language',
      label: t(draft.language, 'language'),
      type: 'language',
      getValue: () => draft.language,
      setValue: (value) => {
        draft.language = value;
      }
    },
    {
      id: 'autoStart',
      label: t(draft.language, 'autoStart'),
      type: 'boolean',
      getValue: () => draft.autoStart,
      setValue: (value) => {
        draft.autoStart = value;
      }
    },
    {
      id: 'autoUpdate',
      label: t(draft.language, 'autoUpdate'),
      type: 'boolean',
      getValue: () => draft.autoUpdate,
      setValue: (value) => {
        draft.autoUpdate = value;
      }
    },
    {
      id: 'refreshIntervalMs',
      label: t(draft.language, 'refreshInterval'),
      type: 'refreshInterval',
      getValue: () => draft.refreshIntervalMs,
      setValue: (value) => {
        draft.refreshIntervalMs = value;
      }
    },
    {
      id: 'openBrowserOnStart',
      label: t(draft.language, 'openBrowserOnStart'),
      type: 'boolean',
      getValue: () => draft.openBrowserOnStart,
      setValue: (value) => {
        draft.openBrowserOnStart = value;
      }
    },
    {
      id: 'showAiStatus',
      label: t(draft.language, 'showAiStatus'),
      type: 'boolean',
      getValue: () => draft.showAiStatus,
      setValue: (value) => {
        draft.showAiStatus = value;
      }
    },
    ...aiSteps
  ];
}

function optionsForStep(step, language) {
  if (step.type === 'language') {
    return languageOptions;
  }
  if (step.type === 'refreshInterval') {
    return refreshIntervalOptions;
  }
  return boolOptions(language);
}

function selectedIndexForStep(step, language) {
  const options = optionsForStep(step, language);
  const value = step.getValue();
  const index = options.findIndex((option) => option.value === value);
  return Math.max(0, index);
}

function renderSetupStep(draft, stepIndex, optionIndex) {
  const steps = buildSetupSteps(draft);
  if (stepIndex >= steps.length) {
    return;
  }
  const step = steps[stepIndex];
  const options = optionsForStep(step, draft.language);
  clear();
  writeLine(t(draft.language, 'setupTitle'));
  writeLine(`Step ${stepIndex + 1}/${steps.length}`);
  writeLine('');
  writeLine(step.label);
  writeLine('');

  options.forEach((option, index) => {
    const selected = index === optionIndex ? '>' : ' ';
    writeLine(`${selected} ${option.label}`);
  });

  writeLine('');
  writeLine('Use arrow keys and Enter. Press b to go back, q to quit.');
}

function restoreInput(previousRawMode, wasPaused) {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(Boolean(previousRawMode));
  }
  if (wasPaused) {
    process.stdin.pause();
  }
}

async function runInitialSetupFlow({ nodePath, cliPath } = {}) {
  const previousRawMode = process.stdin.isRaw;
  const wasPaused = typeof process.stdin.isPaused === 'function' ? process.stdin.isPaused() : true;
  const draft = readConfig();
  let stepIndex = 0;
  let optionIndex = selectedIndexForStep(buildSetupSteps(draft)[stepIndex], draft.language);

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  return new Promise((resolve) => {
    const done = (result) => {
      process.stdin.off('keypress', onKeypress);
      restoreInput(previousRawMode, wasPaused);
      clear();
      resolve(result);
    };

    const save = () => {
      const saved = writeConfig({ ...draft, configured: true });
      if (saved.autoStart) {
        enableLaunchAgent({ nodePath, cliPath });
      } else {
        disableLaunchAgent();
      }
      done(saved);
    };

    const rerender = () => {
      const steps = buildSetupSteps(draft);
      if (stepIndex >= steps.length) {
        save();
        return;
      }
      const step = steps[stepIndex];
      optionIndex = Math.min(optionIndex, optionsForStep(step, draft.language).length - 1);
      renderSetupStep(draft, stepIndex, optionIndex);
    };

    const onKeypress = (_text, key = {}) => {
      const steps = buildSetupSteps(draft);
      const step = steps[stepIndex];
      if (!step) {
        save();
        return;
      }
      const options = optionsForStep(step, draft.language);

      if (key.ctrl && key.name === 'c') {
        done(null);
        return;
      }
      if (key.name === 'q' || key.name === 'escape') {
        done(null);
        return;
      }
      if (key.name === 'b' || key.name === 'backspace') {
        stepIndex = Math.max(0, stepIndex - 1);
        optionIndex = selectedIndexForStep(buildSetupSteps(draft)[stepIndex], draft.language);
        rerender();
        return;
      }
      if (key.name === 'up' || key.name === 'left') {
        optionIndex = (optionIndex - 1 + options.length) % options.length;
      } else if (key.name === 'down' || key.name === 'right') {
        optionIndex = (optionIndex + 1) % options.length;
      } else if (key.name === 'return' || key.name === 'space') {
        step.setValue(options[optionIndex].value);
        stepIndex += 1;
        const nextSteps = buildSetupSteps(draft);
        if (stepIndex >= nextSteps.length) {
          save();
          return;
        }
        optionIndex = selectedIndexForStep(nextSteps[stepIndex], draft.language);
      }

      rerender();
    };

    process.stdin.on('keypress', onKeypress);
    renderSetupStep(draft, stepIndex, optionIndex);
  });
}

export async function runSettingsFlow({ initialSetup = false, nodePath, cliPath } = {}) {
  if (initialSetup) {
    return runInitialSetupFlow({ nodePath, cliPath });
  }

  const previousRawMode = process.stdin.isRaw;
  const wasPaused = typeof process.stdin.isPaused === 'function' ? process.stdin.isPaused() : true;
  const draft = readConfig();
  let selectedIndex = 0;

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  return new Promise((resolve) => {
    const done = (result) => {
      process.stdin.off('keypress', onKeypress);
      restoreInput(previousRawMode, wasPaused);
      clear();
      resolve(result);
    };

    const save = () => {
      const saved = writeConfig({ ...draft, configured: true });
      if (saved.autoStart) {
        enableLaunchAgent({ nodePath, cliPath });
      } else {
        disableLaunchAgent();
      }
      done(saved);
    };

    const activate = (item, direction = 1) => {
      if (!item) {
        selectedIndex = Math.max(0, buildSettingsItems(draft, initialSetup).length - 1);
        return;
      }
      if (item.id === 'language') {
        draft.language = cycle(languageOptions, draft.language, direction);
      } else if (item.id === 'refreshIntervalMs') {
        draft.refreshIntervalMs = cycle(refreshIntervalOptions, draft.refreshIntervalMs, direction);
      } else if (item.id === 'autoStart') {
        draft.autoStart = !draft.autoStart;
      } else if (item.id === 'autoUpdate') {
        draft.autoUpdate = !draft.autoUpdate;
      } else if (item.id === 'openBrowserOnStart') {
        draft.openBrowserOnStart = !draft.openBrowserOnStart;
      } else if (item.id === 'showAiStatus') {
        draft.showAiStatus = !draft.showAiStatus;
      } else if (item.id.startsWith('ai:')) {
        const id = item.id.slice(3);
        draft.aiTools[id] = draft.aiTools[id] === false;
      } else if (item.id === 'save') {
        save();
        return;
      }

      selectedIndex = Math.min(selectedIndex, Math.max(0, buildSettingsItems(draft, initialSetup).length - 1));
      render(
        initialSetup ? t(draft.language, 'setupTitle') : t(draft.language, 'settingsTitle'),
        buildSettingsItems(draft, initialSetup),
        selectedIndex,
        draft.language
      );
    };

    const onKeypress = (_text, key = {}) => {
      const items = buildSettingsItems(draft, initialSetup);
      selectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));
      if (key.ctrl && key.name === 'c') {
        done(null);
        return;
      }
      if (key.name === 'q' || key.name === 'escape') {
        done(null);
        return;
      }
      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      } else if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % items.length;
      } else if (key.name === 'left') {
        activate(items[selectedIndex], -1);
        return;
      } else if (key.name === 'right') {
        activate(items[selectedIndex], 1);
        return;
      } else if (key.name === 'return' || key.name === 'space') {
        activate(items[selectedIndex], 1);
        return;
      }

      render(
        initialSetup ? t(draft.language, 'setupTitle') : t(draft.language, 'settingsTitle'),
        buildSettingsItems(draft, initialSetup),
        selectedIndex,
        draft.language
      );
    };

    process.stdin.on('keypress', onKeypress);
    render(
      initialSetup ? t(draft.language, 'setupTitle') : t(draft.language, 'settingsTitle'),
      buildSettingsItems(draft, initialSetup),
      selectedIndex,
      draft.language
    );
  });
}
