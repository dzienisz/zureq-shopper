(function attachPageScan(global) {
  function cleanTitle(value) {
    let title = String(value || '').replace(/\s+/g, ' ').trim();
    title = title.replace(/\s+-\s+Allegro\.pl.*$/i, '').replace(/\s+:\s+Amazon\.[^:]+:.*$/i, '');
    return title.split(' ').slice(0, 8).join(' ').trim();
  }

  function parsePrice(value) {
    const text = String(value || '').replace(/\u00a0/g, ' ').trim();
    if (!text) return null;
    const currency = /zł|pln/i.test(text) ? 'PLN' : /€|eur/i.test(text) ? 'EUR' : /£|gbp/i.test(text) ? 'GBP' : /\$|usd/i.test(text) ? 'USD' : null;
    const match = text.replace(/[^\d,.\s]/g, '').match(/[\d][\d\s.,]*/);
    if (!match) return null;
    let number = match[0].replace(/\s/g, '');
    if (number.includes(',') && number.includes('.')) {
      number = number.lastIndexOf(',') > number.lastIndexOf('.') ? number.replace(/\./g, '').replace(',', '.') : number.replace(/,/g, '');
    } else if (number.includes(',')) {
      number = number.replace(',', '.');
    }
    const parsed = Number(number);
    return Number.isFinite(parsed) ? { value: parsed, currency: currency || 'PLN' } : null;
  }

  function extractTitle(document) {
    const heading = document.querySelector('h1, #productTitle')?.textContent;
    const meta = document.querySelector('meta[property="og:title"], meta[name="og:title"]')?.content;
    return cleanTitle(heading || meta || document.title || '');
  }

  function extractPrice(document) {
    const candidates = [
      document.querySelector('[itemprop="price"]')?.getAttribute('content'),
      document.querySelector('#priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen')?.textContent,
      document.querySelector('[data-testid*="price"], [class*="price"]')?.textContent
    ];
    return candidates.map(parsePrice).find(Boolean) || null;
  }

  global.ZureqPageScan = { cleanTitle, parsePrice, extractTitle, extractPrice };
}(globalThis));
