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
- On supported Allegro and Amazon pages, the content script reads the page title
  and price only after you click the “Find on Zureq network” button.
- ZUREQ Shopper has no tracking or analytics and does not sell data.

For questions or requests, open an issue in the
[ZUREQ Shopper GitHub repository](https://github.com/dzienisz/zureq-shopper/issues).

Zureq's own terms are available at
[zureq.io/terms](https://zureq.io/terms).
