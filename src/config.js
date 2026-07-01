import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const appDir = path.join(os.homedir(), '.local-process');
export const configPath = path.join(appDir, 'config.json');
export const pidPath = path.join(appDir, 'lps.pid');
export const logPath = path.join(appDir, 'lps.log');
export const startupCommandsLogPath = path.join(appDir, 'startup-commands.log');
export const startupCommandsStatusPath = path.join(appDir, 'startup-commands.jsonl');

export const defaultConfig = {
  configured: false,
  language: 'en',
  port: 3737,
  host: '127.0.0.1',
  autoStart: false,
  autoUpdate: false,
  openBrowserOnStart: true,
  refreshIntervalMs: 5000,
  updateCheckIntervalMs: 6 * 60 * 60 * 1000,
  updateRepository: 'hyuck0221/lps',
  latestVersion: '',
  lastUpdateCheck: '',
  lastUpdateError: '',
  lastStartupCommandBootId: '',
  startupCommands: [],
  showAiStatus: true,
  aiTools: {
    codex: true,
    claude: true,
    antigravity: true
  },
  developerProcessPatterns: [
    'java',
    'node',
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'deno',
    'python',
    'ruby',
    'go',
    'cargo',
    'rustc',
    'docker',
    'postgres',
    'mysql',
    'redis',
    'nginx',
    'vite',
    'webpack',
    'codex',
    'claude',
    'antigravity'
  ]
};

function mergeConfig(base, saved) {
  const merged = {
    ...base,
    ...saved,
    aiTools: {
      ...base.aiTools,
      ...(saved?.aiTools || {})
    },
    startupCommands: Array.isArray(saved?.startupCommands) ? saved.startupCommands : base.startupCommands,
    developerProcessPatterns: Array.isArray(saved?.developerProcessPatterns)
      ? saved.developerProcessPatterns
      : base.developerProcessPatterns
  };
  if (merged.refreshIntervalMs === 1500) {
    merged.refreshIntervalMs = base.refreshIntervalMs;
  }
  if (!merged.updateRepository) {
    merged.updateRepository = base.updateRepository;
  }
  return merged;
}

export function ensureAppDir() {
  fs.mkdirSync(appDir, { recursive: true });
}

export function readConfig() {
  ensureAppDir();
  if (!fs.existsSync(configPath)) {
    return structuredClone(defaultConfig);
  }

  try {
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return mergeConfig(defaultConfig, saved);
  } catch {
    return structuredClone(defaultConfig);
  }
}

export function writeConfig(nextConfig) {
  ensureAppDir();
  const config = mergeConfig(defaultConfig, nextConfig);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

export function updateConfig(updater) {
  const current = readConfig();
  const next = typeof updater === 'function' ? updater(current) : updater;
  return writeConfig({ ...current, ...next });
}

export function isConfigured() {
  return readConfig().configured === true;
}
