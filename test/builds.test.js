import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILD_TEMPLATES, partsForBuild } from '../builds.js';

test('matches an FPV drone build template', () => {
  const result = partsForBuild('I want to build an FPV quad');
  assert.equal(result.template.id, 'fpv-drone');
  assert.ok(result.parts.some((part) => part.query === 'flight controller F7'));
  assert.ok(BUILD_TEMPLATES.length >= 5);
});

test('matches a camera drone build before generic drone', () => {
  assert.equal(partsForBuild('DJI camera drone').template.id, 'camera-drone');
});

test('creates a custom comma-separated parts list', () => {
  const result = partsForBuild('USB hub, monitor 27, desk lamp');
  assert.equal(result.template, null);
  assert.deepEqual(result.parts.map((part) => part.query), ['USB hub', 'monitor 27', 'desk lamp']);
});

test('returns null when no build matches', () => {
  assert.equal(partsForBuild('something completely unrelated'), null);
});
