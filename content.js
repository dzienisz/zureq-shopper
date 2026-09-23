(function () {
  const scan = globalThis.ZureqPageScan;
  if (!scan || !scan.isProductPage(location.hostname, location.pathname, document)) return;

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;right:18px;bottom:18px;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    .box{display:flex;align-items:center;gap:8px;padding:8px;background:#fff;border:1px solid #d7dee8;border-radius:10px;box-shadow:0 8px 25px #1420332b;font:600 12px system-ui;color:#18212b}
    button{border:0;border-radius:7px;padding:8px 10px;background:#1769e0;color:white;font:inherit;cursor:pointer}
    .close{padding:3px 7px;background:#f1f4f7;color:#6d7782}
    .status{max-width:230px}
    .cheaper{color:#16803c}
    .muted{color:#6d7782}
  </style><div class="box"><span class="status"></span><button class="find">Find on Zureq network</button><button class="close" aria-label="Dismiss">×</button></div>`;
  document.documentElement.append(host);

  const status = shadow.querySelector('.status');
  const find = shadow.querySelector('.find');
  shadow.querySelector('.close').addEventListener('click', () => host.remove());

  function showPlainButton() {
    status.className = 'status';
    status.textContent = '';
    find.textContent = 'Find on Zureq network';
  }

  find.addEventListener('click', () => {
    const price = scan.extractPrice(document);
    const query = scan.extractTitle(document);
    const source = { site: location.hostname, ...(price ? { price: price.value, currency: price.currency } : {}) };
    chrome.runtime.sendMessage({ type: 'zureq-search', query, source }, (response) => {
      if (chrome.runtime.lastError || response?.ok === false) {
        const message = document.createElement('div');
        message.textContent = 'Click the ZUREQ Shopper toolbar icon to compare this page.';
        message.style.cssText = 'position:fixed;right:18px;bottom:18px;padding:10px;background:#fff4dc;color:#815700;border-radius:8px;font:12px system-ui;z-index:2147483647';
        document.documentElement.append(message);
        setTimeout(() => message.remove(), 5000);
      } else host.remove();
    });
  });

  chrome.storage.sync.get({ autoCompare: false, defaultCountry: '' }).then((settings) => {
    if (!settings.autoCompare) {
      showPlainButton();
      return;
    }
    const query = scan.extractTitle(document);
    if (!query) {
      showPlainButton();
      return;
    }
    const price = scan.extractPrice(document);
    const source = { site: location.hostname, ...(price ? { price: price.value, currency: price.currency } : {}) };
    status.className = 'status';
    status.textContent = 'Checking Zureq…';
    chrome.runtime.sendMessage({ type: 'zureq-auto-compare', query, source }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        showPlainButton();
        return;
      }
      const best = response.best;
      if (response.cheaper && best) {
        status.className = 'status cheaper';
        status.textContent = `Cheaper on Zureq: ${best.price} ${best.currency || ''} · ${best.shopName || best.shopId || 'shop'}`;
      } else if (best) {
        status.className = 'status muted';
        status.textContent = `Zureq from ${best.price} ${best.currency || ''}`;
      } else {
        status.className = 'status muted';
        status.textContent = 'Not on Zureq network';
      }
    });
  }).catch(() => showPlainButton());
}());
