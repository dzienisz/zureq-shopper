const round = (value) => Number(Number(value || 0).toFixed(2));

function candidateShopId(candidate) {
  return String(candidate.shopId ?? candidate.shopName ?? '');
}

function candidatePrice(candidate) {
  const price = Number(candidate?.price);
  return Number.isFinite(price) ? price : null;
}

function currencyCode(value) {
  return value == null || value === '' ? null : String(value).toUpperCase();
}

function mostCommonCurrency(candidates) {
  const counts = new Map();
  let selected = null;
  let bestCount = 0;
  candidates.forEach((candidate) => {
    const currency = currencyCode(candidate.currency);
    if (!currency) return;
    const count = (counts.get(currency) || 0) + 1;
    counts.set(currency, count);
    if (count > bestCount) {
      selected = currency;
      bestCount = count;
    }
  });
  return selected;
}

function cheapest(candidates) {
  return candidates.reduce((best, candidate) => {
    if (!best || candidatePrice(candidate) < candidatePrice(best)) return candidate;
    return best;
  }, null);
}

function assignmentStats(assignment, shippingPerShop) {
  const shops = new Set(assignment.map((item) => candidateShopId(item.candidate)));
  const itemsTotal = assignment.reduce((sum, item) => sum + candidatePrice(item.candidate), 0);
  const shipping = shippingPerShop * shops.size;
  return {
    itemsTotal,
    shopCount: shops.size,
    shipping,
    total: itemsTotal + shipping
  };
}

function sameAssignment(left, right) {
  return left.every((item, index) => item.candidate === right[index].candidate);
}

function betterAssignment(candidate, current, baseline, shippingPerShop) {
  if (!current) return true;
  const left = assignmentStats(candidate, shippingPerShop);
  const right = assignmentStats(current, shippingPerShop);
  if (left.total < right.total - 1e-9) return true;
  if (left.total > right.total + 1e-9) return false;
  if (left.shopCount !== right.shopCount) return left.shopCount < right.shopCount;
  if (sameAssignment(candidate, baseline)) return true;
  if (sameAssignment(current, baseline)) return false;
  return false;
}

function buildShops(assignments) {
  const groups = new Map();
  assignments.forEach(({ partId, partName, candidate }) => {
    const shopId = candidateShopId(candidate);
    if (!groups.has(shopId)) {
      groups.set(shopId, {
        shopId: candidate.shopId,
        shopName: candidate.shopName || candidate.shopId,
        items: [],
        subtotal: 0
      });
    }
    const group = groups.get(shopId);
    group.items.push({ partId, partName, candidate });
    group.subtotal += candidatePrice(candidate);
  });
  return [...groups.values()].map((group) => ({ ...group, subtotal: round(group.subtotal) }));
}

export function optimizeCart(parts, { shippingPerShop = 0, currency = null } = {}) {
  const considered = (Array.isArray(parts) ? parts : []).filter((part) => part.include);
  const withCandidates = considered.filter((part) => Array.isArray(part.candidates) && part.candidates.length);
  const selectedCurrency = currencyCode(currency) || mostCommonCurrency(withCandidates.flatMap((part) => part.candidates));
  const skipped = [];
  const usableParts = [];

  considered.forEach((part) => {
    if (!Array.isArray(part.candidates) || !part.candidates.length) {
      skipped.push({ id: part.id, name: part.name, reason: 'no-candidates' });
      return;
    }
    const candidates = part.candidates.filter((candidate) =>
      currencyCode(candidate.currency) === selectedCurrency && candidatePrice(candidate) != null);
    if (!candidates.length) {
      skipped.push({ id: part.id, name: part.name, reason: 'currency' });
      return;
    }
    usableParts.push({ ...part, usableCandidates: candidates });
  });

  const baseline = usableParts.map((part) => ({
    partId: part.id,
    partName: part.name,
    candidate: cheapest(part.usableCandidates)
  }));
  const shops = [];
  const shopCandidates = new Map();
  usableParts.forEach((part) => {
    part.usableCandidates.forEach((candidate) => {
      const shopId = candidateShopId(candidate);
      if (!shopCandidates.has(shopId)) {
        shopCandidates.set(shopId, new Map());
        shops.push(shopId);
      }
      const byPart = shopCandidates.get(shopId);
      const current = byPart.get(part.id);
      if (!current || candidatePrice(candidate) < candidatePrice(current)) byPart.set(part.id, candidate);
    });
  });

  const options = [baseline];
  shops.forEach((shopId) => {
    const byPart = shopCandidates.get(shopId);
    options.push(usableParts.map((part, index) => ({
      partId: part.id,
      partName: part.name,
      candidate: byPart.get(part.id) || baseline[index].candidate
    })));
  });
  for (let first = 0; first < shops.length; first += 1) {
    for (let second = first + 1; second < shops.length; second += 1) {
      const firstShop = shopCandidates.get(shops[first]);
      const secondShop = shopCandidates.get(shops[second]);
      options.push(usableParts.map((part, index) => {
        const candidates = [firstShop.get(part.id), secondShop.get(part.id)].filter(Boolean);
        return {
          partId: part.id,
          partName: part.name,
          candidate: cheapest(candidates) || baseline[index].candidate
        };
      }));
    }
  }

  const shipping = Number.isFinite(Number(shippingPerShop)) ? Number(shippingPerShop) : 0;
  let best = baseline;
  options.slice(1).forEach((option) => {
    if (betterAssignment(option, best, baseline, shipping)) best = option;
  });
  const baselineStats = assignmentStats(baseline, shipping);
  const bestStats = assignmentStats(best, shipping);
  const assignments = best.map(({ partId, candidate }) => ({ partId, candidate }));
  return {
    currency: selectedCurrency,
    assignments,
    shops: buildShops(best),
    itemsTotal: round(bestStats.itemsTotal),
    shopCount: bestStats.shopCount,
    shipping: round(bestStats.shipping),
    total: round(bestStats.total),
    baseline: {
      itemsTotal: round(baselineStats.itemsTotal),
      shopCount: baselineStats.shopCount,
      shipping: round(baselineStats.shipping),
      total: round(baselineStats.total)
    },
    skipped
  };
}

export function formatSavings(result) {
  if (!result || result.total === result.baseline?.total) return '';
  const currency = result.currency || '';
  return `Optimized: ${result.shopCount} shops, ${result.total.toFixed(2)} ${currency} total (items ${result.itemsTotal.toFixed(2)} + est. shipping ${result.shipping.toFixed(2)}) vs cheapest-per-part: ${result.baseline.shopCount} shops, ${result.baseline.total.toFixed(2)} ${currency}`;
}
