import {
  TOOL_COSTS, ZureqError, addSearchHistory, cacheMarkets, callTool,
  getCachedMarkets, getSearchHistory
} from './zureq.js';

const $ = (id) => document.getElementById(id);
const state = { products: [], details: new Map(), history: [], markets: [], selectedMarkets: [], sessionCredits: 0 };
let panelReady = false;
let queuedPending = null;
let handledPending = '';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const productKey = (product) => `${product.shopId}::${product.sku}`;
function decodeEntities(value) {
  const area = document.createElement('textarea');
  area.innerHTML = String(value ?? '');
  return area.value;
}
function showNotice(message, error = false) {
  const notice = $('notice');
  notice.textContent = message;
  notice.className = `notice${error ? ' error' : ''}`;
}
function clearNotice() { $('notice').className = 'notice hidden'; }
async function clearPending() {
  try { await chrome.storage.session.remove('zureqPending'); } catch {}
  await chrome.storage.local.remove('zureqPending');
}
function handleError(error) {
  if (error?.code === 'NO_KEY') {
    $('no-key').classList.remove('hidden');
    document.querySelectorAll('main > .panel').forEach((panel) => panel.classList.add('hidden'));
    return;
  }
  showNotice(error instanceof ZureqError ? error.message : 'Something went wrong. Please try again.', true);
}
async function tool(name, args) {
  const data = await callTool(name, args);
  state.sessionCredits += TOOL_COSTS[name] || 0;
  return data;
}
function normalizeMarkets(data) {
  const list = data?.markets || data?.countries || data?.items || (Array.isArray(data) ? data : []);
  return list.map((item) => {
    if (typeof item === 'string') return { code: item, label: item };
    const code = item.code || item.isoCode || item.country || item.market || item.id;
    return code ? { code: String(code).toUpperCase(), label: item.name || item.label || String(code).toUpperCase(), count: item.count } : null;
  }).filter(Boolean);
}
async function loadMarkets() {
  let data = await getCachedMarkets();
  if (!data) {
    data = await tool('list_markets', {});
    await cacheMarkets(data);
  }
  state.markets = normalizeMarkets(data);
  const country = $('country');
  country.innerHTML = '<option value="">Any country</option><option value="EU">EU</option>' +
    state.markets.filter((market) => market.code !== 'EU').map((market) => `<option value="${esc(market.code)}">${esc(market.label)}${market.count != null ? ` (${esc(market.count)})` : ''}</option>`).join('');
  const defaults = state.markets.map((market) => market.code).filter((code) => !['EU', 'WORLD'].includes(code)).slice(0, 2);
  state.selectedMarkets = defaults.length >= 2 ? defaults : ['EU', 'WORLD'];
  renderMarketChips();
}
function renderHistory() {
  $('history').innerHTML = state.history.length ? `<span class="muted">Recent</span>${state.history.slice(0, 6).map((query) => `<button class="chip history-chip" data-query="${esc(query)}">${esc(query)}</button>`).join('')}` : '';
}
function renderMarketChips() {
  const all = [{ code: 'EU', label: 'EU' }, { code: 'WORLD', label: 'World' }, ...state.markets.filter((market) => !['EU', 'WORLD'].includes(market.code))];
  $('market-chips').innerHTML = all.map((market) => `<label class="chip market-chip"><input type="checkbox" value="${esc(market.code)}" ${state.selectedMarkets.includes(market.code) ? 'checked' : ''}>${esc(market.label)}</label>`).join('');
  $('market-chips').querySelectorAll('input').forEach((input) => input.addEventListener('change', () => {
    const checked = [...$('market-chips').querySelectorAll('input:checked')].map((item) => item.value);
    if (checked.length > 4) input.checked = false;
    else state.selectedMarkets = checked;
  }));
}
function priceValue(product) {
  const value = Number(product.price ?? product.convertedPrice ?? product.minPrice);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}
