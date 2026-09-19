# Zureq Shopper

Zureq Shopper is a small, zero-build Chrome extension for finding products, comparing markets, and creating checkout links through the [Zureq MCP API](https://zureq.io).

## Install

1. Get an API key at [zureq.io](https://zureq.io).
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select this repository directory, open the extension's **Options**, and save your key.

The extension stores the key in Chrome sync storage and only contacts `api.zureq.io`. Search history and the 24-hour market list cache are stored locally.

## Features

- Search products by country, price, stock, and result limit.
- Inspect product details and variants.
- Create and open checkout links.
- Compare 2–4 markets in a selected currency.
- Search selected page text from the context menu.
- View current API usage and this session's estimated credit spend.

## New shopping tools

- **Build** turns an FPV drone, camera drone, 3D printer, gaming PC, or home-office idea into a searchable parts checklist. Custom comma-separated lists are supported too.
- **Assistant** provides a lightweight chat interface for product search, market comparison, usage questions, and build handoffs, with optional on-device Prompt API summaries.
- **Shop pages** on Allegro.pl and Amazon.com, Amazon.de, Amazon.pl, and Amazon.co.uk get a “Find on Zureq network” button that compares the page's title and price.

## Ideas implemented

- Relevance-ranked product search with country, price, stock, and result-limit filters.
- Product detail cards with variant selection and checkout-link creation.
- Live price comparison across multiple markets with converted currencies.
- Context-menu actions for searching or comparing selected text.
- Usage tracking, recent searches, market caching, and an options page for local API-key management.

## Credit costs

| Tool | Credits |
| --- | ---: |
| `search_products` | 3 |
| `compare_markets` | 6 |
| `get_product` | 1 |
| `create_checkout_link` | 1 |
| `get_shop`, `list_shops`, `list_categories` | 1 |
| `list_markets`, `get_usage` | Free |

## Development

This is plain JavaScript, HTML, and CSS with no bundler or dependencies.

Run the unit tests with:

```sh
npm test
```

To try the extension, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**, selecting this repository directory.

The optional Chrome Prompt API is available on Chrome 138+ when Gemini Nano is installed. It is only used on-device to improve intent parsing and summaries; the extension always has a rule-based fallback.

## Release

1. Run `scripts/bump-version.sh X.Y.Z` to update `manifest.json` and `package.json`.
2. Add a matching `## [X.Y.Z]` section to `CHANGELOG.md`.
3. Commit the changes, create tag `vX.Y.Z`, and push the tag.
4. The release workflow runs tests, packages the raw extension, creates the GitHub Release, and optionally uploads to the Chrome Web Store when its secrets are configured.

Chrome Web Store copy and screenshot sources live in `store-assets/`. Regenerate
the listing PNGs with `bash store-assets/render.sh`.
