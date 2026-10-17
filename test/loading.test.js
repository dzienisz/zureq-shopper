import assert from 'node:assert/strict';
import test from 'node:test';
import { setBusy, skeletonHtml } from '../loading.js';

function fakeButton(textContent) {
  const classes = new Set();
  const attributes = new Map();
  return {
    textContent,
    innerHTML: textContent,
    disabled: false,
    dataset: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name)
    },
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    getAttribute: (name) => attributes.get(name)
  };
}

test('renders the requested number of product skeleton cards', () => {
  const html = skeletonHtml('product', 2);
  assert.equal([...html.matchAll(/<article class="card skeleton"/g)].length, 2);
  assert.equal([...html.matchAll(/aria-hidden="true"/g)].length, 2);
  assert.equal([...html.matchAll(/class="skeleton-bar /g)].length, 6);
});

test('clamps skeleton counts to one through six and defaults invalid counts to three', () => {
  assert.equal([...skeletonHtml('product', 0).matchAll(/<article class="card skeleton"/g)].length, 1);
  assert.equal([...skeletonHtml('product', 99).matchAll(/<article class="card skeleton"/g)].length, 6);
  assert.equal([...skeletonHtml('product', Number.NaN).matchAll(/<article class="card skeleton"/g)].length, 3);
});

test('renders market skeletons with heading and three line bars', () => {
  const html = skeletonHtml('market', 2);
  assert.equal([...html.matchAll(/<article class="market-result skeleton"/g)].length, 2);
  assert.equal([...html.matchAll(/class="skeleton-bar skeleton-heading"/g)].length, 2);
  assert.equal([...html.matchAll(/class="skeleton-bar skeleton-line"/g)].length, 6);
  assert.equal([...html.matchAll(/aria-hidden="true"/g)].length, 2);
});

test('sets and restores a button busy state', () => {
  const button = fakeButton('Search');

  setBusy(button, true, 'Searching…');
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.classList.contains('is-loading'), true);
  assert.equal(button.dataset.idleLabel, 'Search');
  assert.match(button.innerHTML, /Searching…/);

  setBusy(button, false);
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), undefined);
  assert.equal(button.classList.contains('is-loading'), false);
  assert.equal(button.textContent, 'Search');
  assert.equal('idleLabel' in button.dataset, false);
});

test('escapes labels and treats a null button as a no-op', () => {
  const button = fakeButton('Details');
  setBusy(button, true, '<img src="x"> & wait');
  assert.equal(button.innerHTML, '<span class="spinner" aria-hidden="true"></span>&lt;img src=&quot;x&quot;&gt; &amp; wait');
  assert.doesNotThrow(() => setBusy(null, true, 'Loading…'));
});
