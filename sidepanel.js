import {
  TOOL_COSTS, ZureqError, addSearchHistory, cacheMarkets, callTool,
  getCachedMarkets, getSearchHistory
} from './zureq.js';
import { BUILD_TEMPLATES, partsForBuild } from './builds.js';
import { languageModelStatus, resolveIntent, summarizeWithModel } from './assistant.js';
import { addWatch, clearAlerts, getWatches, removeWatch } from './watchlist.js';
import { formatSavings, optimizeCart } from './optimizer.js';
import { buildToMarkdown, decodeBuild, shareLink } from './share.js';

const $ = (id) => document.getElementById(id);
const state = {
  products: [], assistantProducts: [], details: new Map(), history: [], markets: [],
  selectedMarkets: [], sessionCredits: 0, source: null,
  build: { text: '', templateId: '', parts: [], running: false, shippingPerShop: 15, optimizeResult: '' }
};
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
function activeTab() {
  return document.querySelector('.tab.active')?.dataset.tab || 'search';
}
function showNoKey(missing) {
  $('no-key').classList.toggle('hidden', !missing);
  if (missing) document.querySelectorAll('main > .panel').forEach((panel) => panel.classList.add('hidden'));
  else ['search', 'compare', 'build', 'watch', 'assistant', 'usage'].forEach((name) => $(`${name}-panel`).classList.toggle('hidden', name !== activeTab()));
}
function handleError(error) {
  if (error?.code === 'NO_KEY') {
    showNoKey(true);
    return;
  }
  showNotice(error instanceof ZureqError ? error.message : 'Something went wrong. Please try again.', true);
}
async function tool(name, args) {
  const data = await callTool(name, args);
  state.sessionCredits += TOOL_COSTS[name] || 0;
  showNoKey(false);
  if ($('notice').classList.contains('error')) clearNotice();
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
function watchSearchBaseline(products) {
  const finite = products.filter((product) => Number.isFinite(Number(product.price)) && product.currency);
  if (!finite.length) return null;
  const first = [...finite].sort((a, b) => Number(a.price) - Number(b.price))[0];
  const currency = String(first.currency).toUpperCase();
  const matching = finite.filter((product) => String(product.currency).toUpperCase() === currency);
  const best = matching.sort((a, b) => Number(a.price) - Number(b.price))[0];
  return { price: Number(best.price), currency };
}
async function watchProduct(product) {
  const price = Number(product.price);
  if (!Number.isFinite(price) || !product.currency) {
    showNotice('This product has no comparable price yet.', true);
    return;
  }
  const name = decodeEntities(product.name);
  await addWatch({
    type: 'product',
    query: $('query').value.trim() || name,
    country: $('country').value,
    shopId: product.shopId,
    sku: product.sku,
    name,
    baseline: { price, currency: product.currency }
  });
  showNotice(`Watching “${name}”.`);
}
async function watchSearch() {
  const query = $('query').value.trim();
  const baseline = watchSearchBaseline(state.products);
  if (!query || !baseline) {
    showNotice('Search results need comparable prices before they can be watched.', true);
    return;
  }
  await addWatch({
    type: 'query',
    query,
    country: $('country').value,
    name: query,
    baseline
  });
  showNotice(`Watching “${query}”.`);
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
    const cheaper = state.source && Number.isFinite(Number(state.source.price)) &&
      String(state.source.currency || '').toUpperCase() === String(product.currency || '').toUpperCase() &&
      Number(product.price) < Number(state.source.price);
    const detailHtml = details ? `<div class="details">${details.description ? `<p>${esc(details.description)}</p>` : ''}${details.variants?.length ? `<label>Variant<select class="variant-select" data-sku="${esc(product.sku)}">${details.variants.map((variant) => `<option value="${esc(variant.sku)}">${esc(variant.name || variant.title || variant.sku)}</option>`).join('')}</select></label>` : ''}<div class="checkout-area" data-checkout="${esc(product.sku)}"></div></div>` : '';
    return `<article class="card" data-shop-id="${esc(product.shopId)}" data-sku="${esc(product.sku)}">${image}<div><h3>${esc(decodeEntities(product.name))}</h3><div class="meta">${esc(product.shopName || product.shopId || 'Unknown shop')} · ${esc(product.category || 'General')}</div><div class="price">${esc(product.price)} ${esc(product.currency || '')}${cheaper ? ' <span class="cheaper">cheaper</span>' : ''}</div><div class="${product.inStock ? 'stock' : 'stock out'}">${product.inStock ? 'In stock' : 'Out of stock'}</div></div><div class="card-actions"><button data-action="details">${details ? 'Hide details' : 'Details'}</button><button data-action="checkout">Checkout link</button><button data-action="watch">Watch</button></div>${detailHtml}</article>`;
  }).join('') : '<p class="hint">No products found. Try a broader query or another country.</p>';
  if (products.length) {
    $('search-results').insertAdjacentHTML('afterbegin', '<div class="watch-search-row"><button data-action="watch-search">Watch this search</button></div>');
  }
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
  const product = productFromCard(card);
  if (!product) return;
  const key = productKey(product);
  if (state.details.has(key)) {
    state.details.delete(key);
    if (card.dataset.assistant) renderAssistantDetails(card, null);
    else renderProducts();
    return;
  }
  try {
    const details = await tool('get_product', { shopId: product.shopId, sku: product.sku });
    state.details.set(key, details?.product || details);
    if (card.dataset.assistant) renderAssistantDetails(card, details?.product || details);
    else renderProducts();
  } catch (error) { handleError(error); }
}
async function checkout(card) {
  const product = productFromCard(card);
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
    const area = card.querySelector('.checkout-area') || card.querySelector('.details-slot');
    area.innerHTML = url ? `<div class="checkout"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><div class="card-actions"><button data-action="open-url" data-url="${esc(url)}">Open</button><button data-action="copy-url" data-url="${esc(url)}">Copy</button></div></div>` : '<div class="checkout">No checkout URL was returned.</div>';
  } catch (error) { handleError(error); }
}

