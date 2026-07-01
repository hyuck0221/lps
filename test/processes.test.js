import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferCommandName,
  isDeveloperProcess,
  parseListenPorts,
  parseProcessLine,
  parseProcessList
} from '../src/processes.js';

const sampleLine =
  ' 1234     1 shimhyuck        S      3.2  1.1 01:02:03 Wed Jul  1 09:11:12 2026      0  31  45678 123456 ??       java -jar local-process.jar';

test('parseProcessLine parses macOS ps fields with lstart spacing', () => {
  const process = parseProcessLine(sampleLine);

  assert.equal(process.pid, 1234);
  assert.equal(process.ppid, 1);
  assert.equal(process.user, 'shimhyuck');
  assert.equal(process.state, 'S');
  assert.equal(process.cpu, 3.2);
  assert.equal(process.memory, 1.1);
  assert.equal(process.elapsed, '01:02:03');
  assert.equal(process.started, 'Wed Jul 1 09:11:12 2026');
  assert.equal(process.command, 'java');
  assert.equal(process.args, 'java -jar local-process.jar');
});

test('parseProcessList skips the header row', () => {
  const stdout = `PID PPID USER STAT %CPU %MEM ELAPSED STARTED NI PRI RSS VSZ TTY COMM ARGS\n${sampleLine}\n`;
  const processes = parseProcessList(stdout);

  assert.equal(processes.length, 1);
  assert.equal(processes[0].pid, 1234);
});

test('isDeveloperProcess matches configured process patterns', () => {
  const process = parseProcessLine(sampleLine);

  assert.equal(isDeveloperProcess(process, ['java']), true);
  assert.equal(isDeveloperProcess(process, ['postgres']), false);
});

test('inferCommandName handles macOS app bundle paths with spaces', () => {
  assert.equal(
    inferCommandName('/Users/me/Applications/IntelliJ IDEA Ultimate.app/Contents/MacOS/idea'),
    'idea'
  );
});

test('parseListenPorts maps lsof listen ports by PID', () => {
  const stdout = [
    'p123',
    'cnode',
    'n127.0.0.1:3000',
    'n*:5173',
    'p456',
    'cpython',
    'n[::1]:8000',
    ''
  ].join('\n');
  const ports = parseListenPorts(stdout);

  assert.deepEqual(ports.get(123), [3000, 5173]);
  assert.deepEqual(ports.get(456), [8000]);
});
