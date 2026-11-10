# Nourished: handover notes for Claude

Read this first in any new conversation about Nourished. It replaces the long chat history the app grew out of.

## What it is
Glen Anderson's own Noom-style weight-loss and nutrition app (formerly "Basket to Plate"). Built for his own use first, with a possible paid Android release later. Glen is vegetarian, uses kg for weight and feet/inches for height, and improved his fatty liver and cholesterol through diet; the app's guidance leans that way (no medical claims).

- Live app: https://andersonvibe.github.io/nourished/ (GitHub Pages from `main`, root). Installed on Glen's Pixel 9 Pro as a home-screen app.
- Repo: `andersonvibe/nourished`. Claude pushes directly (commit as `Claude <noreply@anthropic.com>` so commits show as verified).
- Older Claude-artifact version: https://claude.ai/artifact/RSf4RTvCQJ8UssE7LH8hD5 (same features minus barcode camera, live web recipe search and backups; uses Claude's built-in `sample`/`db`/`user` capabilities). **The GitHub version is the main line.** Only update the artifact if Glen asks.

## Files
- `index.html`: the whole app (HTML, CSS, JS in one file, ~2,400 lines). Photos are embedded as base64 JPEGs.
- `sw.js`: service worker. Network-first with `cache: 'no-cache'` for the app's own files, cache-first for Google Fonts. **Bump `VERSION` on every release.**
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`: install metadata and icons (cream leaf on forest green).
- `.nojekyll`, `README.md`.

## Releasing a change
1. Edit `index.html`.
2. Bump the footer label `<span class="mono">Version N</span>` (search for `Version `) and `VERSION` in `sw.js` (`nourished-vN`) to the same N. Current: **8**.
3. Syntax-check the main script (extract the last `<script>` block and run `node --check`).
4. Test headlessly with Playwright (Chromium is at `/opt/pw-browsers/chromium`): serve files via `page.route`, stub `https://api.anthropic.com/v1/messages` (responses are **streamed SSE**) and `world.openfoodfacts.org`.
5. Commit and push. Glen closes and reopens the app to pick it up and can confirm the version number at the bottom of the Home screen.

## Architecture
- **Storage:** everything in `localStorage` on the phone. Key `basket-to-plate-v1` holds `{settings, products, meals, receipts, weights, plans, exercise}` (old key name kept so data isn't lost). Backup/restore to a JSON file in My goals (merges, never wipes).
- **Claude:** direct browser calls to the Anthropic Messages API with Glen's own key (`localStorage['basket-to-plate-key']`, never in backups or the repo), header `anthropic-dangerous-direct-browser-access: true`. Model setting: `claude-sonnet-5-5` (default) or `claude-haiku-5-5`.
  - `ask(prompt, files, opts)` streams via `streamClaude()`, handles `pause_turn`, parses JSON from the final text, salvages complete items if an answer is cut short (`salvageArray`), and collects web-search result URLs into `lastSearchUrls`.
  - `callClaude()` (non-streamed) is only used for the key test.
  - Error codes map to plain messages in `ERR` (`bad_key`, `no_credit`, `rate_limited`, `overloaded`, `backgrounded`, `network`, `truncated`…).
- **Recipe search ("What can I make?"):** `findHave()` → `askWithSearch()`, using the `web_search_20250305` server tool with `allowed_domains` = `RECIPE_SITES`. Some big sites (BBC Good Food, Allrecipes, Guardian, Serious Eats, Simply Recipes, Good Housekeeping, bbc.co.uk) **block Claude's crawler**; the API rejects the whole request if they're listed, so they're excluded and any newly reported blocked site is stripped, remembered in `localStorage['nourished-blocked-sites']`, and retried. A recipe's rating/link is only shown if its URL came back from the search (`checked`); otherwise the card offers a Google search instead. Wake lock keeps the screen on; Android kills the request if the app is backgrounded.
- **Barcode scanning:** camera via `BarcodeDetector` (Chrome on Android) or typed number → pantry first (`product.barcode`) → Open Food Facts API v2 (free, no Claude). Unknown products fall back to a label photo, which is then linked to the barcode.
- **Calorie target:** Mifflin-St Jeor BMR × activity − pace × 7700/7 kcal; floor 1,500 (men) / 1,200 (women). Protein target 1.2 g × goal weight. Exercise: MET table `EX`, counting (MET − 1) × kg × hours; "eat back" setting 0 / 0.5 (default) / 1.
- **Food balance:** energy density per 100 g: light ≤ 100 kcal, moderate ≤ 240, dense above. Aims: light ≥ 30% of calories, dense ≤ 25%.
- **Meal photos:** a meal can have up to 6 photos (`files.m` is an array, `MAX_MEAL_PHOTOS`), e.g. prep shot + finished dish; each is shrunk to a 1568px JPEG as soon as it is picked (`shrinkPhoto`, decoding via `<img>` first because `createImageBitmap` failed on full-size Pixel photos), then all are sent in one request and the prompt says to count food seen in several photos once. Photos are only used for the estimate, not stored with the meal (localStorage space).
- **Units:** height ft/in or cm; weight kg, lb, or st+lb (`wUnit()`, `fmtW()`, `wInputHTML()`); stored internally as kg/cm.
- **Plain shopping names:** receipts store a `generic` name; "Add my recent shopping" asks Claude once per product for any without one (`plainNames()`), with an offline `roughName()` fallback.

## Design
Forest green `--leaf` and saffron `--olive` on soft stone, Bricolage Grotesque headings, Atkinson Hyperlegible body text. Photo-led home: hero (grain bowl), three photo cards (Log a meal, Scan food, Meal plan), then a grouped "Your tools" list. Light and dark themes via tokens. Photos came from Canva; Glen downloaded and attached them because Claude's workspace couldn't download from Canva.

## Ideas and open items
- Photos for the list tools (eaten out, shopping, pantry, exercise, ingredients) if Glen supplies them.
- Household profiles (several people on one phone).
- Play Store version: wrap with PWABuilder (Trusted Web Activity). Needs a small server holding the API key (Cloudflare Workers or Firebase Functions), Google sign-in (Firebase Auth), Play Billing, per-user fair-use limits, shared product database to cut cost. Suggested price £3.99–£4.99/month or £29.99/year.
- Not possible on the web: live supermarket prices (no public feeds), Health Connect step counts (native app only).
- Glen tracks API spend on the Claude Console Usage page; a recipe search costs a few pence to ~15p.
