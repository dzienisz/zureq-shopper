import { ZureqError, callTool, cacheMarkets, getCachedMarkets, normalizeMarkets } from './zureq.js';
import { connect, disconnect, isConnected } from './auth.js';

const $ = (id) => document.getElementById(id);
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
    await renderAccount();
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
async function init() {
  const settings = await chrome.storage.sync.get({ zureqApiKey: '', defaultCountry: '', watchInterval: '24', autoCompare: false });
  $('api-key').value = settings.zureqApiKey;
  $('default-country').value = settings.defaultCountry;
  $('watch-interval').value = settings.watchInterval || '24';
  $('auto-compare').checked = Boolean(settings.autoCompare);
  await renderAccount();
  try {
    let markets = await getCachedMarkets();
    if (!markets && (settings.zureqApiKey || await isConnected())) {
      markets = await callTool('list_markets', {});
      await cacheMarkets(markets);
    }
    if (markets) fillCountries(markets);
    $('default-country').value = settings.defaultCountry;
  } catch {}
}
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    (areaName === 'local'
      && changes.zureqAuth
      && Boolean(changes.zureqAuth.oldValue?.refresh) !== Boolean(changes.zureqAuth.newValue?.refresh))
    || (areaName === 'sync' && changes.zureqApiKey)
  ) {
    renderAccount();
  }
});
init();
