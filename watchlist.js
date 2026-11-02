import { applyLiveDetails, locationArgs, ZureqError } from './zureq.js';

export const WATCH_ALARM = 'zureq-watchlist';
export const WATCH_INTERVALS = Object.freeze({
  '6': 360,
  '12': 720,
  '24': 1440,
  '168': 10080
});

const WATCH_KEY = 'zureqWatchlist';
const MAX_WATCHES = 25;
const MAX_HISTORY_POINTS = 90;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ALERT_REASONS = new Set(['target', 'cheaper', 'restock']);

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((point) => point
      && Number.isFinite(point.t)
      && Number.isFinite(point.p))
    .map(({ t, p }) => ({ t, p }))
    .sort((a, b) => a.t - b.t)
    .slice(-MAX_HISTORY_POINTS);
}

export function historyStats(history, now, days = 30) {
  if (!Number.isFinite(now)) return { low30: null, high30: null, points: 0 };
  const end = now;
  const duration = Number.isFinite(days) && days >= 0 ? days * DAY_IN_MS : 30 * DAY_IN_MS;
  const points = normalizeHistory(history).filter(({ t }) => t >= end - duration && t <= end);
  const prices = points.map(({ p }) => p);
  return {
    low30: prices.length ? Math.min(...prices) : null,
    high30: prices.length ? Math.max(...prices) : null,
    points: prices.length
  };
}

export function historyPolyline(history, width = 120, height = 28) {
  const points = normalizeHistory(history);
  if (points.length < 2 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 4 || height <= 4) {
    return '';
  }
  const padding = 2;
  const min = Math.min(...points.map(({ p }) => p));
  const max = Math.max(...points.map(({ p }) => p));
  const priceRange = max - min;
  return points.map(({ p }, index) => {
    const x = padding + index * (width - padding * 2) / (points.length - 1);
    const y = priceRange === 0
      ? height / 2
      : height - padding - (p - min) * (height - padding * 2) / priceRange;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function searchBaseline(products) {
  const currencies = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const rawPrice = product?.price;
    if (rawPrice == null || (typeof rawPrice === 'string' && !rawPrice.trim())) continue;
    const price = Number(rawPrice);
    const currency = String(product?.currency || '').trim().toUpperCase();
    if (!Number.isFinite(price) || !currency) continue;
    const group = currencies.get(currency) || { count: 0, price };
    group.count += 1;
    group.price = Math.min(group.price, price);
    currencies.set(currency, group);
  }
  let baseline = null;
  for (const [currency, group] of currencies) {
    if (!baseline || group.count > baseline.count) {
      baseline = { price: group.price, currency, count: group.count };
    }
  }
  return baseline ? { price: baseline.price, currency: baseline.currency } : null;
}

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
  const targetPrice = Number(partial.targetPrice);
  const createdAt = Number.isFinite(partial.createdAt) ? partial.createdAt : Date.now();
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
    targetPrice: Number.isFinite(targetPrice) && targetPrice > 0 ? targetPrice : null,
    targetHit: Boolean(partial.targetHit),
    lastInStock: typeof partial.lastInStock === 'boolean' ? partial.lastInStock : null,
    unavailable: Boolean(partial.unavailable),
    lastPrice: partial.lastPrice ?? null,
    lastCurrency: partial.lastCurrency ?? null,
    lastCheckedAt: partial.lastCheckedAt ?? null,
    lastResult: partial.lastResult ?? null,
    history: normalizeHistory(partial.history),
    alert: Boolean(partial.alert),
    alertReason: ALERT_REASONS.has(partial.alertReason) ? partial.alertReason : null,
    createdAt
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
  const bestPrice = finitePrice(best);
  return {
    best,
    cheaper: Boolean(best && bestPrice < Number(watch.baseline?.price)),
    hitTarget: watch.targetPrice != null && bestPrice != null && bestPrice <= Number(watch.targetPrice)
  };
}

export function applyResult(watch, evaluation, now = Date.now()) {
  const best = evaluation?.best || null;
  const alert = Boolean(watch.targetPrice != null ? evaluation?.hitTarget : evaluation?.cheaper);
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
    targetHit: watch.targetPrice != null ? Boolean(evaluation?.hitTarget) : false,
    alert,
    alertReason: alert ? (watch.targetPrice != null ? 'target' : 'cheaper') : null
  };
}

export async function getWatches() {
  const values = await chrome.storage.local.get({ [WATCH_KEY]: [] });
  return Array.isArray(values[WATCH_KEY]) ? values[WATCH_KEY].map(normalizeWatch) : [];
}

export async function saveWatches(list) {
  await chrome.storage.local.set({ [WATCH_KEY]: Array.isArray(list) ? list : [] });
}

