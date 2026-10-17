import {
  TOOL_COSTS, ZureqError, addSearchHistory, cacheMarkets, callTool, chunkLines,
  checkoutSku, formatCredits,
  freshnessLabel, getCachedMarkets, getCachedShopInfo, getSearchHistory,
  getShopInfo, isLowCredits, locationArgs, normalizeMarkets, stockLabel
} from './zureq.js';
import { groupListPicks, MAX_LIST_ITEMS, migrateListState, parseListInput } from './list.js';
import { setBusy, skeletonHtml } from './loading.js';
import { addWatch, clearAlerts, getWatches, removeWatch } from './watchlist.js';

const $ = (id) => document.getElementById(id);
const state = {
  products: [], details: new Map(), history: [], markets: [],
  selectedMarkets: [], sessionCredits: 0, source: null, searching: false, comparing: false,
  list: { text: '', country: '', parts: [], productDetails: {}, running: false },
  listGroups: [],
  usage: {
    remaining: null, included: null, used: null, plan: '—', period: '—',
    error: false, loading: false, noKey: false, lastFetchedAt: 0, open: false
  }
};
let panelReady = false;
let queuedPending = null;
let handledPending = '';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const productKey = (product) => `${product.shopId}::${product.sku}`;
const listDetailsRequests = new Map();
function imageCandidates(item) {
  return [
    item?.imageUrl, item?.image_url, item?.image, item?.thumbnailUrl,
    item?.thumbnail_url, item?.thumbnail, Array.isArray(item?.images) ? item.images[0] : null
  ];
}
function imageUrl(item) {
  for (const candidate of imageCandidates(item)) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      const url = new URL(candidate.trim());
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch {}
  }
  return '';
}
function imageMarkup(item, shopName, className, placeholderWhenMissing = false) {
  const shop = String(shopName || 'Shop').trim() || 'Shop';
  const initial = [...shop][0].toLocaleUpperCase('en-US');
  const url = imageUrl(item);
  const candidates = imageCandidates(item);
  const hasImage = candidates.some((candidate) => typeof candidate === 'string' && candidate.trim());
  if (!url) {
    return placeholderWhenMissing || hasImage
      ? `<div class="${className} image-placeholder" role="img" aria-label="No image for ${esc(shop)}">${esc(initial)}</div>`
      : '';
  }
  return `<img class="${className} fallback-image" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-placeholder="${esc(initial)}" data-shop-name="${esc(shop)}">`;
}
document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.classList.contains('fallback-image')) return;
  const placeholder = document.createElement('div');
  placeholder.className = `${image.className.replace(/\bfallback-image\b/, '')} image-placeholder`.trim();
  placeholder.setAttribute('role', 'img');
  placeholder.setAttribute('aria-label', `No image for ${image.dataset.shopName || 'shop'}`);
  placeholder.textContent = image.dataset.placeholder || 'S';
  image.replaceWith(placeholder);
}, true);
function renderUsageBadge() {
  const usage = state.usage;
  const badge = $('usage-toggle');
  if (!badge) return;
  const label = usage.noKey
    ? 'Add key'
    : usage.error
      ? '—'
      : Number.isFinite(usage.remaining)
        ? `${formatCredits(usage.remaining)} left`
        : usage.loading ? '…' : '—';
  badge.textContent = label;
  badge.setAttribute('aria-label', usage.noKey ? 'Add API key' : `Usage: ${label}`);
  badge.setAttribute('aria-expanded', String(usage.open && !usage.noKey));
  badge.classList.toggle('low-credit', !usage.noKey && !usage.error && isLowCredits(usage.remaining, usage.included));
}
function renderUsagePopover() {
  const usage = state.usage;
  $('usage-plan').textContent = usage.plan || '—';
  $('usage-used-included').textContent = Number.isFinite(usage.used) && Number.isFinite(usage.included)
    ? `${formatCredits(usage.used)} / ${formatCredits(usage.included)}`
    : '—';
  $('usage-period').textContent = usage.period || '—';
  $('usage-session').textContent = `${formatCredits(state.sessionCredits)} credits`;
  $('usage-error').classList.toggle('hidden', !usage.error);
  renderUsageBadge();
}
function setUsagePopover(open) {
  state.usage.open = Boolean(open && !state.usage.noKey);
  $('usage-popover').classList.toggle('hidden', !state.usage.open);
  renderUsageBadge();
}
function toggleUsagePopover() {
  if (state.usage.noKey) {
    chrome.runtime.openOptionsPage();
    return;
  }
  setUsagePopover(!state.usage.open);
}
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
  state.usage.noKey = Boolean(missing);
  if (state.usage.noKey) setUsagePopover(false);
  $('no-key').classList.toggle('hidden', !missing);
  if (missing) document.querySelectorAll('main > .panel').forEach((panel) => panel.classList.add('hidden'));
  else ['search', 'compare', 'list', 'watch'].forEach((name) => $(`${name}-panel`).classList.toggle('hidden', name !== activeTab()));
  renderUsageBadge();
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
  const cost = TOOL_COSTS[name] || 0;
  state.sessionCredits += cost;
  if (cost > 0) {
    if (Number.isFinite(state.usage.remaining)) state.usage.remaining = Math.max(0, state.usage.remaining - cost);
    if (Number.isFinite(state.usage.used)) state.usage.used += cost;
    renderUsagePopover();
  }
  showNoKey(false);
  if ($('notice').classList.contains('error')) clearNotice();
  return data;
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
  $('history').innerHTML = state.history.length ? `<span class="muted">Recent</span>${state.history.slice(0, 6).map((query) => `<button class="chip history-chip" data-query="${esc(query)}" title="${esc(query)}">${esc(query)}</button>`).join('')}` : '';
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
async function watchProduct(product, button) {
  const price = Number(product.price);
  if (!Number.isFinite(price) || !product.currency) {
    showNotice('This product has no comparable price yet.', true);
    return;
  }
  const name = decodeEntities(product.name);
  setBusy(button, true, 'Saving…');
  try {
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
  } catch (error) {
    handleError(error);
  } finally {
    if (button?.isConnected) setBusy(button, false);
  }
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
function detailsDescriptionHtml(details) {
  return details.description
    ? `<p class="detail-description">${esc(details.description)}</p><button type="button" class="description-toggle" data-action="description-toggle" aria-expanded="false">More</button>`
    : '';
}
function detailsMetaHtml(details) {
  const items = [`<span>${esc(stockLabel(details))}</span>`];
  const freshness = freshnessLabel(details);
  if (freshness) items.push(`<span class="freshness-chip">${esc(freshness)}</span>`);
  if (/^https?:\/\//i.test(String(details.shopWebsite || ''))) {
    items.push(`<a href="${esc(details.shopWebsite)}" target="_blank" rel="noopener">Visit shop</a>`);
  }
  return `<div class="details-meta">${items.join('<span class="details-separator" aria-hidden="true">·</span>')}</div>`;
}
function detailsHtml(details, sku = '') {
  const variantSelect = details.variants?.length
    ? `<label>Variant<select class="variant-select" ${sku ? `data-sku="${esc(sku)}"` : ''}>${details.variants.map((variant) => `<option value="${esc(variant.sku)}">${esc(variant.label || variant.name || variant.title || variant.sku)}</option>`).join('')}</select></label>`
    : '';
  return `<div class="details">${detailsDescriptionHtml(details)}${detailsMetaHtml(details)}${variantSelect}<div class="checkout-area"${sku ? ` data-checkout="${esc(sku)}"` : ''}></div></div>`;
}
function toggleDescription(button) {
  const description = button.previousElementSibling;
  if (!description?.classList.contains('detail-description')) return;
  const expanded = description.classList.toggle('expanded');
  button.textContent = expanded ? 'Less' : 'More';
  button.setAttribute('aria-expanded', String(expanded));
}
function renderProducts() {
  const sort = $('sort').value;
  const products = [...state.products];
  if (sort === 'price-asc') products.sort((a, b) => priceValue(a) - priceValue(b));
  if (sort === 'price-desc') products.sort((a, b) => priceValue(b) - priceValue(a));
  $('search-results').innerHTML = products.length ? products.map((product) => {
    const key = productKey(product);
    const details = state.details.get(key);
    const shopName = product.shopName || product.shopId || 'Unknown shop';
    const image = imageMarkup(product, shopName, 'product-image', true);
    const cheaper = state.source && Number.isFinite(Number(state.source.price)) &&
      String(state.source.currency || '').toUpperCase() === String(product.currency || '').toUpperCase() &&
      Number(product.price) < Number(state.source.price);
    const detailHtml = details ? detailsHtml(details, product.sku) : '';
    const outOfStock = product.inStock === false ? '<span class="stock-chip">Out of stock</span>' : '';
    return `<article class="card" data-shop-id="${esc(product.shopId)}" data-sku="${esc(product.sku)}">${image}<div class="product-copy"><h3>${esc(decodeEntities(product.name))}</h3><div class="product-shop">${esc(shopName)}</div><div class="price">${esc(product.price)} ${esc(product.currency || '')}${cheaper ? ' <span class="cheaper">cheaper</span>' : ''}</div>${outOfStock}</div><div class="card-actions"><button data-action="details">${details ? 'Hide details' : 'Details'}</button><button data-action="checkout">Checkout</button><button data-action="watch">Watch</button></div>${detailHtml}</article>`;
  }).join('') : '<p class="hint">No products found. Try a broader query or another country.</p>';
  if (products.length) {
    $('search-results').insertAdjacentHTML('afterbegin', '<div class="watch-search-row"><button data-action="watch-search">Watch this search</button></div>');
  }
}
async function search(event) {
  event?.preventDefault();
  if (state.searching) return;
  clearNotice();
  const query = $('query').value.trim();
  if (!query) return;
  const args = { query, ...locationArgs($('country').value), maxPrice: $('max-price').value ? Number($('max-price').value) : undefined, inStockOnly: $('in-stock').checked, limit: Math.min(50, Number($('limit').value) || 10) };
  Object.keys(args).forEach((key) => args[key] === undefined && delete args[key]);
  const button = event?.submitter || $('search-form').querySelector('[type="submit"]');
  const results = $('search-results');
  const previousResults = results.innerHTML;
  state.searching = true;
  setBusy(button, true, 'Searching…');
  results.setAttribute('aria-busy', 'true');
  results.innerHTML = skeletonHtml('product', Math.min(args.limit, 4));
  try {
    const data = await tool('search_products', args);
    state.products = data?.products || data?.items || [];
    state.details.clear();
    state.history = await addSearchHistory(query);
    renderHistory();
    renderProducts();
  } catch (error) {
    results.innerHTML = previousResults;
    handleError(error);
  } finally {
    state.searching = false;
    if (button?.isConnected) setBusy(button, false);
    results.removeAttribute('aria-busy');
  }
}
async function showDetails(card, button) {
  const product = productFromCard(card);
  if (!product) return;
  const key = productKey(product);
  if (state.details.has(key)) {
    state.details.delete(key);
    renderProducts();
    return;
  }
  setBusy(button, true, 'Loading…');
  try {
    const result = await tool('get_product', { shopId: product.shopId, sku: product.sku });
    const details = result?.product || result;
    let cachedShop = null;
    try { cachedShop = await getCachedShopInfo(product.shopId); } catch {}
    const productDetails = { ...details, shopWebsite: cachedShop?.website };
    state.details.set(key, productDetails);
    renderProducts();
  } catch (error) {
    handleError(error);
  } finally {
    if (button?.isConnected) setBusy(button, false);
  }
}
async function checkout(card, button) {
  const product = productFromCard(card);
  if (!product) return;
  const details = state.details.get(productKey(product));
  if (!details) {
    await showDetails(card, button);
    showNotice('Choose a variant if this product has one, then click Checkout.');
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
  setBusy(button, true, 'Creating…');
  try {
    const { info } = await getShopInfo(tool, product.shopId);
    state.details.set(productKey(product), { ...details, shopWebsite: info.website });
    if (info.checkoutLinkSupported === false) {
      showNotice("This shop doesn't support checkout links — open the product on the shop instead.");
      return;
    }
    const data = await tool('create_checkout_link', { shopId: product.shopId, lines: [{ sku: variant || product.sku, quantity: 1 }] });
    const url = data?.url || data?.checkoutUrl || data?.cartUrl || data?.link;
    const area = card.querySelector('.checkout-area') || card.querySelector('.details-slot');
    area.innerHTML = url ? `<div class="checkout"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><div class="card-actions"><button data-action="open-url" data-url="${esc(url)}">Open</button><button data-action="copy-url" data-url="${esc(url)}">Copy</button></div></div>` : '<div class="checkout">No checkout URL was returned.</div>';
  } catch (error) {
    handleError(error);
  } finally {
    if (button?.isConnected) setBusy(button, false);
  }
}

async function saveList() {
  const { text, country, parts, productDetails } = state.list;
  await chrome.storage.local.set({ zureqBuild: { text, country, parts, productDetails } });
}

function updateListEstimate() {
  const count = parseListInput($('list-input').value).length;
  const cost = count * TOOL_COSTS.search_products;
  $('list-estimate').textContent = count > MAX_LIST_ITEMS
    ? `${count} items (max ${MAX_LIST_ITEMS}) · ~${cost} credits`
    : `${count} item${count === 1 ? '' : 's'} · ~${cost} credits`;
  $('search-list').disabled = state.list.running || count === 0 || count > MAX_LIST_ITEMS;
  if (count > MAX_LIST_ITEMS) $('list-run-status').textContent = `Enter no more than ${MAX_LIST_ITEMS} items.`;
  else if (!state.list.running && !state.list.parts.length) $('list-run-status').textContent = 'Enter up to 10 items.';
}

function setListRunStatus(message, busy = state.list.running) {
  $('list-run-status').innerHTML = busy
    ? `<span class="spinner" aria-hidden="true"></span>${esc(message)}`
    : esc(message);
}

async function handleListInput() {
  const text = $('list-input').value;
  const queries = parseListInput(text);
  if (JSON.stringify(queries) !== JSON.stringify(state.list.parts.map((part) => part.query))) {
    state.list.parts = [];
    state.listGroups = [];
    renderListParts();
    renderListSummary();
  }
  state.list.text = text;
  updateListEstimate();
  await saveList();
}

function renderListParts() {
  const parts = state.list.parts;
  $('list-parts').innerHTML = parts.length ? parts.map((part, index) => `<div class="list-item" data-item="${index}">
    <h3>${esc(part.name)}</h3>
    <div class="list-candidates">${part.candidates?.length ? part.candidates.slice(0, 5).map((candidate, candidateIndex) => `<label class="candidate-row"><input type="radio" name="list-pick-${index}" class="part-pick" value="${candidateIndex}" ${part.pick?.sku === candidate.sku && part.pick?.shopId === candidate.shopId ? 'checked' : ''}><span class="candidate-name">${esc(decodeEntities(candidate.name))} · ${esc(candidate.shopName || candidate.shopId || '')}</span><span class="candidate-price">${esc(candidate.price)} ${esc(candidate.currency || '')}</span></label>`).join('') : `<span class="muted">${part.error ? esc(part.error) : part.searched ? `No results for “${esc(part.query)}”.` : 'Not searched yet.'}</span>`}</div>
    ${listPickDetailsHtml(part, index)}
  </div>`).join('') : '';
}

function listPickDetailsHtml(part, index) {
  if (!part.pick) return '';
  const key = productKey(part.pick);
  const details = state.list.productDetails?.[key];
  if (part.detailErrorKey === key && part.detailError) {
    return `<p class="hint list-detail-error">${esc(part.detailError)}</p>`;
  }
  if (part.loadingDetailsFor === key) return '<p class="hint">Loading product details…</p>';
  if (!details || (!details.variants?.length && !details.requiresVariant)) return '';
  const variants = Array.isArray(details.variants) ? details.variants : [];
  const options = variants.length
    ? `<option value="" ${part.pick.variantSku ? '' : 'selected'}>Choose a variant</option>${variants.map((variant) => `<option value="${esc(variant.sku)}" ${String(part.pick.variantSku || '') === String(variant.sku) ? 'selected' : ''}>${esc(variant.label || variant.name || variant.title || variant.sku)}</option>`).join('')}`
    : '<option value="" selected>Variant options unavailable</option>';
  return `<label class="list-variant-label">Variant<select class="list-variant" data-item="${index}">${options}</select></label>`;
}

async function loadListPickDetails(part, pick) {
  const key = productKey(pick);
  if (state.list.productDetails?.[key]) return;
  part.detailError = '';
  part.detailErrorKey = '';
  part.loadingDetailsFor = key;
  renderListParts();
  let request = listDetailsRequests.get(key);
  if (!request) {
    request = tool('get_product', { shopId: pick.shopId, sku: pick.sku })
      .then((result) => result?.product || result);
    listDetailsRequests.set(key, request);
  }
  try {
    const details = await request;
    state.list.productDetails ||= {};
    state.list.productDetails[key] = details;
    if (part.pick && productKey(part.pick) === key) {
      part.detailError = '';
      part.detailErrorKey = '';
      if (part.loadingDetailsFor === key) part.loadingDetailsFor = '';
    }
    await saveList();
  } catch (error) {
    if (part.pick && productKey(part.pick) === key) {
      part.detailError = error instanceof ZureqError ? error.message : 'Could not load product details.';
      part.detailErrorKey = key;
      if (part.loadingDetailsFor === key) part.loadingDetailsFor = '';
    }
  } finally {
    if (listDetailsRequests.get(key) === request) listDetailsRequests.delete(key);
    renderListParts();
    renderListSummary();
  }
}

function renderListSummary() {
  const groups = groupListPicks(state.list.parts);
  const content = groups.length ? groups.map((group, index) => {
    const totals = group.totals.map(({ currency, amount }) => `${amount.toFixed(2)} ${esc(currency)}`).join(' · ') || 'Total unavailable';
    return `<div class="list-summary-group" data-group="${index}"><h3>${esc(group.shopName)}</h3><div class="summary-total">${totals}</div><ul>${group.picks.map(({ part, candidate }) => `<li>${esc(part.name)} — ${esc(decodeEntities(candidate.name))}</li>`).join('')}</ul><button class="secondary list-checkout" data-group="${index}">Checkout link</button><div class="list-link"></div></div>`;
  }).join('') : state.list.parts.length ? '<p class="hint">Pick one result per item to see shop totals.</p>' : '';
  $('list-summary').innerHTML = state.list.parts.length ? `<div class="list-summary">${content}</div>` : '';
  state.listGroups = groups;
}

async function searchListItems() {
  const text = $('list-input').value.trim();
  const queries = parseListInput(text);
  if (!queries.length) {
    showNotice('Enter at least one item.', true);
    return;
  }
  if (queries.length > MAX_LIST_ITEMS) {
    showNotice(`Search up to ${MAX_LIST_ITEMS} items at a time.`, true);
    return;
  }
  if (state.list.running) return;
  const button = $('search-list');
  clearNotice();
  state.list = {
    text,
    country: $('list-country').value,
    parts: queries.map((query, index) => ({ id: index, name: query, query, candidates: [], pick: null, searched: false })),
    productDetails: state.list.productDetails || {},
    running: true
  };
  $('list-input').disabled = true;
  $('list-country').disabled = true;
  setBusy(button, true, 'Searching…');
  setListRunStatus('Preparing searches…');
  updateListEstimate();
  let completed = false;
  try {
    await saveList();
    renderListParts();
    renderListSummary();
    for (let index = 0; index < state.list.parts.length; index += 1) {
      const part = state.list.parts[index];
      setListRunStatus(`Searching ${index + 1} of ${state.list.parts.length}: ${part.query}`);
      try {
        const data = await tool('search_products', {
          query: part.query,
          ...locationArgs(state.list.country),
          inStockOnly: true,
          limit: 5
        });
        part.candidates = (data?.products || data?.items || []).slice(0, 5);
        part.searched = true;
        part.error = '';
      } catch (error) {
        part.searched = true;
        part.error = error instanceof ZureqError ? error.message : 'Search failed.';
        handleError(error);
      }
      await saveList();
      renderListParts();
      renderListSummary();
    }
    completed = true;
  } catch (error) {
    handleError(error);
  } finally {
    state.list.running = false;
    $('list-input').disabled = false;
    $('list-country').disabled = false;
    setBusy(button, false);
    updateListEstimate();
    setListRunStatus(completed ? 'Search complete. Pick one result per item.' : 'Search interrupted.', false);
    await saveList();
  }
}

async function listCheckout(groupIndex) {
  const group = state.listGroups[groupIndex];
  if (!group) return;
  const button = document.querySelector(`.list-summary-group[data-group="${groupIndex}"] .list-checkout`);
  const target = button?.parentElement.querySelector('.list-link');
  const unresolved = group.picks.filter(({ candidate }) => {
    const details = state.list.productDetails?.[productKey(candidate)];
    return (details?.requiresVariant || details?.variants?.length) && !candidate.variantSku;
  });
  if (unresolved.length) {
    if (target) target.textContent = `Choose a variant for: ${unresolved.map(({ part }) => part.name).join(', ')}`;
    return;
  }
  if (button) button.disabled = true;
  try {
    if (!group.shopId) throw new ZureqError('API_ERROR', 'Shop information is unavailable for this item.');
    const { info } = await getShopInfo(tool, group.shopId);
    if (info.checkoutLinkSupported === false) {
      if (target) target.textContent = "This shop doesn't support checkout links.";
      return;
    }
    const chunks = chunkLines(group.picks, info.checkoutLinkMaxLines);
    const links = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const label = `Cart ${index + 1} of ${chunks.length}`;
      try {
        const data = await tool('create_checkout_link', {
          shopId: group.shopId,
          lines: chunk.map(({ candidate }) => ({ sku: checkoutSku(candidate), quantity: 1 }))
        });
        const url = data?.url || data?.checkoutUrl || data?.cartUrl || data?.link;
        links.push(url
          ? `<p><strong>${label}</strong>: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>`
          : `<p><strong>${label}</strong>: No checkout URL returned.</p>`);
      } catch (chunkError) {
        const itemLinks = [];
        if (chunk.length === 1) {
          const [{ part }] = chunk;
          itemLinks.push(`<li>${esc(part.name)}: ${esc(chunkError?.message || 'Could not create checkout link.')}</li>`);
        } else {
          for (const { part, candidate } of chunk) {
            try {
              const data = await tool('create_checkout_link', {
                shopId: group.shopId,
                lines: [{ sku: checkoutSku(candidate), quantity: 1 }]
              });
              const url = data?.url || data?.checkoutUrl || data?.cartUrl || data?.link;
              itemLinks.push(url
                ? `<li>${esc(part.name)}: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></li>`
                : `<li>${esc(part.name)}: No checkout URL returned.</li>`);
            } catch (itemError) {
              itemLinks.push(`<li>${esc(part.name)}: ${esc(itemError?.message || chunkError?.message || 'Could not create checkout link.')}</li>`);
            }
          }
        }
        links.push(`<div><strong>${label}</strong><ul>${itemLinks.join('')}</ul></div>`);
      }
    }
    if (target) target.innerHTML = links.join('');
  } catch (error) {
    if (target) target.textContent = error?.message || 'Could not check shop checkout support.';
    handleError(error);
  } finally {
    if (button) button.disabled = false;
  }
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

function productFromCard(card) {
  return state.products.find((item) => String(item.shopId) === card.dataset.shopId && String(item.sku) === card.dataset.sku);
}

function normalizeComparison(data) {
  return data?.markets || data?.results || data?.comparisons || (Array.isArray(data) ? data : []);
}
async function compare(event) {
  event?.preventDefault();
  if (state.comparing) return;
  clearNotice();
  if (state.selectedMarkets.length < 2 || state.selectedMarkets.length > 4) {
    showNotice('Choose between 2 and 4 markets.', true);
    return;
  }
  const button = event?.submitter || $('compare-form').querySelector('[type="submit"]');
  const resultsContainer = $('compare-results');
  const previousResults = resultsContainer.innerHTML;
  state.comparing = true;
  setBusy(button, true, 'Comparing…');
  resultsContainer.setAttribute('aria-busy', 'true');
  resultsContainer.innerHTML = skeletonHtml('market', state.selectedMarkets.length);
  try {
    const data = await tool('compare_markets', { query: $('compare-query').value.trim(), markets: state.selectedMarkets, currency: $('currency').value.trim().toUpperCase() || 'PLN' });
    const results = normalizeComparison(data);
    const targetCurrency = data?.currency || $('currency').value.toUpperCase();
    resultsContainer.innerHTML = results.length ? results.map((market) => {
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
      return `<article class="market-result"><h3>${esc(name)}</h3><div class="market-stats">${stats.map((stat) => esc(stat)).join(' · ') || 'Market results'}</div>${delivery ? `<p class="hint">${esc(delivery)}</p>` : ''}${candidates.length ? `<ul>${candidates.slice(0, 5).map((offer) => `<li class="compare-offer">${imageMarkup(offer, offer.shopName || offer.shopId || 'Shop', 'compare-image')}<span class="compare-offer-copy">${esc(decodeEntities(offer.name || offer.productName || 'Offer'))} <span class="muted">· ${esc(offer.shopName || offer.shopId || '')}</span> — ${priceOf(offer)}</span></li>`).join('')}</ul>` : '<p class="hint">No offers returned.</p>'}</article>`;
    }).join('') + (data?.note ? `<p class="hint">${esc(data.note)}</p>` : '') : '<p class="hint">No comparison rows returned.</p>';
  } catch (error) {
    resultsContainer.innerHTML = previousResults;
    handleError(error);
  } finally {
    state.comparing = false;
    if (button?.isConnected) setBusy(button, false);
    resultsContainer.removeAttribute('aria-busy');
  }
}
async function refreshUsage(force = false) {
  const usage = state.usage;
  const now = Date.now();
  if (usage.noKey || usage.loading || (!force && now - usage.lastFetchedAt < 60000)) return;
  usage.loading = true;
  usage.lastFetchedAt = now;
  usage.error = false;
  renderUsageBadge();
  try {
    const result = await tool('get_usage', {});
    const used = Number(result?.used);
    const included = Number(result?.included);
    const remaining = Number(result?.remaining ?? (included - used));
    const period = String(result?.period || '—');
    const unreported = period === usage.period && Number.isFinite(usage.used) && Number.isFinite(used)
      ? Math.max(0, usage.used - used)
      : 0;
    usage.used = Number.isFinite(used) ? used + unreported : null;
    usage.included = Number.isFinite(included) ? included : null;
    usage.remaining = Number.isFinite(remaining) ? Math.max(0, remaining - unreported) : null;
    usage.plan = String(result?.plan || '—');
    usage.period = period;
  } catch (error) {
    usage.error = true;
    usage.remaining = null;
    usage.used = null;
    usage.included = null;
    usage.plan = '—';
    usage.period = '—';
    if (error?.code === 'NO_KEY') showNoKey(true);
  } finally {
    usage.loading = false;
    renderUsagePopover();
  }
}
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  ['search', 'compare', 'list', 'watch'].forEach((name) => $(`${name}-panel`).classList.toggle('hidden', name !== tab));
  if (tab === 'watch') {
    clearAlerts().then(() => chrome.runtime.sendMessage({ type: 'zureq-clear-badge' })).catch(() => {});
    renderWatches();
  }
}
document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
document.addEventListener('click', (event) => {
  if (!state.usage.open || event.target.closest('#usage-popover, #usage-toggle')) return;
  setUsagePopover(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !state.usage.open) return;
  setUsagePopover(false);
  $('usage-toggle').focus();
});
function refreshUsageOnFocus() {
  if (!document.hidden) refreshUsage(false);
}
window.addEventListener('focus', refreshUsageOnFocus);
document.addEventListener('visibilitychange', refreshUsageOnFocus);
$('search-form').addEventListener('submit', search);
$('compare-form').addEventListener('submit', compare);
$('sort').addEventListener('change', renderProducts);
$('usage-toggle').addEventListener('click', toggleUsagePopover);
$('refresh-usage').addEventListener('click', () => refreshUsage(true));
$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('no-key-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('history').addEventListener('click', (event) => { const button = event.target.closest('.history-chip'); if (button) { $('query').value = button.dataset.query; search(event); } });
$('search-results').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'description-toggle') {
    toggleDescription(button);
    return;
  }
  const card = button.closest('.card');
  if (button.dataset.action === 'watch') {
    watchProduct(productFromCard(card), button);
    return;
  }
  if (button.dataset.action === 'watch-search') {
    watchSearch();
    return;
  }
  if (button.dataset.action === 'details') showDetails(card, button);
  if (button.dataset.action === 'checkout') checkout(card, button);
  if (button.dataset.action === 'open-url') chrome.tabs.create({ url: button.dataset.url });
  if (button.dataset.action === 'copy-url') navigator.clipboard.writeText(button.dataset.url).then(() => showNotice('Checkout link copied.'));
});
$('list-input').addEventListener('input', handleListInput);
$('list-country').addEventListener('change', async () => {
  state.list.country = $('list-country').value;
  state.list.parts = [];
  state.listGroups = [];
  $('list-run-status').textContent = 'Country changed. Search again to refresh your items.';
  renderListParts();
  renderListSummary();
  await saveList();
});
$('search-list').addEventListener('click', searchListItems);
$('clear-list').addEventListener('click', async () => {
  state.list = { text: '', country: $('list-country').value, parts: [], productDetails: {}, running: false };
  state.listGroups = [];
  $('list-input').value = '';
  $('list-run-status').textContent = 'Enter up to 10 items.';
  $('list-input').disabled = false;
  $('list-country').disabled = false;
  await chrome.storage.local.remove('zureqBuild');
  updateListEstimate();
  renderListParts();
  renderListSummary();
});
$('list-parts').addEventListener('change', async (event) => {
  const row = event.target.closest('.list-item');
  if (!row) return;
  const part = state.list.parts[Number(row.dataset.item)];
  if (!part) return;
  if (event.target.classList.contains('part-pick')) {
    const previous = part.pick;
    const candidate = part.candidates[Number(event.target.value)] || null;
    if (candidate && previous && productKey(previous) === productKey(candidate) && previous.variantSku) {
      candidate.variantSku = previous.variantSku;
    }
    part.pick = candidate;
    part.detailError = '';
    part.detailErrorKey = '';
    part.loadingDetailsFor = '';
    await saveList();
    renderListParts();
    renderListSummary();
    if (candidate) await loadListPickDetails(part, candidate);
    return;
  }
  if (event.target.classList.contains('list-variant')) {
    part.pick.variantSku = event.target.value || '';
    await saveList();
    renderListParts();
  }
  await saveList();
  renderListSummary();
});
$('list-summary').addEventListener('click', (event) => {
  const button = event.target.closest('.list-checkout');
  if (button) listCheckout(Number(button.dataset.group));
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
  const button = $('check-watches');
  setBusy(button, true, 'Checking…');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'zureq-check-watchlist' });
    showNotice(`Checked ${result?.checked || 0} watch${result?.checked === 1 ? '' : 'es'}; ${result?.alerts || 0} cheaper.`);
    await renderWatches();
  } catch {
    showNotice('Could not check the watchlist.', true);
  } finally {
    setBusy(button, false);
  }
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
    if (pending.country != null) $('country').value = pending.country;
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
    if (hasKey) {
      clearNotice();
      state.usage.error = false;
      refreshUsage(true);
    } else {
      state.usage.remaining = null;
      state.usage.included = null;
      state.usage.used = null;
      state.usage.plan = '—';
      state.usage.period = '—';
      state.usage.error = false;
      renderUsagePopover();
    }
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
  try {
    const settings = await chrome.storage.sync.get({ defaultCountry: '', defaultCurrency: 'PLN', zureqApiKey: '' });
    const hasKey = Boolean(String(settings.zureqApiKey || '').trim());
    showNoKey(!hasKey);
    $('currency').value = settings.defaultCurrency || 'PLN';
    if (hasKey) refreshUsage(true);
    await loadMarkets();
    $('list-country').innerHTML = $('country').innerHTML;
    if (settings.defaultCountry) $('country').value = settings.defaultCountry;
    $('list-country').value = settings.defaultCountry || '';
    state.list.country = $('list-country').value;
    await renderWatches();
    let pending;
    try { ({ zureqPending: pending } = await chrome.storage.session.get({ zureqPending: null })); } catch {}
    if (!pending) ({ zureqPending: pending } = await chrome.storage.local.get({ zureqPending: null }));
    const savedList = await chrome.storage.local.get({ zureqBuild: null });
    if (savedList.zureqBuild) {
      state.list = { ...state.list, ...migrateListState(savedList.zureqBuild, settings.defaultCountry) };
      $('list-input').value = state.list.text;
      $('list-country').value = state.list.country;
      await saveList();
    }
    updateListEstimate();
    renderListParts();
    renderListSummary();
    await applyPending(pending || queuedPending);
    panelReady = true;
    if (queuedPending && queuedPending !== pending) await applyPending(queuedPending);
  } catch (error) { handleError(error); }
}
init();
