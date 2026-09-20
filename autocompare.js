export const AUTO_COMPARE_TTL = 6 * 60 * 60 * 1000;

export function cacheKey(country, query) {
  return `${country || ''}|${String(query || '').toLowerCase()}`;
}

export function getCached(cache, key, now = Date.now()) {
  const entry = cache?.[key];
  if (!entry || now - Number(entry.savedAt) >= AUTO_COMPARE_TTL) return null;
  return entry.best ?? null;
}

export function putCached(cache, key, best, now = Date.now()) {
  const target = cache && typeof cache === 'object' ? cache : {};
  target[key] = { best: best || null, savedAt: now };
  const entries = Object.entries(target)
    .sort(([, left], [, right]) => Number(left.savedAt) - Number(right.savedAt));
  entries.slice(0, -100).forEach(([entryKey]) => delete target[entryKey]);
  return target;
}

function price(candidate) {
  const value = Number(candidate?.price);
  return Number.isFinite(value) ? value : null;
}

export function pickBest(products, source = {}) {
  const sourceCurrency = source.currency ? String(source.currency).toUpperCase() : null;
  const usable = (Array.isArray(products) ? products : []).filter((product) => {
    const value = price(product);
    return value != null && (!sourceCurrency || String(product.currency || '').toUpperCase() === sourceCurrency);
  });
  const best = usable.reduce((current, product) => (
    !current || price(product) < price(current) ? product : current
  ), null);
  const sourcePrice = Number(source.price);
  return {
    best,
    cheaper: Boolean(best && Number.isFinite(sourcePrice) && price(best) < sourcePrice)
  };
}
