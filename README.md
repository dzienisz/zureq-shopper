# ZUREQ Shopper

ZUREQ Shopper is a small, zero-build extension for Chrome and Edge to find products, compare markets, and create checkout links through the [ZUREQ MCP API](https://zureq.io).

Featured integration on [zureq.io](https://zureq.io).

## Install

1. Get an API key at [zureq.io](https://zureq.io).
2. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select this repository directory, open the extension's **Options**, and save your key.

The extension stores the key in your browser's sync storage and only contacts `api.zureq.io`. Search history and 24-hour market-list and shop-info caches are stored locally.

## Features

- Search products by country, price, stock, and result limit.
- Inspect product details and variants, including stock and freshness; expand long descriptions and visit shops already in cache.
- Create checkout links for supported shops; List splits carts to each shop's line limit and falls back to per-item links when a cart fails.
- Compare 2–4 markets in a selected currency.
- Search selected page text from the context menu.
- View current API usage and this session's estimated credit spend.
- Save product and search watches for scheduled price-drop alerts.

## New shopping tools

- **List** searches up to 10 products, shows up to five candidates per item, and groups selected products by shop with item totals and checkout links.
- **Shop pages** on Allegro.pl, Amazon, Ceneo, eBay, x-kom.pl, and MediaExpert.pl get a “Find on Zureq network” button; optionally enable a cached inline “Cheaper on Zureq” check in Options.

## Ideas implemented

- Relevance-ranked product search with country, price, stock, and result-limit filters.
- Product detail cards with variant selection and checkout-link creation.
- Live price comparison across multiple markets with converted currencies.
- Context-menu actions for searching or comparing selected text.
- Usage tracking, recent searches, market caching, and an options page for local API-key management.

## Credit costs

| Tool | Credits |
| --- | ---: |
| `search_products` | 3 credits (1 if nothing is found) |
| `compare_markets` | 6 credits (2 if every market is empty) |
| `get_product` | 1 |
| `create_checkout_link` | 1 |
| `get_shop` | 1 (cached per shop for 24 hours) |
| `list_shops`, `list_categories` | 1 |
| `list_markets`, `get_usage` | Free |

Each List search costs up to 3 credits per item. Checkout checks shop support with `get_shop` before creating links; shop metadata is cached per shop for 24 hours. Each checkout-link request costs 1 credit, and cart links respect each shop's line limit.

## Development

This is plain JavaScript, HTML, and CSS with no bundler or dependencies.

Run the unit tests with:

```sh
npm test
```

To try the extension in Chrome or Edge, open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**, selecting this repository directory.

## Release

1. Run `scripts/bump-version.sh X.Y.Z` to update `manifest.json` and `package.json`.
2. Add a matching `## [X.Y.Z]` section to `CHANGELOG.md`.
3. Commit the changes, create tag `vX.Y.Z`, and push the tag.
4. The release workflow runs tests, packages the raw extension, creates the GitHub Release, and optionally uploads to the Chrome Web Store and Edge Add-ons. The Edge step runs only when all `EDGE_*` secrets are configured.

Chrome Web Store copy and screenshot sources live in `store-assets/`; Edge
listing copy is in `store-assets/edge/listing.md`. Regenerate the listing PNGs
with `bash store-assets/render.sh`.
