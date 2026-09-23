import { ZureqError, callTool, cacheMarkets, getCachedMarkets } from './zureq.js';

const $ = (id) => document.getElementById(id);
const status = (message, error = false) => {
  $('status').textContent = message;
  $('status').className = error ? 'error' : '';
};
function fillCountries(data) {
  const list = data?.markets || data?.countries || data?.items || (Array.isArray(data) ? data : []);
  const select = $('default-country');
  for (const item of list) {
    const code = typeof item === 'string' ? item : item.code || item.isoCode || item.country;
    if (!code || [...select.options].some((option) => option.value === code)) continue;
    const option = document.createElement('option');
    option.value = code;
    option.textContent = typeof item === 'string' ? item : item.name || code;
    select.append(option);
  }
}
$('toggle-key').addEventListener('click', () => {
  const input = $('api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
  $('toggle-key').textContent = input.type === 'password' ? 'Show' : 'Hide';
});
$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await chrome.storage.sync.set({
    zureqApiKey: $('api-key').value.trim(),
    defaultCountry: $('default-country').value,
    defaultCurrency: $('default-currency').value.trim().toUpperCase() || 'PLN',
    watchInterval: $('watch-interval').value
  });
  status('Options saved.');
});
$('test-key').addEventListener('click', async () => {
  if ($('api-key').value.trim()) await chrome.storage.sync.set({ zureqApiKey: $('api-key').value.trim() });
  try {
    const usage = await callTool('get_usage', {});
    status(`Connection successful. ${usage?.remaining ?? 'Your'} credits remaining.`);
  } catch (error) {
    status(error instanceof ZureqError ? error.message : 'Could not test the connection.', true);
  }
});
async function init() {
  const settings = await chrome.storage.sync.get({ zureqApiKey: '', defaultCountry: '', defaultCurrency: 'PLN', watchInterval: '24' });
  $('api-key').value = settings.zureqApiKey;
  $('default-currency').value = settings.defaultCurrency;
  $('default-country').value = settings.defaultCountry;
  $('watch-interval').value = settings.watchInterval || '24';
  try {
    let markets = await getCachedMarkets();
    if (!markets && settings.zureqApiKey) {
      markets = await callTool('list_markets', {});
      await cacheMarkets(markets);
    }
    if (markets) fillCountries(markets);
    $('default-country').value = settings.defaultCountry;
  } catch {}
}
init();
