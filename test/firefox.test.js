import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefoxManifest } from '../scripts/build-firefox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('generates the Firefox manifest without mutating the Chrome manifest', async () => {
  const chromeManifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const original = structuredClone(chromeManifest);
  const firefox = firefoxManifest(chromeManifest);

  assert.equal(firefox.version, chromeManifest.version);
  assert.equal(firefox.minimum_chrome_version, undefined);
  assert.equal(firefox.side_panel, undefined);
  assert.equal(firefox.options_page, undefined);
  assert.equal(firefox.background.service_worker, undefined);
  assert.equal(firefox.permissions.includes('sidePanel'), false);
  assert.deepEqual(firefox.sidebar_action, {
    default_panel: 'sidepanel.html',
    default_title: 'ZUREQ Shopper',
    default_icon: { '16': 'icons/icon16.png', '48': 'icons/icon48.png' },
    open_at_install: false
  });
  assert.deepEqual(firefox.background, { scripts: ['background.js'], type: 'module' });
  assert.deepEqual(firefox.options_ui, { page: 'options.html', open_in_tab: true });
  assert.deepEqual(firefox.browser_specific_settings.gecko, {
    id: '{0bf25f58-37af-4035-bbdd-d96dada5d5e4}',
    strict_min_version: '142.0',
    data_collection_permissions: {
      required: ['authenticationInfo', 'searchTerms', 'websiteContent']
    }
  });
  assert.deepEqual(chromeManifest, original);
});

test('both packagers use the shared list and every listed file exists', async () => {
  const files = (await readFile(path.join(root, 'scripts', 'files.txt'), 'utf8'))
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter((file) => file && !file.startsWith('#'));
  const chromePackager = await readFile(path.join(root, 'scripts', 'package.sh'), 'utf8');
  const firefoxPackager = await readFile(path.join(root, 'scripts', 'build-firefox.js'), 'utf8');

  assert.ok(files.length > 0);
  for (const file of files) {
    await assert.doesNotReject(access(path.join(root, file)), `${file} must exist`);
  }
  assert.match(chromePackager, /scripts\/files\.txt/);
  assert.match(firefoxPackager, /scripts', 'files\.txt/);
});
