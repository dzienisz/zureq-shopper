---
name: zureq-shopper-runtime-testing
description: Load and exercise the zero-build Chrome side-panel extension with a small paid API budget.
---

# Zureq Shopper runtime testing

## Setup
- No npm install or build is needed; a local server is needed only for optional
  authorized shop-page fixtures.
- In Chrome for Testing, open chrome://extensions, enable Developer mode, Load
  unpacked, and select the repository folder. Pin Zureq Shopper in the toolbar.
- Open Options from the extension menu or panel gear. Save a test API key and
  use Test connection (free get_usage) to confirm access. Never record a real
  key in plaintext; exercise Show/Hide with a dummy value.
- Reload the unpacked extension after source changes; this destroys panel
  in-memory results and resets its session estimate.
- Maximize Chrome before recording (`wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`
  on Linux). Widen the side panel by dragging its left divider.

## Devin Secrets Needed
- `ZUREQ_API_KEY`: a user-authorized test key for api.zureq.io. This is a suggested
  secret name; do not assume it exists. Never commit its value.

## Runtime checks
- Prefer real UI calls. Budget search=3, compare=6, details=1, checkout-link=1;
  list_markets and get_usage are free. Include rechecks in the budget.
- Selection actions can use a simple data:text/html page containing selectable
  product terms; this is selection input, not mocked API data.
- Check context search while the panel is on Usage/Compare, not just Search:
  both the selected query and visible tab must change.
- Check key clear/bogus/restore while the panel is already open, ensuring both
  missing-key and rejected-key notices recover correctly.
- Market availability varies; if fewer than five chips exist, report the
  fifth-selection limit as untested rather than fabricating markets.
- Product search can return accessories/artwork. Details may require choosing
  a real variant before creating a checkout URL. Open the link but do not buy.
- Capture the actual comparison response when diagnosing renderer behavior.
  Market objects may contain key, label, offers, delivery.note; offers may
  contain approxPrice/approxCurrency alongside their original price/currency.
- With explicit approval, replay a captured response through a temporary
  compare-only fetch override to verify rendering without spending more credits.
  Clearly label replay evidence, and remove the override or reload afterward.
- Chrome's standard page DOM output may omit side-panel contents; use actual
  screenshots for assertions. Passive CDP Network capture can collect response
  bodies without issuing another API request; never log authorization headers.
- For shop-page testing when external shops are unreachable, use an authorized
  UTF-8 local fixture containing an h1 and formatted price under `/oferta/`.
  Temporarily allow localhost in content-script matches, reload the extension,
  and restore the manifest afterward. This tests real extension extraction and
  real API calls, not Allegro/Amazon DOM compatibility.
- Plan parts replaces the current Build candidates; budget populated multi-part
  grouping checks up front instead of assuming a second plan adds one part.
- Attach passive Network capture before the request and retrieve response bodies
  immediately after loadingFinished; request IDs from an old CDP session may not
  retain retrievable response bodies. Reattach after closing/reopening the panel.
- Product availability depends on country and query. Record the exact request
  arguments and separate empty live results from failed rendering; avoid spending
  extra credits on repeated queries without approval.

## Packaged release verification
- Run `bash scripts/package.sh`, extract its versioned ZIP into a fresh directory,
  and load that directory unpacked. Disable the repository-loaded copy to avoid
  duplicate context-menu entries; the fresh path has a distinct extension ID and
  separate key storage.
- In Chrome's folder picker, navigate to the extracted root and click Open with
  no child folder selected. Verify Details → Loaded from before testing, so an
  accidentally selected `icons/` directory is not mistaken for a package failure.
- Independently compare extracted files with ZIP entries, check no development
  or store-assets paths shipped, and scan all extracted bytes for key literals.
  Do not alter extracted runtime files while testing the release artifact.
- Include a selected-text context action in the paid budget: it automatically
  submits another search even when an earlier toolbar search already passed.

## Watchlist checks
- After manifest permission changes, reload from the extension card itself;
  merely re-enabling an old installation may leave new APIs unavailable.
- Budget one paid search per watched item per check, including simulated drops
  and unchanged-repeat checks; remove extra watches before one-item checks.
- Background watch searches are not included in the panel's session estimate.
  Capture both side-panel and service-worker Network events to count paid calls.
  Treat account-wide remaining-credit deltas separately from nominal call costs.
- For an explicitly authorized drop simulation, update one watch's baseline
  price and lastPrice in side-panel DevTools, then click Check now normally.
  Verify the native notification and badge, revisit Watch to clear alerts, and
  repeat at the unchanged price to test suppression.
- Read chrome.alarms.getAll() in worker DevTools after saving the interval.
  Verify persistence and minutes as well as the visible Watch hint.
- Remove test watches and restore the original interval before finishing, so
  background alarms cannot silently spend more test credits.