function renderProducts() {
  const sort = $('sort').value;
  const products = [...state.products];
  if (sort === 'price-asc') products.sort((a, b) => priceValue(a) - priceValue(b));
  if (sort === 'price-desc') products.sort((a, b) => priceValue(b) - priceValue(a));
  $('search-results').innerHTML = products.length ? products.map((product) => {
    const key = productKey(product);
    const details = state.details.get(key);
    const image = product.imageUrl ? `<img class="product-image" src="${esc(product.imageUrl)}" alt="">` : '<div class="product-image"></div>';
    const detailHtml = details ? `<div class="details">${details.description ? `<p>${esc(details.description)}</p>` : ''}${details.variants?.length ? `<label>Variant<select class="variant-select" data-sku="${esc(product.sku)}">${details.variants.map((variant) => `<option value="${esc(variant.sku)}">${esc(variant.name || variant.title || variant.sku)}</option>`).join('')}</select></label>` : ''}<div class="checkout-area" data-checkout="${esc(product.sku)}"></div></div>` : '';
    return `<article class="card" data-shop-id="${esc(product.shopId)}" data-sku="${esc(product.sku)}">${image}<div><h3>${esc(decodeEntities(product.name))}</h3><div class="meta">${esc(product.shopName || product.shopId || 'Unknown shop')} · ${esc(product.category || 'General')}</div><div class="price">${esc(product.price)} ${esc(product.currency || '')}</div><div class="${product.inStock ? 'stock' : 'stock out'}">${product.inStock ? 'In stock' : 'Out of stock'}</div></div><div class="card-actions"><button data-action="details">${details ? 'Hide details' : 'Details'}</button><button data-action="checkout">Checkout link</button></div>${detailHtml}</article>`;
  }).join('') : '<p class="hint">No products found. Try a broader query or another country.</p>';
}
async function search(event) {
  event?.preventDefault();
  clearNotice();
  const query = $('query').value.trim();
  if (!query) return;
  const args = { query, country: $('country').value || undefined, maxPrice: $('max-price').value ? Number($('max-price').value) : undefined, inStockOnly: $('in-stock').checked, limit: Math.min(50, Number($('limit').value) || 10) };
  Object.keys(args).forEach((key) => args[key] === undefined && delete args[key]);
  try {
    const data = await tool('search_products', args);
    state.products = data?.products || data?.items || [];
    state.details.clear();
    state.history = await addSearchHistory(query);
    renderHistory();
    renderProducts();
  } catch (error) { handleError(error); }
}
async function showDetails(card) {
  const product = state.products.find((item) => String(item.shopId) === card.dataset.shopId && String(item.sku) === card.dataset.sku);
  if (!product) return;
  const key = productKey(product);
  if (state.details.has(key)) {
    state.details.delete(key);
    renderProducts();
    return;
  }
  try {
    const details = await tool('get_product', { shopId: product.shopId, sku: product.sku });
    state.details.set(key, details?.product || details);
    renderProducts();
  } catch (error) { handleError(error); }
}
async function checkout(card) {
  const product = state.products.find((item) => String(item.shopId) === card.dataset.shopId && String(item.sku) === card.dataset.sku);
  if (!product) return;
  const details = state.details.get(productKey(product));
  if (!details) {
    await showDetails(card);
    showNotice('Choose a variant if this product has one, then click Checkout link.');
    return;
  }
  const variant = card.querySelector('.variant-select')?.value;
  if (details.requiresVariant && !details.variants?.length) {
    showNotice('This product requires a variant, but none were returned by Zureq.', true);
    return;
  }
  if (details.requiresVariant && !variant) {
    showNotice('Choose a variant before creating a checkout link.', true);
    return;
  }
  try {
    const data = await tool('create_checkout_link', { shopId: product.shopId, lines: [{ sku: variant || product.sku, quantity: 1 }] });
    const url = data?.url || data?.checkoutUrl || data?.cartUrl || data?.link;
    const area = card.querySelector('.checkout-area');
    area.innerHTML = url ? `<div class="checkout"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><div class="card-actions"><button data-action="open-url" data-url="${esc(url)}">Open</button><button data-action="copy-url" data-url="${esc(url)}">Copy</button></div></div>` : '<div class="checkout">No checkout URL was returned.</div>';
  } catch (error) { handleError(error); }
}
function normalizeComparison(data) {
  return data?.markets || data?.results || data?.comparisons || (Array.isArray(data) ? data : []);
}
async function compare(event) {
  event.preventDefault();
  clearNotice();
  if (state.selectedMarkets.length < 2 || state.selectedMarkets.length > 4) {
    showNotice('Choose between 2 and 4 markets.', true);
    return;
  }
  try {
    const data = await tool('compare_markets', { query: $('compare-query').value.trim(), markets: state.selectedMarkets, currency: $('currency').value.trim().toUpperCase() || 'PLN' });
    const results = normalizeComparison(data);
    $('compare-results').innerHTML = results.length ? results.map((market) => {
      const name = market.market || market.country || market.code || market.name || 'Market';
      const candidates = market.candidates || market.products || market.items || [];
      const stats = [market.shopCount != null && `${market.shopCount} shops`, market.minPrice != null && `min ${market.minPrice}`, market.medianPrice != null && `median ${market.medianPrice}`].filter(Boolean);
      const delivery = market.deliveryNotes || market.deliveryNote || market.notes;
      return `<article class="market-result"><h3>${esc(name)}</h3><div class="market-stats">${stats.map(esc).join(' · ') || 'Market results'}</div>${delivery ? `<p class="hint">${esc(delivery)}</p>` : ''}${candidates.length ? `<ul>${candidates.slice(0, 5).map((candidate) => `<li>${esc(candidate.name || candidate.productName || candidate.shopName || 'Candidate')} — ${esc(candidate.price ?? candidate.convertedPrice ?? '')} ${esc(candidate.currency || $('currency').value.toUpperCase())}</li>`).join('')}</ul>` : '<p class="hint">No candidates returned.</p>'}</article>`;
    }).join('') : '<p class="hint">No comparison rows returned.</p>';
  } catch (error) { handleError(error); }
}
async function loadUsage() {
  try {
    const usage = await tool('get_usage', {});
    const used = Number(usage?.used ?? usage?.consumed ?? 0);
    const included = Number(usage?.included ?? usage?.limit ?? 0);
    const remaining = Number(usage?.remaining ?? Math.max(included - used, 0));
    const percent = included ? Math.min(100, (used / included) * 100) : 0;
    $('usage-results').innerHTML = `<div class="usage-numbers"><div class="usage-number"><strong>${esc(used)}</strong><span>Used</span></div><div class="usage-number"><strong>${esc(included)}</strong><span>Included</span></div><div class="usage-number"><strong>${esc(remaining)}</strong><span>Remaining</span></div></div><div class="progress"><span style="width:${percent}%"></span></div><p class="hint">Estimated this session: <strong>${state.sessionCredits} credits</strong></p>`;
  } catch (error) { handleError(error); }
}
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  ['search', 'compare', 'usage'].forEach((name) => $(`${name}-panel`).classList.toggle('hidden', name !== tab));
  if (tab === 'usage') loadUsage();
}
document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
$('search-form').addEventListener('submit', search);
$('compare-form').addEventListener('submit', compare);
$('sort').addEventListener('change', renderProducts);
$('refresh-usage').addEventListener('click', loadUsage);
$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('no-key-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('history').addEventListener('click', (event) => { const button = event.target.closest('.history-chip'); if (button) { $('query').value = button.dataset.query; search(event); } });
$('search-results').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const card = button.closest('.card');
  if (button.dataset.action === 'details') showDetails(card);
  if (button.dataset.action === 'checkout') checkout(card);
  if (button.dataset.action === 'open-url') chrome.tabs.create({ url: button.dataset.url });
  if (button.dataset.action === 'copy-url') navigator.clipboard.writeText(button.dataset.url).then(() => showNotice('Checkout link copied.'));
});

