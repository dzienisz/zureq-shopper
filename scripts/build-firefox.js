import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const firefoxDir = path.join(root, 'dist', 'firefox');

export function firefoxManifest(chromeManifest) {
  const manifest = structuredClone(chromeManifest);
  delete manifest.minimum_chrome_version;
  delete manifest.side_panel;
  delete manifest.options_page;
  manifest.permissions = (manifest.permissions || []).filter((permission) => permission !== 'sidePanel');
  manifest.sidebar_action = {
    default_panel: 'sidepanel.html',
    default_title: 'ZUREQ Shopper',
    default_icon: { '16': 'icons/icon16.png', '48': 'icons/icon48.png' },
    open_at_install: false
  };
  manifest.background = { scripts: ['background.js'], type: 'module' };
  manifest.options_ui = { page: 'options.html', open_in_tab: true };
  manifest.browser_specific_settings = {
    ...manifest.browser_specific_settings,
    gecko: {
      id: '{0bf25f58-37af-4035-bbdd-d96dada5d5e4}',
      strict_min_version: '142.0',
      data_collection_permissions: {
        required: ['authenticationInfo', 'searchTerms', 'websiteContent']
      }
    }
  };
  return manifest;
}

async function packagingFiles() {
  return (await readFile(path.join(root, 'scripts', 'files.txt'), 'utf8'))
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter((file) => file && !file.startsWith('#'));
}

function verifyFirefoxZip(zipPath) {
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^\.\//, ''))
    .filter(Boolean);
  const forbiddenEntry = entries.find((entry) => /^(test|store-assets|dist)\//.test(entry));
  if (forbiddenEntry) {
    throw new Error(`Firefox package must not include ${forbiddenEntry}`);
  }
  const contents = execFileSync('unzip', ['-p', zipPath], { maxBuffer: 32 * 1024 * 1024 });
  if (contents.includes(Buffer.from('zmcp_'))) {
    throw new Error('Firefox package contains a zmcp_ literal');
  }
}

export async function buildFirefox({ zip = process.argv.includes('--zip') } = {}) {
  const chromeManifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const firefox = firefoxManifest(chromeManifest);
  const files = await packagingFiles();

  await rm(firefoxDir, { recursive: true, force: true });
  await mkdir(firefoxDir, { recursive: true });
  for (const file of files) {
    if (file !== 'manifest.json') {
      const target = path.join(firefoxDir, file);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(root, file), target);
    }
  }
  await writeFile(path.join(firefoxDir, 'manifest.json'), `${JSON.stringify(firefox, null, 2)}\n`);
  console.log(`Built ${path.relative(root, firefoxDir)}`);

  if (zip) {
    const distDir = path.dirname(firefoxDir);
    const zipPath = path.join(distDir, `zureq-shopper-firefox-${firefox.version}.zip`);
    await rm(zipPath, { force: true });
    execFileSync('zip', ['-q', '-r', zipPath, '.', '-x', '*.DS_Store'], { cwd: firefoxDir });
    verifyFirefoxZip(zipPath);
    console.log(`Built and verified ${path.relative(root, zipPath)}`);
  }

  return firefox;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildFirefox();
}
