import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../pagescan.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const scan = context.globalThis.ZureqPageScan;

test('cleans marketplace title suffixes and noise', () => {
  assert.equal(scan.cleanTitle('DJI Mini 4 Pro Fly More Combo - Allegro.pl'), 'DJI Mini 4 Pro Fly More Combo');
  assert.equal(scan.cleanTitle('Sony Camera Alpha 7 IV : Amazon.de: Electronics and Photo'), 'Sony Camera Alpha 7 IV');
  assert.equal(scan.cleanTitle('NVIDIA RTX 4070 | eBay'), 'NVIDIA RTX 4070');
  assert.equal(scan.cleanTitle('Laptop - Ceneo.pl'), 'Laptop');
  assert.equal(scan.cleanTitle('Monitor – x-kom.pl'), 'Monitor');
  assert.equal(scan.cleanTitle('Phone — MediaExpert.pl'), 'Phone');
  assert.equal(scan.cleanTitle('One Two Three Four Five Six Seven Eight Nine Ten'), 'One Two Three Four Five Six Seven Eight');
});

test('parses Polish and euro prices', () => {
  assert.equal(scan.parsePrice('1 299,00 zł').value, 1299);
  assert.equal(scan.parsePrice('1 299,00 zł').currency, 'PLN');
  assert.equal(scan.parsePrice('€49.99').value, 49.99);
  assert.equal(scan.parsePrice('€49.99').currency, 'EUR');
});

function documentWith({ scripts = [], nodes = {}, title = '' } = {}) {
  return {
    title,
    querySelectorAll: (selector) => selector === 'script[type="application/ld+json"]' ? scripts : [],
    querySelector: (selector) => nodes[selector] || null
  };
}

test('extracts JSON-LD product names and offer arrays', () => {
  const document = documentWith({
    scripts: [{ textContent: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'Product', name: 'Camera drone', offers: [{ price: '899.99', priceCurrency: 'EUR' }, { lowPrice: 700, priceCurrency: 'EUR' }] }]
    }) }]
  });
  const jsonLd = scan.extractJsonLd(document);
  assert.equal(jsonLd.name, 'Camera drone');
  assert.equal(jsonLd.price, 899.99);
  assert.equal(jsonLd.currency, 'EUR');
  assert.equal(scan.extractTitle(document), 'Camera drone');
  const jsonPrice = scan.extractPrice(document);
  assert.equal(jsonPrice.value, 899.99);
  assert.equal(jsonPrice.currency, 'EUR');
});

test('uses Open Graph and product meta price fallbacks', () => {
  const document = documentWith({
    title: 'Fallback title',
    nodes: {
      'h1, #productTitle': { textContent: '' },
      'meta[property="og:title"], meta[name="og:title"]': { content: 'Meta product' },
      '[itemprop="price"]': null,
      'meta[property="product:price:amount"]': { content: '49.99' },
      'meta[property="product:price:currency"]': { content: 'EUR' }
    }
  });
  assert.equal(scan.extractTitle(document), 'Meta product');
  const metaPrice = scan.extractPrice(document);
  assert.equal(metaPrice.value, 49.99);
  assert.equal(metaPrice.currency, 'EUR');
});

test('detects supported product paths and rejects unrelated paths', () => {
  const empty = documentWith();
  assert.equal(scan.isProductPage('allegro.pl', '/oferta/item', empty), true);
  assert.equal(scan.isProductPage('www.amazon.co.uk', '/dp/item', empty), true);
  assert.equal(scan.isProductPage('www.ceneo.pl', '/12345', empty), true);
  assert.equal(scan.isProductPage('www.ebay.de', '/itm/item', empty), true);
  assert.equal(scan.isProductPage('www.x-kom.pl', '/p/item', empty), true);
  assert.equal(scan.isProductPage('allegro.pl', '/search?q=item', empty), false);
  assert.equal(scan.isProductPage('www.ebay.de', '/sch/i.html', empty), false);
  assert.equal(scan.isProductPage('www.x-kom.pl', '/laptops', empty), false);
});

test('JSON-LD product detection supports MediaExpert pages', () => {
  const document = documentWith({
    scripts: [{ textContent: JSON.stringify({ '@type': ['Thing', 'Product'], name: 'Headphones' }) }]
  });
  assert.equal(scan.isProductPage('www.mediaexpert.pl', '/anything', document), true);
});