async function saveBuild() {
  await chrome.storage.local.set({ zureqBuild: state.build });
}

function renderBuildPresets() {
  $('build-presets').innerHTML = BUILD_TEMPLATES.map((template) => `<button class="chip build-preset" data-template="${esc(template.id)}">${esc(template.label)}</button>`).join('');
}

function syncBuildInputs() {
  $('build-input').value = state.build.text || '';
  $('shipping-per-shop').value = String(state.build.shippingPerShop ?? 15);
  $('optimize-result').textContent = state.build.optimizeResult || '';
}

function renderBuildParts() {
  const parts = state.build.parts;
  $('build-parts').innerHTML = parts.length ? parts.map((part, index) => `<div class="build-part" data-part="${index}">
    <div class="build-part-head"><input type="checkbox" class="part-include" ${part.include ? 'checked' : ''}><input type="text" class="part-query" value="${esc(part.query)}"><span class="optional">${part.optional ? 'optional' : ''}</span></div>
    <div class="build-candidates">${part.candidates?.length ? part.candidates.slice(0, 5).map((candidate, candidateIndex) => `<label class="candidate-row"><input type="radio" name="build-pick-${index}" class="part-pick" value="${candidateIndex}" ${part.pick?.sku === candidate.sku && part.pick?.shopId === candidate.shopId ? 'checked' : ''}><span class="candidate-name">${esc(decodeEntities(candidate.name))} · ${esc(candidate.shopName || candidate.shopId || '')}</span><span class="candidate-price">${esc(candidate.price)} ${esc(candidate.currency || '')}</span></label>`).join('') : `<span class="muted">${part.searched ? `No results for “${esc(part.query)}”.` : 'Not searched yet.'}</span>`}</div>
  </div>`).join('') : '<p class="hint">Choose a preset or describe a comma-separated list of parts.</p>';
  $('build-actions').classList.toggle('hidden', !parts.length);
  $('optimize-build').disabled = !parts.some((part) => part.include && part.candidates?.length);
  const count = parts.filter((part) => part.include).length;
  $('build-estimate').textContent = count ? `~${count * TOOL_COSTS.search_products} credits` : 'No parts included.';
}

