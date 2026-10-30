import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

test('manifest name and description fit Chrome Web Store limits', () => {
  assert.ok(manifest.description.length <= 132);
  assert.ok(manifest.name.length <= 75);
});
