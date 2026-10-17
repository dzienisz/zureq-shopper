export const MAX_LIST_ITEMS = 10;

export function parseListInput(value) {
  return String(value ?? '').split(/[,\n]+/).map((item) => item.trim()).filter(Boolean);
}

export function migrateListState(saved, defaultCountry = '') {
  const oldParts = Array.isArray(saved?.parts) && saved.parts.length
    ? saved.parts
    : parseListInput(saved?.text).map((query) => ({ name: query, query }));
  const parts = oldParts.slice(0, MAX_LIST_ITEMS).map((source, index) => {
    const oldPart = source || {};
    const query = String(oldPart.query || oldPart.name || '').trim();
    const candidates = Array.isArray(oldPart.candidates) ? oldPart.candidates.slice(0, 5) : [];
    const pick = oldPart.pick || null;
    if (pick && !candidates.some((candidate) => candidate.sku === pick.sku && candidate.shopId === pick.shopId)) {
      candidates.unshift(pick);
      candidates.length = Math.min(candidates.length, 5);
    }
    return {
      id: index,
      name: String(oldPart.name || query),
      query,
      candidates,
      pick,
      searched: Boolean(oldPart.searched || candidates.length)
    };
  }).filter((part) => part.query);
  return {
    text: parts.map((part) => part.query).join('\n'),
    country: String(saved?.country || defaultCountry || ''),
    parts,
    productDetails: saved?.productDetails && typeof saved.productDetails === 'object' && !Array.isArray(saved.productDetails)
      ? saved.productDetails
      : {}
  };
}

export function groupListPicks(parts) {
  const groups = new Map();
  (Array.isArray(parts) ? parts : []).forEach((part) => {
    const candidate = part?.pick;
    if (!candidate) return;
    const shopId = String(candidate.shopId ?? '');
    const shopName = String(candidate.shopName || shopId || 'Unknown shop');
    const key = shopId || shopName;
    if (!groups.has(key)) groups.set(key, { shopId, shopName, picks: [], totals: new Map() });
    const group = groups.get(key);
    group.picks.push({ part, candidate });
    const amount = Number(candidate.price);
    if (Number.isFinite(amount)) {
      const currency = String(candidate.currency || '—').toUpperCase();
      group.totals.set(currency, (group.totals.get(currency) || 0) + amount);
    }
  });
  return [...groups.values()].map((group) => ({
    ...group,
    totals: [...group.totals.entries()].map(([currency, amount]) => ({
      currency,
      amount: Number(amount.toFixed(2))
    }))
  }));
}
