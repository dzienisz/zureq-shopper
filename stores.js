export const RATE_PROMPT_MIN_AGE_MS = 3 * 24 * 60 * 60 * 1000;
export const RATE_PROMPT_MIN_SEARCHES = 5;
export const RATE_PROMPT_MAX_SHOWN = 3;

const CHROME_STORE = {
  id: 'chrome',
  name: 'Chrome Web Store',
  listingUrl: 'https://chromewebstore.google.com/detail/lgmpclicbbpjabhihbmpjdokopeiofpj',
  reviewUrl: 'https://chromewebstore.google.com/detail/lgmpclicbbpjabhihbmpjdokopeiofpj/reviews'
};

const EDGE_STORE = {
  id: 'edge',
  name: 'Edge Add-ons',
  listingUrl: 'https://microsoftedge.microsoft.com/addons/detail/oejmieokkpamieajepjogejppmnndbkk',
  reviewUrl: 'https://microsoftedge.microsoft.com/addons/detail/oejmieokkpamieajepjogejppmnndbkk'
};

const FIREFOX_STORE = {
  id: 'firefox',
  name: 'Firefox Add-ons',
  listingUrl: 'https://addons.mozilla.org/firefox/addon/zureq-shopper/',
  reviewUrl: 'https://addons.mozilla.org/firefox/addon/zureq-shopper/reviews/'
};

export function storeFor({ runtimeId = '', userAgent = '' } = {}) {
  if (runtimeId === 'lgmpclicbbpjabhihbmpjdokopeiofpj') return CHROME_STORE;
  if (runtimeId === 'oejmieokkpamieajepjogejppmnndbkk') return EDGE_STORE;
  if (runtimeId === '{0bf25f58-37af-4035-bbdd-d96dada5d5e4}') return FIREFOX_STORE;
  if (String(userAgent).includes('Edg/')) return EDGE_STORE;
  if (String(userAgent).includes('Firefox/')) return FIREFOX_STORE;
  return CHROME_STORE;
}

export function shouldShowRatePrompt(state = {}, now = Date.now()) {
  return Number.isFinite(state?.installedAt)
    && now - state.installedAt >= RATE_PROMPT_MIN_AGE_MS
    && Number(state?.successfulSearches || 0) >= RATE_PROMPT_MIN_SEARCHES
    && !state?.ratePromptDone
    && Number(state?.ratePromptShown || 0) < RATE_PROMPT_MAX_SHOWN;
}
