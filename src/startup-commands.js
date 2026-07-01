import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  appDir,
  startupCommandsLogPath,
  startupCommandsStatusPath,
  updateConfig
} from './config.js';

const START_DELAY_MS = 350;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, 'startup-command-worker.js');

function normalizeCommand(command = {}) {
  const id = command.id || randomUUID();
  return {
    id,
    name: String(command.name || '').trim() || `Command ${id.slice(0, 8)}`,
    command: String(command.command || '').trim(),
    cwd: String(command.cwd || '').trim(),
    priority: Number.isFinite(Number(command.priority)) ? Number(command.priority) : 100,
    enabled: command.enabled !== false,
    lastRunAt: command.lastRunAt || '',
    lastPid: command.lastPid || 0
  };
}

export function sanitizeStartupCommands(commands = []) {
  return commands
    .map(normalizeCommand)
    .filter((command) => command.command)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export function getBootId() {
  try {
    const output = execFileSync('sysctl', ['-n', 'kern.boottime'], {
      encoding: 'utf8',
      timeout: 1000
    });
    const match = output.match(/sec\s*=\s*(\d+)/);
    return match?.[1] || output.trim();
  } catch {
    return '';
  }
}

function appendLog(message) {
  fs.mkdirSync(appDir, { recursive: true });
  fs.appendFileSync(startupCommandsLogPath, `${new Date().toISOString()} ${message}\n`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchCommand(command) {
  const cwd = command.cwd && fs.existsSync(command.cwd) ? command.cwd : os.homedir();
  const payload = Buffer.from(
    JSON.stringify({
      command: { ...command, cwd },
      logPath: startupCommandsLogPath,
      statusPath: startupCommandsStatusPath
    }),
    'utf8'
  ).toString('base64url');
  const child = spawn(process.execPath, [workerPath, payload], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  appendLog(`queued workerPid=${child.pid} priority=${command.priority} name="${command.name}" cwd="${cwd}"`);
  return child.pid || 0;
}

function readStatusEvents() {
  try {
    return fs
      .readFileSync(startupCommandsStatusPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function tailLog(maxLines = 80) {
  try {
    return fs.readFileSync(startupCommandsLogPath, 'utf8').split('\n').slice(-maxLines).join('\n');
  } catch {
    return '';
  }
}

export function getStartupCommandStatus(config) {
  const events = readStatusEvents();
  const latestById = new Map();
  for (const event of events) {
    latestById.set(event.id, event);
  }

  return {
    enabled: Boolean(config.autoStart),
    commands: sanitizeStartupCommands(config.startupCommands).map((command) => ({
      ...command,
      status: latestById.get(command.id) || null
    })),
    logTail: tailLog(),
    lastStartupCommandBootId: config.lastStartupCommandBootId || ''
  };
}

export function upsertStartupCommand(config, nextCommand) {
  const normalized = normalizeCommand(nextCommand);
  if (!normalized.command) {
    throw new Error('Command is required.');
  }

  const existing = sanitizeStartupCommands(config.startupCommands);
  const index = existing.findIndex((command) => command.id === normalized.id);
  if (index === -1) {
    existing.push(normalized);
  } else {
    existing[index] = {
      ...existing[index],
      ...normalized
    };
  }

  return updateConfig({
    startupCommands: sanitizeStartupCommands(existing)
  });
}

export function deleteStartupCommand(config, id) {
  return updateConfig({
    startupCommands: sanitizeStartupCommands(config.startupCommands).filter((command) => command.id !== id)
  });
}

export async function runStartupCommands(config) {
  if (!config.autoStart) {
    return { skipped: true, reason: 'autoStart disabled', started: [] };
  }

  const bootId = getBootId();
  if (bootId && config.lastStartupCommandBootId === bootId) {
    return { skipped: true, reason: 'already ran for this boot', started: [] };
  }

  const commands = sanitizeStartupCommands(config.startupCommands).filter((command) => command.enabled);
  if (!commands.length) {
    updateConfig({ lastStartupCommandBootId: bootId });
    return { skipped: false, started: [] };
  }

  appendLog(`startup command run begin count=${commands.length}`);
  const started = [];
  const nextCommands = sanitizeStartupCommands(config.startupCommands);

  for (const command of commands) {
    const pid = launchCommand(command);
    started.push({ id: command.id, pid });
    const index = nextCommands.findIndex((item) => item.id === command.id);
    if (index !== -1) {
      nextCommands[index] = {
        ...nextCommands[index],
        lastRunAt: new Date().toISOString(),
        lastPid: pid
      };
    }
    await wait(START_DELAY_MS);
  }

  updateConfig({
    startupCommands: sanitizeStartupCommands(nextCommands),
    lastStartupCommandBootId: bootId
  });
  appendLog('startup command run complete');

  return { skipped: false, started };
}
