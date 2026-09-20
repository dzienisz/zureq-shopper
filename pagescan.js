(function attachPageScan(global) {
  function nodeValue(node) {
    return node?.getAttribute?.('content') || node?.content || node?.textContent || node?.value || '';
  }

  function productType(type) {
    return Array.isArray(type) ? type.some((item) => String(item).toLowerCase() === 'product') : String(type || '').toLowerCase() === 'product';
  }

  function findProduct(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const product = findProduct(item);
        if (product) return product;
      }
      return null;
    }
    if (!value || typeof value !== 'object') return null;
    if (productType(value['@type'])) return value;
    if (value['@graph']) return findProduct(value['@graph']);
    return null;
  }

  function offerPrice(offers) {
    const list = Array.isArray(offers) ? offers : [offers];
    for (const offer of list) {
      if (!offer || typeof offer !== 'object') continue;
      const rawPrice = offer.price ?? offer.lowPrice;
      const price = Number(rawPrice);
      if (Number.isFinite(price)) return { price, currency: offer.priceCurrency || null };
    }
    return { price: null, currency: null };
  }

  function extractJsonLd(document) {
    const scripts = document.querySelectorAll?.('script[type="application/ld+json"]') || [];
    for (const script of scripts) {
      try {
        const product = findProduct(JSON.parse(script.textContent || script.innerHTML || ''));
        if (!product) continue;
        const offer = offerPrice(product.offers);
        return {
          name: String(product.name || '').trim(),
          price: offer.price,
          currency: offer.currency ? String(offer.currency).toUpperCase() : null
        };
      } catch {}
    }
    return null;
  }

  function cleanTitle(value) {
    let title = String(value || '').replace(/\s+/g, ' ').trim();
    title = title
      .replace(/\s+:\s+Amazon\.[^:]+:.*$/i, '')
      .replace(/\s+(?:-|–|—|\|)\s+(?:Allegro\.pl|Ceneo\.pl|eBay|x-kom\.pl|MediaExpert\.pl).*$/i, '');
    return title.split(' ').slice(0, 8).join(' ').trim();
  }

  function parsePrice(value, explicitCurrency = null) {
    const text = String(value || '').replace(/\u00a0/g, ' ').trim();
    if (!text) return null;
    const currency = explicitCurrency ? String(explicitCurrency).toUpperCase() : /zł|pln/i.test(text) ? 'PLN' : /€|eur/i.test(text) ? 'EUR' : /£|gbp/i.test(text) ? 'GBP' : /\$|usd/i.test(text) ? 'USD' : null;
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
    const jsonLd = extractJsonLd(document);
    const heading = document.querySelector('h1, #productTitle')?.textContent;
    const meta = document.querySelector('meta[property="og:title"], meta[name="og:title"]')?.content;
    return cleanTitle(jsonLd?.name || heading || meta || document.title || '');
  }

  function extractPrice(document) {
    const jsonLd = extractJsonLd(document);
    if (jsonLd?.price != null) return { value: jsonLd.price, currency: jsonLd.currency || 'PLN' };
    const itemPrice = document.querySelector('[itemprop="price"]');
    const itemCurrency = document.querySelector('[itemprop="priceCurrency"]');
    const itemResult = parsePrice(nodeValue(itemPrice), nodeValue(itemCurrency));
    if (itemResult) return itemResult;
    const metaPrice = document.querySelector('meta[property="product:price:amount"]');
    const metaCurrency = document.querySelector('meta[property="product:price:currency"]');
    const metaResult = parsePrice(nodeValue(metaPrice), nodeValue(metaCurrency));
    if (metaResult) return metaResult;
    const candidates = [
      document.querySelector('#priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen')?.textContent,
      document.querySelector('[data-testid*="price"], [class*="price"]')?.textContent
    ];
    return candidates.map(parsePrice).find(Boolean) || null;
  }

  function isProductPage(hostname, pathname, document) {
    if (extractJsonLd(document)) return true;
    const host = String(hostname || '').toLowerCase();
    const path = String(pathname || '');
    if (/^(?:www\.)?allegro\.pl$/i.test(host) && /\/(?:oferta|produkt)\//i.test(path)) return true;
    if (/^(?:www\.)?amazon\.[a-z.]+$/i.test(host) && /\/(?:dp|gp\/product)\//i.test(path)) return true;
    if (/^(?:www\.)?ceneo\.pl$/i.test(host) && /^\/\d+/.test(path)) return true;
    if (/^(?:www\.)?ebay\.[a-z.]+$/i.test(host) && /\/itm\//i.test(path)) return true;
    if (/^(?:www\.)?x-kom\.pl$/i.test(host) && /^\/p\//i.test(path)) return true;
    return false;
  }

  global.ZureqPageScan = { cleanTitle, parsePrice, extractJsonLd, extractTitle, extractPrice, isProductPage };
}(globalThis));