function currentBuildTotals() {
  const picks = state.build.parts
    .filter((part) => part.include && part.pick && Number.isFinite(Number(part.pick.price)));
  const counts = new Map();
  let currency = null;
  picks.forEach(({ pick }) => {
    const code = String(pick.currency || '').toUpperCase();
    if (!code) return;
    const count = (counts.get(code) || 0) + 1;
    counts.set(code, count);
    if (!currency || count > (counts.get(currency) || 0)) currency = code;
  });
  const dominant = picks.filter(({ pick }) => String(pick.currency || '').toUpperCase() === currency);
  const itemsTotal = dominant.reduce((sum, { pick }) => sum + Number(pick.price), 0);
  const shopIds = new Set(picks.map(({ pick }) => String(pick.shopId ?? pick.shopName ?? '')));
  const shipping = Number(state.build.shippingPerShop) * shopIds.size;
  const otherCurrencies = new Map();
  picks.filter(({ pick }) => String(pick.currency || '').toUpperCase() !== currency).forEach(({ pick }) => {
    const code = String(pick.currency || '').toUpperCase() || '—';
    otherCurrencies.set(code, (otherCurrencies.get(code) || 0) + Number(pick.price));
  });
  return {
    currency,
    itemsTotal: Number(itemsTotal.toFixed(2)),
    shopCount: shopIds.size,
    shipping: Number(shipping.toFixed(2)),
    total: Number((itemsTotal + shipping).toFixed(2)),
    otherCurrencies
  };
}

function renderBuildSummary() {
  const groups = new Map();
  state.build.parts.filter((part) => part.include && part.pick).forEach((part) => {
    const key = part.pick.shopId || part.pick.shopName;
    if (!groups.has(key)) groups.set(key, { shopId: part.pick.shopId, shopName: part.pick.shopName || part.pick.shopId, picks: [] });
    groups.get(key).picks.push({ part, candidate: part.pick });
  });
  const totals = currentBuildTotals();
  const totalsLine = totals.currency
    ? `${totals.shopCount} shops · items ${totals.itemsTotal.toFixed(2)} ${esc(totals.currency)} · est. shipping ${totals.shipping.toFixed(2)} ${esc(totals.currency)} · total ${totals.total.toFixed(2)} ${esc(totals.currency)}${[...totals.otherCurrencies.entries()].map(([currency, total]) => ` · + ${total.toFixed(2)} ${esc(currency)} (not totalled)`).join('')}`
    : '';
  $('build-summary').innerHTML = groups.size ? `<div class="build-summary">${totalsLine ? `<p class="build-totals">${totalsLine}</p>` : ''}<h3>Selected parts</h3>${[...groups.values()].map((group, index) => {
    const totals = {};
    group.picks.forEach(({ candidate }) => { const currency = candidate.currency || '—'; totals[currency] = (totals[currency] || 0) + (Number(candidate.price) || 0); });
    return `<div class="summary-group" data-group="${index}"><h3>${esc(group.shopName)}</h3><div class="summary-total">${Object.entries(totals).map(([currency, total]) => `${total.toFixed(2)} ${esc(currency)}`).join(' · ')}</div><ul>${group.picks.map(({ part, candidate }) => `<li>${esc(part.name)} — ${esc(candidate.name)}</li>`).join('')}</ul><button class="secondary build-checkout" data-group="${index}">Checkout link</button><div class="build-link"></div></div>`;
  }).join('')}${groups.size ? '<div id="share-actions" class="share-actions"><button class="secondary" data-action="copy-markdown">Copy Markdown</button><button class="secondary" data-action="copy-share-link">Copy share link</button></div>' : ''}</div>` : '';
  state.build.groups = [...groups.values()];
}

async function planBuild(text = $('build-input').value) {
  const planned = partsForBuild(text);
  if (!planned) {
    showNotice('Describe a build or enter parts separated by commas or new lines.', true);
    return;
  }
  state.build = {
    text: String(text).trim(),
    templateId: planned.template?.id || '',
    parts: planned.parts.map((part, index) => ({ ...part, id: index, include: !part.optional, candidates: [], pick: null })),
    running: false,
    shippingPerShop: 15,
    optimizeResult: ''
  };
  $('build-input').value = state.build.text;
  $('shipping-per-shop').value = '15';
  $('optimize-result').textContent = '';
  await saveBuild();
  renderBuildParts();
  renderBuildSummary();
}

