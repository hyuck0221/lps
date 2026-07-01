#!/usr/bin/env node
import fs from 'node:fs';
import { spawn } from 'node:child_process';

function appendJson(filePath, payload) {
  fs.appendFileSync(filePath, `${JSON.stringify({ ...payload, at: new Date().toISOString() })}\n`);
}

function decodePayload() {
  const encoded = process.argv[2] || '';
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

const payload = decodePayload();
const { command, logPath, statusPath } = payload;

appendJson(statusPath, {
  id: command.id,
  name: command.name,
  priority: command.priority,
  status: 'started',
  pid: process.pid
});

const logFd = fs.openSync(logPath, 'a');
fs.writeSync(logFd, `\n[${new Date().toISOString()}] ${command.name} started\n`);

const child = spawn('/bin/zsh', ['-lc', command.command], {
  cwd: command.cwd || process.env.HOME,
  stdio: ['ignore', logFd, logFd]
});

appendJson(statusPath, {
  id: command.id,
  name: command.name,
  priority: command.priority,
  status: 'running',
  pid: child.pid || 0
});

child.on('error', (error) => {
  fs.writeSync(logFd, `[${new Date().toISOString()}] ${command.name} failed to start: ${error.message}\n`);
  appendJson(statusPath, {
    id: command.id,
    name: command.name,
    priority: command.priority,
    status: 'failed',
    pid: 0,
    error: error.message
  });
  fs.closeSync(logFd);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  const failed = code !== 0 || Boolean(signal);
  const message = signal ? `signal ${signal}` : `exit code ${code}`;
  fs.writeSync(logFd, `[${new Date().toISOString()}] ${command.name} finished with ${message}\n`);
  appendJson(statusPath, {
    id: command.id,
    name: command.name,
    priority: command.priority,
    status: failed ? 'failed' : 'completed',
    pid: child.pid || 0,
    exitCode: code,
    signal,
    error: failed ? message : ''
  });
  fs.closeSync(logFd);
  process.exit(failed ? 1 : 0);
});
