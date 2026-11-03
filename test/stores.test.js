import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RATE_PROMPT_MAX_SHOWN,
  RATE_PROMPT_MIN_AGE_MS,
  RATE_PROMPT_MIN_SEARCHES,
  shouldShowRatePrompt,
  storeFor
} from '../stores.js';

test('storeFor maps each store extension ID to its listing and review URL', () => {
  assert.deepEqual(storeFor({ runtimeId: 'lgmpclicbbpjabhihbmpjdokopeiofpj' }), {
    id: 'chrome',
    name: 'Chrome Web Store',
    listingUrl: 'https://chromewebstore.google.com/detail/lgmpclicbbpjabhihbmpjdokopeiofpj',
    reviewUrl: 'https://chromewebstore.google.com/detail/lgmpclicbbpjabhihbmpjdokopeiofpj/reviews'
  });
  assert.deepEqual(storeFor({ runtimeId: 'oejmieokkpamieajepjogejppmnndbkk' }), {
    id: 'edge',
    name: 'Edge Add-ons',
    listingUrl: 'https://microsoftedge.microsoft.com/addons/detail/oejmieokkpamieajepjogejppmnndbkk',
    reviewUrl: 'https://microsoftedge.microsoft.com/addons/detail/oejmieokkpamieajepjogejppmnndbkk'
  });
  assert.deepEqual(storeFor({ runtimeId: '{0bf25f58-37af-4035-bbdd-d96dada5d5e4}' }), {
    id: 'firefox',
    name: 'Firefox Add-ons',
    listingUrl: 'https://addons.mozilla.org/firefox/addon/zureq-shopper/',
    reviewUrl: 'https://addons.mozilla.org/firefox/addon/zureq-shopper/reviews/'
  });
});

test('storeFor falls back to Edge, Firefox, then Chrome based on user agent', () => {
  assert.equal(storeFor({ runtimeId: 'unpacked', userAgent: 'Chrome/123 Edg/123' }).id, 'edge');
  assert.equal(storeFor({ runtimeId: 'unpacked', userAgent: 'Firefox/123' }).id, 'firefox');
  assert.equal(storeFor({ runtimeId: 'unpacked', userAgent: 'Chrome/123' }).id, 'chrome');
});

test('shouldShowRatePrompt uses the age and successful-search thresholds', () => {
  const now = 10 * RATE_PROMPT_MIN_AGE_MS;
  const state = {
    installedAt: now - RATE_PROMPT_MIN_AGE_MS,
    successfulSearches: RATE_PROMPT_MIN_SEARCHES,
    ratePromptShown: 0
  };

  assert.equal(shouldShowRatePrompt({ ...state, installedAt: state.installedAt + 1 }, now), false);
  assert.equal(shouldShowRatePrompt(state, now), true);
  assert.equal(shouldShowRatePrompt({ ...state, successfulSearches: RATE_PROMPT_MIN_SEARCHES - 1 }, now), false);
});

test('shouldShowRatePrompt requires a finite install date and respects dismissal and show limits', () => {
  const now = 10 * RATE_PROMPT_MIN_AGE_MS;
  const state = {
    installedAt: now - RATE_PROMPT_MIN_AGE_MS,
    successfulSearches: RATE_PROMPT_MIN_SEARCHES,
    ratePromptShown: RATE_PROMPT_MAX_SHOWN - 1
  };

  assert.equal(shouldShowRatePrompt(state, now), true);
  assert.equal(shouldShowRatePrompt({ ...state, installedAt: null }, now), false);
  assert.equal(shouldShowRatePrompt({ ...state, ratePromptDone: true }, now), false);
  assert.equal(shouldShowRatePrompt({ ...state, ratePromptShown: RATE_PROMPT_MAX_SHOWN }, now), false);
});