async function importBuild(value, replace = true) {
  try {
    const build = decodeBuild(value);
    if (replace && state.build.parts.length && !confirm('Replace your current build?')) return false;
    state.build = build;
    syncBuildInputs();
    await saveBuild();
    renderBuildParts();
    renderBuildSummary();
    switchTab('build');
    showNotice('Build imported.');
    return true;
  } catch (error) {
    showNotice(error.message, true);
    return false;
  }
}

async function optimizeBuild() {
  const shippingPerShop = Number($('shipping-per-shop').value);
  state.build.shippingPerShop = Number.isFinite(shippingPerShop) && shippingPerShop >= 0 ? shippingPerShop : 0;
  const result = optimizeCart(state.build.parts, { shippingPerShop: state.build.shippingPerShop });
  const assignments = new Map(result.assignments.map((assignment) => [String(assignment.partId), assignment.candidate]));
  state.build.parts.forEach((part) => {
    if (assignments.has(String(part.id))) part.pick = assignments.get(String(part.id));
  });
  state.build.optimizeResult = formatSavings(result) || 'Already optimal.';
  const skipped = result.skipped.map((part) => part.name).join(', ');
  if (skipped) state.build.optimizeResult += ` Skipped (no comparable offer): ${skipped}`;
  await saveBuild();
  renderBuildParts();
  renderBuildSummary();
  $('optimize-result').textContent = state.build.optimizeResult;
}

async function searchBuildParts() {
  const included = state.build.parts.filter((part) => part.include);
  if (!included.length || state.build.running) return;
  if (!confirm(`Search ${included.length} part${included.length === 1 ? '' : 's'}? Estimated cost: ~${included.length * TOOL_COSTS.search_products} credits.`)) return;
  state.build.running = true;
  state.build.optimizeResult = '';
  $('optimize-result').textContent = '';
  $('search-build').disabled = true;
  for (let index = 0; index < state.build.parts.length; index += 1) {
    const part = state.build.parts[index];
    if (!part.include) continue;
    $('build-run-status').textContent = `Searching ${index + 1} of ${state.build.parts.length}: ${part.query}`;
    try {
      const data = await tool('search_products', { query: part.query, country: $('build-country').value || undefined, inStockOnly: true, limit: 5 });
      part.candidates = data?.products || [];
      part.searched = true;
      part.pick = null;
    } catch (error) {
      handleError(error);
    }
    await saveBuild();
    renderBuildParts();
  }
  state.build.running = false;
  $('search-build').disabled = false;
  $('build-run-status').textContent = 'Search complete. Pick one result per included part.';
  renderBuildSummary();
  await saveBuild();
}

