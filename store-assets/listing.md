# Chrome Web Store listing

## Store title

Zureq Shopper — Network Product Search & Price Compare

## Summary

Search products across Zureq shops, compare markets, plan builds, and find cheaper options on Allegro and Amazon.

## Detailed description

WHAT IT DOES

Zureq Shopper gives you one focused shopping workspace for product discovery,
market comparison, project planning, and price checking across supported shops.
It connects to the Zureq MCP API with your own API key.

HOW IT WORKS

1. Add your Zureq API key in Options.
2. Search for a product or compare selected markets in the side panel.
3. Build a parts list, ask the Assistant, or click the button on a supported
   Allegro or Amazon product page.
4. Review products, variants, prices, and checkout links before choosing where
   to buy.

FEATURES

- Product search with country, price, stock, sorting, details, variants, and
  checkout links.
- Live comparison across 2–4 markets with delivery notes and converted prices.
- Build planner for FPV drones, camera drones, 3D printers, gaming PCs,
  home-office setups, and custom parts lists.
- Assistant for product search, market comparison, usage questions, and build
  handoffs, with optional on-device Prompt API support.
- “Find on Zureq network” button on Allegro.pl and supported Amazon pages,
  including a same-currency cheaper-result marker.
- Context-menu actions, recent searches, usage tracking, and persisted build
  state.

CREDITS

Bring your own Zureq API key. Tool calls use the following credits:

search_products: 3 credits
compare_markets: 6 credits
get_product: 1 credit
create_checkout_link: 1 credit
get_shop, list_shops, list_categories: 1 credit each
list_markets and get_usage: free

PRIVACY

The API key is stored in Chrome sync storage. Requests go only to
api.zureq.io. Search history, build state, and market cache stay in local
Chrome storage. Supported shop pages are read only after you click the
extension button. There is no tracking, analytics, or data selling. See
PRIVACY.md in the source repository.

REQUIREMENTS

Chrome 114 or later on desktop. A Zureq API key is required for API requests.
The optional Prompt API enhancement uses Chrome's on-device AI when available
(Chrome 138+ with Gemini Nano); the rule-based Assistant works without it.

SINGLE PURPOSE

Zureq Shopper helps people discover products and compare shopping options
across the Zureq network.

PERMISSION JUSTIFICATIONS

storage: Saves the API key in sync storage and search history, build state, and
market cache in local storage.

contextMenus: Adds search and market-comparison actions for text selected by
the user.

sidePanel: Provides the extension's main search, compare, Build, Assistant, and
Usage workspace.

https://api.zureq.io/* host permission: Sends the user's requested MCP tool
calls to the Zureq API.

Allegro.pl and Amazon content-script matches: Reads the title and price on a
supported product page after the user clicks “Find on Zureq network” so the
extension can search and compare that product.

CATEGORY

Shopping

## Assets

| File | Size | Store slot |
| --- | --- | --- |
| shot1-search.png | 1280×800 | Screenshot 1 |
| shot2-compare.png | 1280×800 | Screenshot 2 |
| shot3-build.png | 1280×800 | Screenshot 3 |
| shot4-assistant.png | 1280×800 | Screenshot 4 |
| shot5-shop-page.png | 1280×800 | Screenshot 5 |
| tile-small.png | 440×280 | Small promo tile |
| tile-marquee.png | 1400×560 | Marquee promo tile |

Regenerate: `./render.sh`
