# Privacy Policy

ZUREQ Shopper is designed to keep personal shopping data under your control.

- Your Zureq API key is stored only in `chrome.storage.sync`.
- The extension makes network calls only to `api.zureq.io`. Product queries,
  selected market codes, and shop IDs/SKUs are sent there only to fulfil the
  requests you make.
- Search history, the current build state, and the market list cache are stored
  in `chrome.storage.local`.
- The watchlist is stored locally, and its scheduled checks send watch queries
  to the Zureq API on the interval selected in Options.
- On supported Allegro, Amazon, Ceneo, eBay, x-kom, and MediaExpert pages, the
  content script reads the page title and price only after you click the “Find
  on Zureq network” button, or automatically when you explicitly enable
  Auto-compare in Options. Auto-compare sends a query to the Zureq API and
  caches its result locally for six hours.
- ZUREQ Shopper has no tracking or analytics and does not sell data.

## Uninstall survey

After uninstalling, your browser opens an optional Google Form. The extension sends no data with it, and the link has no identifiers. Answers are anonymous and covered by Google's [Privacy Policy](https://policies.google.com/privacy). This survey is separate from ZUREQ's product-search processing; survey answers never include your API key or search history automatically, and the extension does not send either with the link.

For questions or requests, open an issue in the
[ZUREQ Shopper GitHub repository](https://github.com/dzienisz/zureq-shopper/issues).

Zureq's own terms are available at
[zureq.io/terms](https://zureq.io/terms).