async function buildCheckout(groupIndex) {
  const group = state.build.groups?.[groupIndex];
  if (!group) return;
  const button = document.querySelector(`.summary-group[data-group="${groupIndex}"] .build-checkout`);
  const target = button?.parentElement.querySelector('.build-link');
  try {
    const data = await tool('create_checkout_link', {
      shopId: group.shopId,
      lines: group.picks.map(({ candidate }) => ({ sku: candidate.sku, quantity: 1 }))
    });
    const url = data?.url || data?.checkoutUrl || data?.cartUrl || data?.link;
    if (target) target.innerHTML = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>` : 'No checkout URL returned.';
  } catch (error) {
    if (error?.code !== 'API_ERROR' && error?.code !== 'INVALID_ARGS' || group.picks.length < 2) {
      handleError(error);
      return;
    }
    const links = [];
    for (const { part, candidate } of group.picks) {
      try {
        const data = await tool('create_checkout_link', { shopId: group.shopId, lines: [{ sku: candidate.sku, quantity: 1 }] });
        const url = data?.url || data?.checkoutUrl || data?.cartUrl || data?.link;
        if (url) links.push(`<li>${esc(part.name)}: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></li>`);
      } catch (itemError) { handleError(itemError); }
    }
    if (target) target.innerHTML = `<p class="hint">This shop takes one product per link.</p><ul>${links.join('')}</ul>`;
  }
}

function renderAssistantProducts(products) {
  state.assistantProducts = products;
  return products.slice(0, 5).map((product) => `<article class="assistant-product" data-assistant="true" data-shop-id="${esc(product.shopId)}" data-sku="${esc(product.sku)}"><strong>${esc(decodeEntities(product.name))}</strong><div class="meta">${esc(product.shopName || product.shopId || '')} · ${esc(product.price)} ${esc(product.currency || '')}</div><div class="card-actions"><button data-action="details">Details</button><button data-action="checkout">Checkout</button><button data-action="watch">Watch</button></div><div class="details-slot"></div></article>`).join('');
}

function relativeTime(timestamp) {
  if (!timestamp) return 'Not checked yet';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
async function renderWatches() {
  const watches = await getWatches();
  const settings = await chrome.storage.sync.get({ watchInterval: '24' });
  const hours = settings.watchInterval === '168' ? '168' : String(settings.watchInterval || '24');
  $('watch-hint').textContent = `Checks run every ${hours} h in the background (~3 credits per watch). Change the interval in Options.`;
  $('watch-list').innerHTML = watches.length ? watches.map((watch) => {
    const last = watch.lastResult;
    const lastLine = last
      ? `Last: ${esc(watch.lastPrice)} ${esc(watch.lastCurrency || '')} · ${esc(last.shopName || last.shopId || 'Unknown shop')} · ${relativeTime(watch.lastCheckedAt)}`
      : 'Not checked yet';
    const cheaper = watch.lastPrice != null && Number(watch.lastPrice) < Number(watch.baseline.price);
    return `<article class="watch-item" data-watch-id="${esc(watch.id)}"><h3>${esc(watch.name)} ${cheaper ? '<span class="cheaper">Cheaper!</span>' : ''}</h3><div class="watch-meta"><span class="watch-tag">${esc(watch.type)}</span>${watch.country ? ` · ${esc(watch.country)}` : ''}</div><div class="watch-meta">Watching since ${esc(watch.baseline.price)} ${esc(watch.baseline.currency || '')}</div><div class="watch-meta">${lastLine}</div><div class="watch-actions"><button class="secondary" data-action="watch-search">Search</button><button class="secondary" data-action="remove-watch">Remove</button></div></article>`;
  }).join('') : '<p class="hint">Nothing watched yet. Use “Watch” on a product or “Watch this search” under results.</p>';
}

function renderAssistantComparison(data) {
  const markets = normalizeComparison(data);
  return markets.length ? markets.map((market) => {
    const offers = market.offers || market.candidates || [];
    return `<div class="market-result"><h3>${esc(market.label || market.key || market.market || 'Market')}</h3><p class="hint">${esc(market.delivery?.note || '')}</p><ul>${offers.slice(0, 3).map((offer) => `<li>${esc(decodeEntities(offer.name))} — ${esc(offer.approxPrice ?? offer.price)} ${esc(offer.approxCurrency || offer.currency || data.currency || '')}</li>`).join('')}</ul></div>`;
  }).join('') : '<p class="hint">No comparison rows returned.</p>';
}

function productFromCard(card) {
  const products = card.dataset.assistant ? state.assistantProducts : state.products;
  return products.find((item) => String(item.shopId) === card.dataset.shopId && String(item.sku) === card.dataset.sku);
}

function renderAssistantDetails(card, details) {
  const slot = card.querySelector('.details-slot');
  if (!slot) return;
  if (!details) {
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = `<div class="details">${details.description ? `<p>${esc(details.description)}</p>` : ''}${details.variants?.length ? `<label>Variant<select class="variant-select">${details.variants.map((variant) => `<option value="${esc(variant.sku)}">${esc(variant.name || variant.title || variant.sku)}</option>`).join('')}</select></label>` : ''}<div class="checkout-area"></div></div>`;
}

function appendAssistantMessage(html, cost = 0, user = false) {
  const item = document.createElement('div');
  item.className = `message${user ? ' user' : ''}`;
  item.innerHTML = `<div class="bubble">${html}</div>${!user ? `<span class="credit-note">${cost} credits</span>` : ''}`;
  $('assistant-messages').append(item);
  $('assistant-messages').scrollTop = $('assistant-messages').scrollHeight;
}

async function assistantSend(text) {
  const value = String(text || '').trim();
  if (!value) return;
  appendAssistantMessage(esc(value), 0, true);
  $('assistant-input').value = '';
  const intent = await resolveIntent(value, { markets: state.markets });
  let cost = 0;
  try {
    if (intent.type === 'search') {
      const data = await tool('search_products', { query: intent.query, country: intent.country, maxPrice: intent.maxPrice, inStockOnly: true, limit: 5 });
      cost = TOOL_COSTS.search_products;
      const products = data?.products || [];
      const summary = await summarizeWithModel(value, data) || (products.length ? `I found ${products.length} relevant result${products.length === 1 ? '' : 's'}.` : 'I did not find matching products.');
      appendAssistantMessage(`${esc(summary)}<div class="assistant-products">${renderAssistantProducts(products)}</div>`, cost);
    } else if (intent.type === 'compare') {
      const data = await tool('compare_markets', { query: intent.query, markets: intent.markets, currency: intent.currency || 'PLN' });
      cost = TOOL_COSTS.compare_markets;
      appendAssistantMessage(`Here is the live market comparison for <strong>${esc(intent.query)}</strong>:<div class="assistant-products">${renderAssistantComparison(data)}</div>`, cost);
    } else if (intent.type === 'build') {
      switchTab('build');
      $('build-input').value = intent.text;
      await planBuild(intent.text);
      appendAssistantMessage('I opened the Build tab and planned the parts list. Include the parts you want, then search them together.', 0);
    } else if (intent.type === 'usage') {
      const data = await tool('get_usage', {});
      appendAssistantMessage(`You have <strong>${esc(data?.remaining ?? 'unknown')}</strong> credits remaining (${esc(data?.used ?? 0)} used).`, 0);
    } else if (intent.type === 'markets') {
      appendAssistantMessage(`Available markets include ${state.markets.map((market) => esc(market.label)).join(', ') || 'the EU and World options'}.`, 0);
    } else {
      appendAssistantMessage('Try “find a mechanical keyboard under 200 PLN”, “compare DJI Mini 4 in PL and DE”, or “parts for an FPV drone”.', 0);
    }
  } catch (error) {
    cost = error?.code === 'RATE_LIMIT' ? 0 : cost;
    handleError(error);
    appendAssistantMessage(esc(error instanceof ZureqError ? error.message : 'I could not complete that request.'), cost);
  }
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
    const targetCurrency = data?.currency || $('currency').value.toUpperCase();
    $('compare-results').innerHTML = results.length ? results.map((market) => {
      const name = market.label || market.market || market.country || market.name || market.key || market.code || 'Market';
      const candidates = market.offers || market.candidates || market.products || market.items || [];
      const range = market.priceRange;
      const stats = [
        market.shopCount != null && `${market.shopCount} shops`,
        (market.offerCount ?? candidates.length) != null && `${market.offerCount ?? candidates.length} offers`,
        range?.min != null && `from ${range.min} ${range.currency || targetCurrency}`,
        market.minPrice != null && `min ${market.minPrice}`,
        market.medianPrice != null && `median ${market.medianPrice}`
      ].filter(Boolean);
      const delivery = market.delivery?.note || market.deliveryNotes || market.deliveryNote || market.notes;
      const priceOf = (offer) => offer.approxPrice != null
        ? `≈ ${esc(offer.approxPrice)} ${esc(offer.approxCurrency || targetCurrency)} <span class="muted">(${esc(offer.price)} ${esc(offer.currency || '')})</span>`
        : `${esc(offer.price ?? offer.convertedPrice ?? '')} ${esc(offer.currency || targetCurrency)}`;
      return `<article class="market-result"><h3>${esc(name)}</h3><div class="market-stats">${stats.map((stat) => esc(stat)).join(' · ') || 'Market results'}</div>${delivery ? `<p class="hint">${esc(delivery)}</p>` : ''}${candidates.length ? `<ul>${candidates.slice(0, 5).map((offer) => `<li>${esc(decodeEntities(offer.name || offer.productName || 'Offer'))} <span class="muted">· ${esc(offer.shopName || offer.shopId || '')}</span> — ${priceOf(offer)}</li>`).join('')}</ul>` : '<p class="hint">No offers returned.</p>'}</article>`;
    }).join('') + (data?.note ? `<p class="hint">${esc(data.note)}</p>` : '') : '<p class="hint">No comparison rows returned.</p>';
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
  ['search', 'compare', 'build', 'watch', 'assistant', 'usage'].forEach((name) => $(`${name}-panel`).classList.toggle('hidden', name !== tab));
  if (tab === 'usage') loadUsage();
  if (tab === 'watch') {
    clearAlerts().then(() => chrome.runtime.sendMessage({ type: 'zureq-clear-badge' })).catch(() => {});
    renderWatches();
  }
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
  if (button.dataset.action === 'watch') {
    watchProduct(productFromCard(card));
    return;
  }
  if (button.dataset.action === 'watch-search') {
    watchSearch();
    return;
  }
  if (button.dataset.action === 'details') showDetails(card);
  if (button.dataset.action === 'checkout') checkout(card);
  if (button.dataset.action === 'open-url') chrome.tabs.create({ url: button.dataset.url });
  if (button.dataset.action === 'copy-url') navigator.clipboard.writeText(button.dataset.url).then(() => showNotice('Checkout link copied.'));
});
$('assistant-messages').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const card = button.closest('.assistant-product');
  if (!card) return;
  if (button.dataset.action === 'watch') {
    watchProduct(productFromCard(card));
    return;
  }
  if (button.dataset.action === 'details') showDetails(card);
  if (button.dataset.action === 'checkout') checkout(card);
  if (button.dataset.action === 'open-url') chrome.tabs.create({ url: button.dataset.url });
  if (button.dataset.action === 'copy-url') navigator.clipboard.writeText(button.dataset.url).then(() => showNotice('Checkout link copied.'));
});
$('build-presets').addEventListener('click', (event) => {
  const button = event.target.closest('.build-preset');
  if (!button) return;
  const template = BUILD_TEMPLATES.find((item) => item.id === button.dataset.template);
  if (template) { $('build-input').value = template.label; planBuild(template.label); }
});
$('plan-build').addEventListener('click', () => planBuild());
$('search-build').addEventListener('click', searchBuildParts);
$('clear-build').addEventListener('click', async () => {
  state.build = { text: '', templateId: '', parts: [], running: false, shippingPerShop: 15, optimizeResult: '' };
  $('build-input').value = '';
  $('shipping-per-shop').value = '15';
  $('optimize-result').textContent = '';
  await chrome.storage.local.remove('zureqBuild');
  renderBuildParts();
  renderBuildSummary();
});
$('import-build').addEventListener('click', () => importBuild($('import-code').value));
$('shipping-per-shop').addEventListener('change', async () => {
  const value = Number($('shipping-per-shop').value);
  state.build.shippingPerShop = Number.isFinite(value) && value >= 0 ? value : 0;
  await saveBuild();
  renderBuildSummary();
});
$('optimize-build').addEventListener('click', optimizeBuild);
$('build-parts').addEventListener('change', async (event) => {
  const row = event.target.closest('.build-part');
  if (!row) return;
  const part = state.build.parts[Number(row.dataset.part)];
  if (!part) return;
  if (event.target.classList.contains('part-include')) part.include = event.target.checked;
  if (event.target.classList.contains('part-query')) { part.query = event.target.value.trim(); part.name = part.query || part.name; }
  if (event.target.classList.contains('part-pick')) part.pick = part.candidates[Number(event.target.value)] || null;
  await saveBuild();
  renderBuildParts();
  renderBuildSummary();
});
$('build-summary').addEventListener('click', (event) => {
  const button = event.target.closest('.build-checkout');
  if (button) buildCheckout(Number(button.dataset.group));
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'copy-markdown') {
    navigator.clipboard.writeText(buildToMarkdown(state.build, { shippingPerShop: state.build.shippingPerShop }))
      .then(() => showNotice('Markdown copied.'))
      .catch(() => showNotice('Could not copy Markdown.', true));
  }
  if (action === 'copy-share-link') {
    navigator.clipboard.writeText(shareLink(chrome.runtime.getURL('sidepanel.html'), state.build))
      .then(() => showNotice('Link copied — works for anyone with Zureq Shopper installed.'))
      .catch(() => showNotice('Could not copy the share link.', true));
  }
});
$('watch-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const item = button?.closest('.watch-item');
  if (!button || !item) return;
  const watch = (await getWatches()).find((candidate) => candidate.id === item.dataset.watchId);
  if (!watch) return;
  if (button.dataset.action === 'remove-watch') {
    await removeWatch(watch.id);
    renderWatches();
  } else if (button.dataset.action === 'watch-search') {
    switchTab('search');
    $('query').value = watch.query;
    $('country').value = watch.country || '';
    await search();
  }
});
$('check-watches').addEventListener('click', async () => {
  $('check-watches').disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'zureq-check-watchlist' });
    showNotice(`Checked ${result?.checked || 0} watch${result?.checked === 1 ? '' : 'es'}; ${result?.alerts || 0} cheaper.`);
    await renderWatches();
  } catch {
    showNotice('Could not check the watchlist.', true);
  } finally {
    $('check-watches').disabled = false;
  }
});
$('assistant-form').addEventListener('submit', (event) => { event.preventDefault(); assistantSend($('assistant-input').value); });
$('assistant-suggestions').addEventListener('click', (event) => {
  const button = event.target.closest('.suggestion');
  if (button) assistantSend(button.textContent);
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
    switchTab('search');
    state.source = pending.source || null;
    const source = state.source;
    $('source-banner').classList.toggle('hidden', !source);
    if (source) $('source-banner').textContent = `Comparing with ${source.site || 'this page'} price ${source.price != null ? `${source.price} ${source.currency || ''}` : ''}.`;
    $('query').value = pending.query;
    await search();
  }
  await clearPending();
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.zureqApiKey) {
    const hasKey = Boolean(String(changes.zureqApiKey.newValue || '').trim());
    showNoKey(!hasKey);
    if (hasKey) { clearNotice(); if (activeTab() === 'usage') loadUsage(); }
    return;
  }
  if (!['session', 'local'].includes(areaName)) return;
  if (areaName === 'local' && changes.zureqWatchlist && activeTab() === 'watch') {
    renderWatches();
    return;
  }
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
  renderBuildPresets();
  $('ai-status').textContent = `on-device AI: ${await languageModelStatus()}`;
  try {
    const settings = await chrome.storage.sync.get({ defaultCountry: '', defaultCurrency: 'PLN' });
    $('currency').value = settings.defaultCurrency || 'PLN';
    await loadMarkets();
    $('build-country').innerHTML = $('country').innerHTML;
    if (settings.defaultCountry) $('country').value = settings.defaultCountry;
    await renderWatches();
    let pending;
    try { ({ zureqPending: pending } = await chrome.storage.session.get({ zureqPending: null })); } catch {}
    if (!pending) ({ zureqPending: pending } = await chrome.storage.local.get({ zureqPending: null }));
    const savedBuild = await chrome.storage.local.get({ zureqBuild: null });
    if (savedBuild.zureqBuild?.parts) {
      state.build = { shippingPerShop: 15, optimizeResult: '', ...savedBuild.zureqBuild, running: false };
      syncBuildInputs();
      renderBuildParts();
      renderBuildSummary();
    }
    if (location.hash.startsWith('#build=')) {
      await importBuild(location.hash, true);
      history.replaceState(null, '', location.pathname);
    }
    await applyPending(pending || queuedPending);
    panelReady = true;
    if (queuedPending && queuedPending !== pending) await applyPending(queuedPending);
  } catch (error) { handleError(error); }
}
init();
