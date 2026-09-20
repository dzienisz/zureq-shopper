export const WATCH_ALARM = 'zureq-watchlist';
export const WATCH_INTERVALS = Object.freeze({
  '6': 360,
  '12': 720,
  '24': 1440,
  '168': 10080
});

const WATCH_KEY = 'zureqWatchlist';
const MAX_WATCHES = 25;

function finitePrice(product) {
  const price = Number(product?.price);
  return Number.isFinite(price) ? price : null;
}

function sameCurrency(product, baselineCurrency) {
  if (!baselineCurrency) return true;
  return String(product?.currency || '').toUpperCase() === String(baselineCurrency).toUpperCase();
}

function newId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random()}`;
}

function normalizeWatch(partial = {}) {
  return {
    id: partial.id || newId(),
    type: partial.type === 'product' ? 'product' : 'query',
    query: String(partial.query || ''),
    country: String(partial.country || ''),
    ...(partial.shopId != null ? { shopId: partial.shopId } : {}),
    ...(partial.sku != null ? { sku: partial.sku } : {}),
    name: String(partial.name || partial.query || 'Watched item'),
    baseline: {
      price: Number(partial.baseline?.price),
      currency: String(partial.baseline?.currency || '').toUpperCase()
    },
    lastPrice: partial.lastPrice ?? null,
    lastCurrency: partial.lastCurrency ?? null,
    lastCheckedAt: partial.lastCheckedAt ?? null,
    lastResult: partial.lastResult ?? null,
    alert: Boolean(partial.alert),
    createdAt: partial.createdAt || Date.now()
  };
}

export function evaluateWatch(watch, products) {
  const baselineCurrency = watch.baseline?.currency;
  const candidates = (Array.isArray(products) ? products : [])
    .filter((product) => watch.type !== 'product'
      || (String(product?.shopId) === String(watch.shopId)
        && String(product?.sku) === String(watch.sku)))
    .filter((product) => sameCurrency(product, baselineCurrency))
    .map((product) => ({ product, price: finitePrice(product) }))
    .filter(({ price }) => price != null)
    .sort((a, b) => a.price - b.price);
  const best = candidates[0]?.product || null;
  return {
    best,
    cheaper: Boolean(best && finitePrice(best) < Number(watch.baseline?.price))
  };
}

export function applyResult(watch, evaluation, now = Date.now()) {
  const best = evaluation?.best || null;
  return {
    ...watch,
    lastCheckedAt: now,
    lastPrice: best ? finitePrice(best) : null,
    lastCurrency: best?.currency || null,
    lastResult: best ? {
      name: best.name,
      price: best.price,
      currency: best.currency,
      shopName: best.shopName,
      shopId: best.shopId,
      sku: best.sku
    } : null,
    alert: Boolean(evaluation?.cheaper)
  };
}

export async function getWatches() {
  const values = await chrome.storage.local.get({ [WATCH_KEY]: [] });
  return Array.isArray(values[WATCH_KEY]) ? values[WATCH_KEY] : [];
}

export async function saveWatches(list) {
  await chrome.storage.local.set({ [WATCH_KEY]: Array.isArray(list) ? list : [] });
}

export async function addWatch(partial) {
  const watch = normalizeWatch(partial);
  const watches = await getWatches();
  const isSame = (item) => item.type === watch.type
    && item.query === watch.query
    && item.country === watch.country
    && (watch.type !== 'product'
      || (String(item.shopId) === String(watch.shopId) && String(item.sku) === String(watch.sku)));
  const next = [...watches.filter((item) => !isSame(item)), watch]
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
    .slice(-MAX_WATCHES);
  await saveWatches(next);
  return watch;
}

export async function removeWatch(id) {
  const next = (await getWatches()).filter((watch) => watch.id !== id);
  await saveWatches(next);
  return next;
}

export async function clearAlerts() {
  const next = (await getWatches()).map((watch) => ({ ...watch, alert: false }));
  await saveWatches(next);
  return next;
}

export async function checkWatchlist(callTool, { notify = () => {}, setBadge = () => {} } = {}) {
  const watches = await getWatches();
  const next = [...watches];
  const newlyAlerting = [];
  let checked = 0;

  for (let index = 0; index < watches.length; index += 1) {
    const watch = watches[index];
    const args = { query: watch.query, inStockOnly: true, limit: 10 };
    if (watch.country) args.country = watch.country;
    try {
      const data = await callTool('search_products', args);
      const updated = applyResult(watch, evaluateWatch(watch, data?.products || []));
      const newLow = updated.alert && (watch.lastPrice == null || updated.lastPrice < watch.lastPrice);
      updated.alert = Boolean(watch.alert || newLow);
      next[index] = updated;
      checked += 1;
      if (!watch.alert && updated.alert) newlyAlerting.push(updated);
    } catch (error) {
      if (['NO_KEY', 'CREDITS_EXHAUSTED', 'BAD_KEY'].includes(error?.code)) break;
      next[index] = { ...watch, lastCheckedAt: Date.now() };
      checked += 1;
    }
  }

  await saveWatches(next);
  const alerts = next.filter((watch) => watch.alert).length;
  await setBadge(alerts);
  for (const watch of newlyAlerting) await notify(watch);
  return { checked, alerts };
}
