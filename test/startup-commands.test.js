import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStartupCommands } from '../src/startup-commands.js';

test('sanitizeStartupCommands keeps valid commands sorted by priority', () => {
  const commands = sanitizeStartupCommands([
    { name: 'second', command: 'echo second', priority: 20 },
    { name: 'empty', command: '   ', priority: 1 },
    { name: 'first', command: 'echo first', priority: 10, enabled: false }
  ]);

  assert.equal(commands.length, 2);
  assert.equal(commands[0].name, 'first');
  assert.equal(commands[0].enabled, false);
  assert.equal(commands[1].name, 'second');
});
