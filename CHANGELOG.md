# Changelog

## [1.3.4] - 2026-10-17

- New ZUREQ logo: the wave mark on ink, matching the current zureq.io branding
  (no more lime).
- Store screenshots and promo tiles re-rendered with the new logo.

## [1.3.3] - 2026-10-17

- List: Checkout link waits for product details, so products that need a size/
  colour can't be sent without one, and the message stays visible.
- List: changing a variant with the keyboard keeps focus on the picker.
- Searches that Zureq reports as temporarily unavailable are retried once.
- Watch "this search" uses the currency most results are in for its baseline.

## [1.3.2] - 2026-10-17

- List: products that come in sizes/colours now show a Variant picker, and
  checkout links use the chosen variant.
- Watch uses the last search you ran, not unsent form edits.
- Options "Test connection" no longer saves an untested key.
- "Visit shop" appears right after the first checkout link; Max price 0 is
  rejected before searching.
- Compare market chips work with the keyboard, long recent searches are
  truncated, and the header fits at 320px.

## [1.3.1] - 2026-10-17

- Added loading feedback with busy buttons and spinners for Search, Compare,
  Details, Checkout, List, and Watch; Search and Compare also show skeleton
  results while loading.
- Applied ZUREQ branding across the extension, including the logo, color
  palette, regenerated icons, and branded Options page.

## [1.3.0] - 2026-10-17

- Fixed EU searches to use the region filter; improved variant labels, readable
  API errors, and market names and counts.
- Added shop-aware checkout support checks, unsupported-shop messaging,
  shop-specific line limits, and split cart links; product details now show
  stock and freshness.
- Removed Assistant, replaced Build with List, removed optimizer and sharing
  features, and moved Usage into a header badge alongside the four core tabs.
- Added image placeholders and polished product cards; shop-page searches now
  use the market matching the supported shop domain.

## [1.2.2] - 2026-09-19

- Reworded the store summary and description to drop the retailer name list (Chrome Web Store keyword policy).

## [1.2.1] - 2026-09-19

- Refreshed the store summary and listing screenshots for the 1.2 feature set.

## [1.2.0] - 2026-09-23

- Declared expected input/output languages for the on-device Assistant model.

- Added a multi-item cart optimizer that reduces estimated shipments across
  selected build parts.
- Added generic product-page extraction for Ceneo, eBay, x-kom, and
  MediaExpert alongside Allegro and Amazon.
- Added an optional cached inline “Cheaper on Zureq” badge on supported shop
  pages.
- Added sharing and Markdown export/import for Build plans.

## [1.1.1] - 2026-09-21

- Renamed the extension to ZUREQ Shopper.

## [1.1.0] - 2026-09-20

- Added a local watchlist with scheduled price-drop checks and notifications.
- Added Watch actions on Search and Assistant results, a Watch tab with manual
  checks, and a check-interval setting (6h/12h/24h/weekly).

## [1.0.0] - 2026-09-19

- Added product search, market comparison, usage tracking, Options, and
  context-menu actions through the Zureq MCP API.
- Added the Build planner for multi-part shopping lists with grouped checkout
  links.
- Added the Assistant for shopping questions, comparisons, usage, and build
  handoffs.
- Added the Allegro.pl and Amazon shop-page button for network price searches.
- Added a zero-build Manifest V3 Chrome extension with local history and
  persisted build state.
