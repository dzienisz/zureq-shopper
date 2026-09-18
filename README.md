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

This is plain JavaScript, HTML, and CSS with no bundler or dependencies. Run the unit tests with:

```sh
npm test
```
