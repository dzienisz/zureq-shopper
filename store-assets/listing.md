# Chrome Web Store listing

## Store title

ZUREQ Shopper — Network Product Search & Price Alerts

## Summary

Search 9,600+ independent shops on the ZUREQ network, watch prices and get ready-to-pay cart links.

## Detailed description

WHAT IT DOES

ZUREQ Shopper gives you one focused shopping workspace for product discovery,
shopping lists, price alerts, and checkout links across
9,600+ independent shops in the US, Poland, and Austria. Connect with your
ZUREQ account or use your own API key to access the ZUREQ MCP API.

Featured integration on zureq.io (https://zureq.io).

HOW IT WORKS

1. Connect with ZUREQ in Options (Google works), or add your API key.
2. Search for a product in the side panel.
3. Search a list of up to 10 items, or click the button on a supported shop
   product page.
4. Review products, variants, prices, and checkout links before choosing where
   to buy.
5. Watch a product or search and get notified when it gets cheaper, reaches
   your target price, or is back in stock.

FEATURES

- Product search with country, price, stock, result-limit filters, image
  placeholders, product details, and variants.
- Busy buttons and spinners show progress during longer actions; Search also
  displays skeleton results while loading.
- List searches up to 10 items with up to five candidates per item and
  per-shop totals.
- Shop-aware checkout checks support and respects each shop's cart line limit,
  splitting carts into separate links when needed.
- Price alerts for watched products and searches: an optional target price,
  back-in-stock alerts for products, a local price history with the lowest
  price in 30 days, and a configurable background check interval.
- “Find on Zureq network” button on supported shop product pages, including
  market-matched searches and an optional same-currency cheaper-result marker.
- A header usage badge shows remaining credits and this session's estimated
  spend; context-menu actions, recent searches, and list state are also
  available.

CREDITS

Connect with your ZUREQ account or use your own API key. Tool calls use the following credits:

search_products: 3 credits (1 if nothing is found)
get_product: 1 credit
create_checkout_link: 1 credit
get_shop: 1 credit (cached per shop for 24 hours)
list_shops, list_categories: 1 credit each
list_markets and get_usage: free

Each List search costs up to 3 credits per item. Checkout links use 1 credit per
request and respect each shop's line limit. The extension checks shop support
with `get_shop` before creating links; shop metadata is cached for 24 hours.

PRIVACY

API keys are stored in Chrome sync storage; OAuth sign-in tokens stay only in
this browser's local storage. MCP requests go to api.zureq.io; chat.zureq.io is
contacted only for sign-in, token refresh, and disconnect. Search history, list
state, and market cache stay in local Chrome storage. Supported shop pages are
read only after you click the extension button. There is no tracking, analytics,
or data selling. See PRIVACY.md in the source repository.

REQUIREMENTS

Chrome 114 or later on desktop. Connect with a ZUREQ account or use a ZUREQ API key.

SINGLE PURPOSE

ZUREQ Shopper helps people discover products, build shopping lists, and watch
prices across the Zureq network.

PERMISSION JUSTIFICATIONS

storage: Saves API keys in sync storage, sign-in tokens in local storage, and
search history, list state, and market cache locally.

identity: Opens the ZUREQ sign-in flow and receives its redirect.

contextMenus: Adds a search action for text selected by the user.

sidePanel: Provides the Search, List, and Watch workspace; remaining
credits are shown in the header.

alarms: Runs the user's saved price watches on the interval chosen in Options
(default daily).

notifications: Shows a notification when a watched product or search gets
cheaper or reaches the user's target price, or when a watched product is back
in stock.

https://api.zureq.io/* host permission: Sends the user's requested MCP tool
calls to the Zureq API.

Supported shop product-page content scripts: Read the product title and price
after the user clicks “Find on Zureq network”, or automatically only when the
user enables Auto-compare in Options.

CATEGORY

Shopping

## Assets

| File | Size | Store slot |
| --- | --- | --- |
| shot1-search.png | 1280×800 | Screenshot 1 |
| shot2-signin.png | 1280×800 | Screenshot 2 |
| shot3-list.png | 1280×800 | Screenshot 3 |
| shot4-watch.png | 1280×800 | Screenshot 4 |
| shot5-shop-page.png | 1280×800 | Screenshot 5 |
| tile-small.png | 440×280 | Small promo tile |
| tile-marquee.png | 1400×560 | Marquee promo tile |

Regenerate screenshots and tiles: `./render.sh` (needs Chrome + ImageMagick). Extension icons are rendered from `icons/zureq-mark.svg` at exact transparent 16×16, 48×48, and 128×128 viewports, then finished with a supersampled rounded-corner alpha mask (rx 14/64).