async function applyPending(pending) {
  if (!pending?.query) return;
  const signature = `${pending.createdAt || ''}:${pending.mode || 'search'}:${pending.query}`;
  if (signature === handledPending) return;
  handledPending = signature;
  if (pending.mode === 'compare') {
    switchTab('compare');
    $('compare-query').value = pending.query;
    if (state.selectedMarkets.length >= 2) await compare({ preventDefault() {} });
  } else {
    $('query').value = pending.query;
    await search();
  }
  await clearPending();
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (!['session', 'local'].includes(areaName)) return;
  const pending = changes.zureqPending?.newValue;
  if (!pending) return;
  if (!panelReady) {
    queuedPending = pending;
    return;
  }
  applyPending(pending);
});

async function init() {
  state.history = await getSearchHistory();
  renderHistory();
  try {
    const settings = await chrome.storage.sync.get({ defaultCountry: '', defaultCurrency: 'PLN' });
    $('currency').value = settings.defaultCurrency || 'PLN';
    await loadMarkets();
    if (settings.defaultCountry) $('country').value = settings.defaultCountry;
    let pending;
    try { ({ zureqPending: pending } = await chrome.storage.session.get({ zureqPending: null })); } catch {}
    if (!pending) ({ zureqPending: pending } = await chrome.storage.local.get({ zureqPending: null }));
    await applyPending(pending || queuedPending);
    panelReady = true;
    if (queuedPending && queuedPending !== pending) await applyPending(queuedPending);
  } catch (error) { handleError(error); }
}
init();
