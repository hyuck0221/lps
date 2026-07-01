import { execFile, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PS_FIELDS = [
  'pid',
  'ppid',
  'user',
  'state',
  '%cpu',
  '%mem',
  'etime',
  'lstart',
  'nice',
  'pri',
  'rss',
  'vsz',
  'tty',
  'args'
];

export function inferCommandName(args) {
  const appMatch = args.match(/\/([^/]+)\.app\/Contents\/MacOS\/([^/\s]+)/);
  if (appMatch) {
    return appMatch[2] || appMatch[1];
  }

  const firstToken = args.trim().split(/\s+/)[0] || '';
  return path.basename(firstToken) || firstToken;
}

export function parseProcessLine(line) {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 18) {
    return null;
  }

  const args = parts.slice(17).join(' ');
  const commandPath = parts[17] || '';
  const commandName = inferCommandName(args);

  return {
    pid: Number(parts[0]),
    ppid: Number(parts[1]),
    user: parts[2],
    state: parts[3],
    cpu: Number(parts[4]),
    memory: Number(parts[5]),
    elapsed: parts[6],
    started: `${parts[7]} ${parts[8]} ${parts[9]} ${parts[10]} ${parts[11]}`,
    nice: Number(parts[12]),
    priority: Number(parts[13]),
    rssKb: Number(parts[14]),
    vszKb: Number(parts[15]),
    tty: parts[16],
    commandPath,
    command: commandName,
    args,
    raw: line.trim()
  };
}

export function parseProcessList(stdout) {
  return stdout
    .split('\n')
    .slice(1)
    .map(parseProcessLine)
    .filter((process) => process && Number.isFinite(process.pid));
}

export function parseListenPorts(stdout) {
  const byPid = new Map();
  let currentPid = null;

  for (const line of stdout.split('\n')) {
    if (!line) {
      continue;
    }

    const type = line[0];
    const value = line.slice(1);
    if (type === 'p') {
      currentPid = Number(value);
      if (Number.isFinite(currentPid) && !byPid.has(currentPid)) {
        byPid.set(currentPid, new Set());
      }
      continue;
    }

    if (type !== 'n' || !Number.isFinite(currentPid)) {
      continue;
    }

    const portMatch = value.match(/:(\d+)$/);
    if (!portMatch) {
      continue;
    }

    const port = Number(portMatch[1]);
    if (Number.isInteger(port) && port > 0) {
      byPid.get(currentPid).add(port);
    }
  }

  return new Map(
    [...byPid.entries()].map(([pid, ports]) => [pid, [...ports].sort((a, b) => a - b)])
  );
}

export async function listListeningPortsByPid() {
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pn'], {
      maxBuffer: 1024 * 1024 * 4
    });
    return parseListenPorts(stdout);
  } catch {
    return new Map();
  }
}

export function isDeveloperProcess(process, patterns) {
  const haystack = `${process.command} ${process.commandPath} ${process.args}`.toLowerCase();
  return patterns.some((pattern) => {
    const clean = String(pattern).trim().toLowerCase();
    return clean && haystack.includes(clean);
  });
}

export async function listProcesses(config) {
  const cpuCount = Math.max(1, os.cpus().length);
  const [{ stdout }, listeningPortsByPid] = await Promise.all([
    execFileAsync('ps', ['-axo', PS_FIELDS.join(',')], {
      maxBuffer: 1024 * 1024 * 8
    }),
    listListeningPortsByPid()
  ]);
  const processes = parseProcessList(stdout)
    .map((process) => {
      const listeningPorts = listeningPortsByPid.get(process.pid) || [];
      return {
        ...process,
        rawCpu: process.cpu,
        cpu: Math.min(100, process.cpu / cpuCount),
        listeningPorts,
        localUrls: listeningPorts.map((port) => `http://127.0.0.1:${port}`),
        developer: isDeveloperProcess(process, config.developerProcessPatterns)
      };
    })
    .sort((a, b) => a.pid - b.pid);

  return {
    all: processes,
    developer: processes.filter((process) => process.developer),
    updatedAt: new Date().toISOString()
  };
}

export function killProcess(pid, signal = 'TERM') {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    throw new Error('Invalid PID');
  }

  process.kill(numericPid, signal);
}

export function openUrl(url) {
  const child = spawn('open', [url], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}
