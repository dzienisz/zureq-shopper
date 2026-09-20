import { BUILD_TEMPLATES } from './builds.js';

const DEFAULT_SHIPPING = 15;

function finitePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) ? price : null;
}

function currencyCode(value) {
  return value == null || value === '' ? '' : String(value).toUpperCase();
}

function encodeBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBytes(code) {
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(code.length / 4) * 4, '=');
  const binary = atob(base64);
  return new Uint8Array([...binary].map((char) => char.charCodeAt(0)));
}

function compactPick(pick) {
  if (!pick) return null;
  return {
    name: pick.name,
    shopId: pick.shopId,
    shopName: pick.shopName,
    sku: pick.sku,
    price: pick.price,
    currency: pick.currency
  };
}

export function serializeBuild(build = {}) {
  return {
    v: 1,
    text: String(build.text || ''),
    templateId: String(build.templateId || ''),
    shippingPerShop: Number.isFinite(Number(build.shippingPerShop)) ? Number(build.shippingPerShop) : DEFAULT_SHIPPING,
    parts: (Array.isArray(build.parts) ? build.parts : []).map((part) => ({
      name: String(part.name || ''),
      query: String(part.query || ''),
      include: part.include !== false,
      optional: Boolean(part.optional),
      pick: compactPick(part.pick)
    }))
  };
}

export function encodeBuild(build) {
  return encodeBytes(new TextEncoder().encode(JSON.stringify(serializeBuild(build))));
}

function codeFromInput(input) {
  const value = String(input || '').trim();
  const match = value.match(/(?:#|[?&])build=([^&]+)/);
  if (!match) return value;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new Error('Invalid build code');
  }
}

export function decodeBuild(input) {
  try {
    const code = codeFromInput(input);
    const json = new TextDecoder().decode(decodeBytes(code));
    const data = JSON.parse(json);
    if (data?.v !== 1 || !Array.isArray(data.parts)) throw new Error();
    const parts = data.parts.slice(0, 50).map((part, index) => {
      const pick = part?.pick ? compactPick(part.pick) : null;
      return { ...part, id: index, candidates: pick ? [pick] : [], pick };
    });
    const shippingPerShop = Number(data.shippingPerShop);
    return {
      text: String(data.text || ''),
      templateId: String(data.templateId || ''),
      parts,
      running: false,
      shippingPerShop: Number.isFinite(shippingPerShop) && shippingPerShop >= 0 ? shippingPerShop : DEFAULT_SHIPPING,
      optimizeResult: ''
    };
  } catch {
    throw new Error('Invalid build code');
  }
}

function escapeCell(value) {
  return String(value ?? '—').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function amountText(amounts) {
  return [...amounts.entries()].map(([currency, amount]) => `${amount.toFixed(2)} ${currency || '—'}`).join(' + ');
}

export function buildToMarkdown(build = {}, { shippingPerShop } = {}) {
  const parts = (Array.isArray(build.parts) ? build.parts : []).filter((part) => part.include !== false);
  const title = build.text || BUILD_TEMPLATES.find((template) => template.id === build.templateId)?.label || 'Build';
  const rows = parts.map((part) => {
    const pick = part.pick;
    const price = finitePrice(pick?.price);
    return `| ${escapeCell(part.name)} | ${escapeCell(pick?.name)} | ${escapeCell(pick?.shopName || pick?.shopId)} | ${price == null ? '—' : `${price.toFixed(2)} ${escapeCell(currencyCode(pick.currency))}`} |`;
  });
  const picks = parts.filter((part) => part.pick && finitePrice(part.pick.price) != null);
  const shopGroups = new Map();
  const currencyCounts = new Map();
  let dominantCurrency = '';
  picks.forEach((part) => {
    const currency = currencyCode(part.pick.currency);
    const count = (currencyCounts.get(currency) || 0) + 1;
    currencyCounts.set(currency, count);
    if (!dominantCurrency || count > currencyCounts.get(dominantCurrency)) dominantCurrency = currency;
    const shopKey = String(part.pick.shopId ?? part.pick.shopName ?? '');
    if (!shopGroups.has(shopKey)) shopGroups.set(shopKey, { name: part.pick.shopName || part.pick.shopId || 'Shop', items: 0, amounts: new Map() });
    const group = shopGroups.get(shopKey);
    group.items += 1;
    group.amounts.set(currency, (group.amounts.get(currency) || 0) + Number(part.pick.price));
  });
  const perShop = [...shopGroups.values()].map((group) => `${escapeCell(group.name)} ${amountText(group.amounts)} (${group.items} ${group.items === 1 ? 'item' : 'items'})`).join(' · ');
  const dominantPicks = picks.filter((part) => currencyCode(part.pick.currency) === dominantCurrency);
  const itemsTotal = dominantPicks.reduce((sum, part) => sum + Number(part.pick.price), 0);
  const shopCount = new Set(dominantPicks.map((part) => String(part.pick.shopId ?? part.pick.shopName ?? ''))).size;
  const shipping = Number.isFinite(Number(shippingPerShop ?? build.shippingPerShop))
    ? Math.max(0, Number(shippingPerShop ?? build.shippingPerShop))
    : DEFAULT_SHIPPING;
  const otherCurrencies = new Map();
  picks.filter((part) => currencyCode(part.pick.currency) !== dominantCurrency).forEach((part) => {
    const currency = currencyCode(part.pick.currency) || '—';
    otherCurrencies.set(currency, (otherCurrencies.get(currency) || 0) + Number(part.pick.price));
  });
  const total = itemsTotal + (shipping > 0 ? shipping * shopCount : 0);
  const lines = [
    `# ${escapeCell(title)}`,
    '',
    '| Part | Pick | Shop | Price |',
    '|---|---|---|---|',
    ...rows,
    ''
  ];
  if (perShop) lines.push(`**Per shop:** ${perShop}`);
  if (picks.length && dominantCurrency) {
    const shippingNote = shipping > 0 ? ` (+ est. shipping ${(shipping * shopCount).toFixed(2)} for ${shopCount} ${shopCount === 1 ? 'shop' : 'shops'})` : '';
    const otherNote = [...otherCurrencies.entries()].map(([currency, amount]) => ` · + ${amount.toFixed(2)} ${currency} (not totalled)`).join('');
    lines.push(`**Total:** ${total.toFixed(2)} ${dominantCurrency}${shippingNote}${otherNote}`);
  }
  lines.push('_Made with Zureq Shopper_');
  return lines.join('\n');
}

export function shareLink(baseUrl, build) {
  return `${baseUrl}#build=${encodeBuild(build)}`;
}