export async function addWatch(partial) {
  const watch = normalizeWatch(partial);
  const baselinePrice = partial?.baseline?.price;
  if (!watch.history.length
    && baselinePrice != null
    && !(typeof baselinePrice === 'string' && !baselinePrice.trim())
    && Number.isFinite(Number(baselinePrice))) {
    watch.history = [{ t: watch.createdAt, p: Number(baselinePrice) }];
  }
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

export async function setWatchTarget(id, price) {
  const targetPrice = price == null ? null : Number(price);
  const normalizedTarget = Number.isFinite(targetPrice) && targetPrice > 0 ? targetPrice : null;
  const next = (await getWatches()).map((watch) => watch.id === id
    ? { ...watch, targetPrice: normalizedTarget, alert: false, alertReason: null, targetHit: false }
    : watch);
  await saveWatches(next);
  return next;
}

export async function clearAlerts() {
  const next = (await getWatches()).map((watch) => ({ ...watch, alert: false, alertReason: null }));
  await saveWatches(next);
  return next;
}

function hasLivePrice(value) {
  return value != null
    && !(typeof value === 'string' && !value.trim())
    && Number.isFinite(Number(value));
}

function isMissingProduct(error) {
  return error instanceof ZureqError
    && error.code === 'API_ERROR'
    && /shop\b.+\bhas no product with sku\b/i.test(String(error.message || ''));
}

function applyAlertState(watch, updated) {
  if (watch.type === 'product' && updated.lastInStock === false) {
    updated.alert = false;
    updated.alertReason = null;
    updated.targetHit = false;
    return;
  }
  if (watch.type === 'product' && updated.lastInStock === true && watch.lastInStock === false) {
    updated.alert = true;
    updated.alertReason = 'restock';
    return;
  }
  if (watch.targetPrice != null) {
    const hitTarget = Boolean(updated.targetHit);
    updated.alert = hitTarget && (!watch.targetHit || watch.alert);
  } else {
    const newLow = updated.alert && (watch.lastPrice == null || updated.lastPrice < watch.lastPrice);
    updated.alert = Boolean(newLow || (watch.alert && updated.alert));
  }
  updated.alertReason = updated.alert
    ? (watch.alert && watch.alertReason ? watch.alertReason : watch.targetPrice != null ? 'target' : 'cheaper')
    : null;
}

export async function checkWatchlist(callTool, { notify = () => {}, setBadge = () => {} } = {}) {
  const watches = await getWatches();
  const next = [...watches];
  const newlyAlerting = [];
  let checked = 0;

  for (let index = 0; index < watches.length; index += 1) {
    const watch = watches[index];
    const checkedAt = Date.now();
    try {
      let updated;
      if (watch.type === 'product') {
        const data = await callTool('get_product', { shopId: watch.shopId, sku: watch.sku });
        const details = data?.product || data;
        const base = {
          ...(watch.lastResult || {}),
          shopId: watch.shopId,
          sku: watch.sku,
          name: watch.name,
          price: watch.lastPrice,
          currency: watch.lastCurrency || watch.baseline.currency,
          inStock: watch.lastInStock
        };
        const { product: liveProduct } = applyLiveDetails(base, details);
        const product = {
          ...liveProduct,
          name: details?.name || liveProduct.name || watch.name,
          shopName: details?.shopName || liveProduct.shopName
        };
        const hasPrice = hasLivePrice(details?.price);
        const evaluation = evaluateWatch(watch, hasPrice ? [product] : []);
        updated = applyResult(watch, evaluation, checkedAt);
        updated.lastInStock = typeof product.inStock === 'boolean' ? product.inStock : watch.lastInStock;
        updated.unavailable = false;
      } else {
        const args = { query: watch.query, ...locationArgs(watch.country), inStockOnly: true, limit: 10 };
        const data = await callTool('search_products', args);
        updated = applyResult(watch, evaluateWatch(watch, data?.products || []), checkedAt);
      }
      applyAlertState(watch, updated);
      if (Number.isFinite(updated.lastPrice)
        && (watch.type !== 'product' || updated.lastInStock === true)) {
        updated.history = normalizeHistory([
          ...watch.history,
          { t: checkedAt, p: updated.lastPrice }
        ]);
      }
      next[index] = updated;
      checked += 1;
      if (!watch.alert && updated.alert) newlyAlerting.push(updated);
    } catch (error) {
      if (['NO_KEY', 'CREDITS_EXHAUSTED', 'BAD_KEY'].includes(error?.code)) break;
      if (isMissingProduct(error)) {
        next[index] = {
          ...watch,
          unavailable: true,
          lastCheckedAt: checkedAt,
          targetHit: false,
          alert: false,
          alertReason: null
        };
        checked += 1;
        continue;
      }
      next[index] = { ...watch, lastCheckedAt: checkedAt };
      checked += 1;
    }
  }

  await saveWatches(next);
  const alerts = next.filter((watch) => watch.alert).length;
  await setBadge(alerts);
  for (const watch of newlyAlerting) await notify(watch);
  return { checked, alerts };
}
