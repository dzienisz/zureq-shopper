import { ZureqError, callTool, cacheMarkets, getCachedMarkets, normalizeMarkets } from './zureq.js';
import { connect, disconnect, isConnected } from './auth.js';
import { storeFor } from './stores.js';

const $ = (id) => document.getElementById(id);
const store = storeFor({ runtimeId: chrome.runtime.id, userAgent: navigator.userAgent });
let countriesLoadPromise = null;
const status = (message, error = false) => {
  $('status').textContent = message;
  $('status').className = error ? 'error' : '';
};
async function renderAccount() {
  const settings = await chrome.storage.sync.get({ zureqApiKey: '' });
  const hasKey = Boolean(String(settings.zureqApiKey || '').trim());
  let connected = await isConnected();
  let credits = '—';
  if (connected) {
    try {
      const usage = await callTool('get_usage', {});
      const remaining = Number(usage?.remaining ?? (Number(usage?.included) - Number(usage?.used)));
      if (Number.isFinite(remaining)) credits = remaining.toLocaleString('en-US', { maximumFractionDigits: 0 });
    } catch (error) {
      if (error?.code === 'NO_KEY') connected = await isConnected();
    }
  }
  $('account-status').textContent = connected ? `Connected to ZUREQ · ${credits} credits remaining` : 'Not connected to ZUREQ.';
  $('account-hint').classList.toggle('hidden', connected);
  $('connect-account').classList.toggle('hidden', connected);
  $('disconnect-account').classList.toggle('hidden', !connected);
  $('api-key-details').open = hasKey && !connected;
  $('saved-key-hint').classList.toggle('hidden', !(hasKey && connected));
}
function fillCountries(data) {
  const select = $('default-country');
  for (const market of normalizeMarkets(data)) {
    if ([...select.options].some((option) => option.value === market.code)) continue;
    const option = document.createElement('option');
    option.value = market.code;
    option.textContent = `${market.label}${market.count != null ? ` (${market.count})` : ''}`;
    select.append(option);
  }
}
function loadCountries() {
  if (!countriesLoadPromise) {
    countriesLoadPromise = (async () => {
      const settings = await chrome.storage.sync.get({ zureqApiKey: '', defaultCountry: '' });
      try {
        let markets = await getCachedMarkets();
        if (!markets && (String(settings.zureqApiKey || '').trim() || await isConnected())) {
          markets = await callTool('list_markets', {});
          await cacheMarkets(markets);
        }
        if (markets) fillCountries(markets);
      } catch {}
      $('default-country').value = settings.defaultCountry;
    })().finally(() => {
      countriesLoadPromise = null;
    });
  }
  return countriesLoadPromise;
}
$('toggle-key').addEventListener('click', () => {
  const input = $('api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
  $('toggle-key').textContent = input.type === 'password' ? 'Show' : 'Hide';
});
$('connect-account').addEventListener('click', async () => {
  $('connect-account').disabled = true;
  try {
    await connect();
    status('');
    await Promise.all([renderAccount(), loadCountries()]);
  } catch (error) {
    status(error instanceof ZureqError ? error.message : 'Could not sign in with ZUREQ. Please try again.', true);
  } finally {
    $('connect-account').disabled = false;
  }
});
$('disconnect-account').addEventListener('click', async () => {
  $('disconnect-account').disabled = true;
  try {
    await disconnect();
    status('Disconnected from ZUREQ.');
    await renderAccount();
  } finally {
    $('disconnect-account').disabled = false;
  }
});
$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await chrome.storage.sync.set({
    zureqApiKey: $('api-key').value.trim(),
    defaultCountry: $('default-country').value,
    watchInterval: $('watch-interval').value,
    autoCompare: $('auto-compare').checked
  });
  status('Options saved.');
});
$('test-key').addEventListener('click', async () => {
  try {
    const apiKey = $('api-key').value.trim();
    const usage = await callTool('get_usage', {}, apiKey ? { apiKey } : {});
    status(`Connection successful. ${usage?.remaining ?? 'Your'} credits remaining.`);
  } catch (error) {
    status(error instanceof ZureqError ? error.message : 'Could not test the connection.', true);
  }
});
$('rate-store-link').href = store.reviewUrl;
$('copy-store-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(store.listingUrl);
    $('share-status').textContent = 'Link copied';
  } catch {
    $('share-status').textContent = 'Could not copy the store link.';
  }
});
if (typeof navigator.share === 'function') {
  $('share-store-link').classList.remove('hidden');
  $('share-store-link').addEventListener('click', async () => {
    try {
      await navigator.share({
        title: 'ZUREQ Shopper',
        text: 'Search independent shops from your browser\'s side panel.',
        url: store.listingUrl
      });
      $('share-status').textContent = '';
    } catch (error) {
      if (error?.name !== 'AbortError') $('share-status').textContent = 'Could not share the store link.';
    }
  });
}
async function init() {
  const settings = await chrome.storage.sync.get({ zureqApiKey: '', defaultCountry: '', watchInterval: '24', autoCompare: false });
  $('api-key').value = settings.zureqApiKey;
  $('default-country').value = settings.defaultCountry;
  $('watch-interval').value = settings.watchInterval || '24';
  $('auto-compare').checked = Boolean(settings.autoCompare);
  await renderAccount();
  await loadCountries();
}
function refreshAccountWhenVisible() {
  if (!document.hidden) renderAccount();
}
window.addEventListener('focus', refreshAccountWhenVisible);
document.addEventListener('visibilitychange', refreshAccountWhenVisible);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.zureqAuth
    && Boolean(changes.zureqAuth.oldValue?.refresh) !== Boolean(changes.zureqAuth.newValue?.refresh)) {
    status('');
    renderAccount();
    if (changes.zureqAuth.newValue?.refresh) loadCountries();
    return;
  }
  if (areaName === 'sync' && changes.zureqApiKey) renderAccount();
});
init();
