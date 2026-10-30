# Firefox Add-ons listing

## Name

ZUREQ Shopper — Network Product Search & Price Compare

## Summary

Search 9,600+ independent shops on the ZUREQ network, compare markets, watch prices and get ready-to-pay cart links.

## Detailed description

ZUREQ Shopper gives you one focused shopping workspace for product discovery,
market comparison, shopping lists, price alerts, and checkout links across
9,600+ independent shops in the US, Poland, and Austria. It connects to the
ZUREQ MCP API with your own API key.

Featured integration on zureq.io (https://zureq.io).

HOW IT WORKS

1. Add your ZUREQ API key in Options.
2. Search for a product or compare selected markets in the Firefox sidebar.
3. Search a list of up to 10 items, or click the button on a supported shop
   product page.
4. Review products, variants, prices, and checkout links before choosing where
   to buy.
5. Watch a product or search and get notified when it gets cheaper.

FEATURES

- Product search with country, price, stock, result-limit filters, image
  placeholders, product details, and variants.
- Busy buttons and spinners show progress during longer actions; Search and
  Compare also display skeleton results while loading.
- Live comparison across 2–4 markets with delivery notes and converted prices.
- List searches up to 10 items with up to five candidates per item and
  per-shop totals.
- Shop-aware checkout checks support and respects each shop's cart line limit,
  splitting carts into separate links when needed.
- Price alerts for watched products and searches, with a configurable
  background check interval.
- “Find on ZUREQ network” button on supported shop product pages, including
  market-matched searches and an optional same-currency cheaper-result marker.
- A header usage badge shows remaining credits and this session's estimated
  spend; context-menu actions, recent searches, and list state are also
  available.

CREDITS

Bring your own ZUREQ API key. Tool calls use the following credits:

search_products: 3 credits (1 if nothing is found)
compare_markets: 6 credits (2 if every market is empty)
get_product: 1 credit
create_checkout_link: 1 credit
get_shop: 1 credit (cached per shop for 24 hours)
list_shops, list_categories: 1 credit each
list_markets and get_usage: free

Each List search costs up to 3 credits per item. Checkout links use 1 credit per
request and respect each shop's line limit. The extension checks shop support
with get_shop before creating links; shop metadata is cached for 24 hours.

PRIVACY

The API key is stored in your browser's extension storage (chrome.storage.sync).
Requests go only to api.zureq.io. Search history, list state, and market cache
stay in local browser extension storage (chrome.storage.local). Supported shop
pages are read only after you click the extension button. There is no tracking,
analytics, or data selling. See PRIVACY.md in the source repository.

REQUIREMENTS

Firefox 142 or later on desktop. A ZUREQ API key is required for API requests.

SINGLE PURPOSE

ZUREQ Shopper helps people discover products and compare shopping options
across the ZUREQ network.

CATEGORY

Shopping

SUPPORT

https://github.com/dzienisz/zureq-shopper/issues

PRIVACY POLICY

https://github.com/dzienisz/zureq-shopper/blob/main/PRIVACY.md

## Screenshots

Real Firefox screenshots (Firefox sidebar, live ZUREQ API, 1280×800), uploaded to AMO in this order:

| File | Caption |
| --- | --- |
| `store-assets/firefox/ff1-search.png` | Search the ZUREQ network from the Firefox sidebar |
| `store-assets/firefox/ff2-compare.png` | Compare markets side by side |
| `store-assets/firefox/ff3-list.png` | Search a shopping list and get per-shop totals |
| `store-assets/firefox/ff4-watch.png` | Watch products and get notified when they get cheaper |
