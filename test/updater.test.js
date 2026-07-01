import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, normalizeVersion } from '../src/updater.js';

test('normalizeVersion removes a leading v', () => {
  assert.equal(normalizeVersion('v1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('V2.0.0'), '2.0.0');
});

test('compareVersions compares semantic version numbers', () => {
  assert.equal(compareVersions('1.2.3', '1.2.2'), 1);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.3', '1.3.0'), -1);
  assert.equal(compareVersions('v2.0.0', '1.9.9'), 1);
});
