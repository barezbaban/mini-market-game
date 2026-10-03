# Development and deployment notes

## Runtime and commands

Use Node.js 22.17.1 or newer in the Node 22 release line to match the development runtime. The underlying Vite requirement is Node 20.19+ in the Node 20 line, or Node 22.12+; CI uses Node 22. Install with `npm ci` when using the committed lockfile; use `npm install` when intentionally changing dependencies.

| Command                | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Run the Vite development server                        |
| `npm run lint`         | Check TypeScript and project lint rules                |
| `npm test`             | Run core gameplay tests once                           |
| `npm run test:watch`   | Run tests while developing                             |
| `npm run test:e2e`     | Run browser tests against a running production preview |
| `npm run build`        | Type-check and create `dist/`                          |
| `npm run preview`      | Serve the production build locally                     |
| `npm run format`       | Apply Prettier formatting                              |
| `npm run format:check` | Check formatting without edits                         |

Open the URL printed by Vite. The repository base path is `/mini-market-game/`, including during local previews.

The active game code uses the unsuffixed files in `src/game/`. Old, untracked `* 2.ts` copies are preserved in the workspace but explicitly excluded from TypeScript and ESLint; they are not part of the game build. Earlier `FloatingText 2.ts` and `MobileControls 2.ts` copies are preserved under `backups/pre-3d-duplicates/`.

## npm cache permissions

The development Mac had an npm cache containing files created by an earlier root-owned operation. If `npm install` or `npm ci` reports `EACCES`, `EPERM`, or a root-owned cache file, choose a writable cache for this command:

```sh
npm install --cache /tmp/mini-market-game-npm-cache
# Or, for the committed dependency versions:
npm ci --cache /tmp/mini-market-game-npm-cache
```

The flag only changes where npm stores downloaded package data. It does not alter the global npm configuration, the application, or existing saves. Use a different writable cache path if that temporary directory already belongs to another account. Avoid running the package installation with `sudo`; a cache ownership repair is an optional machine-maintenance task, not a prerequisite for working on this repository.

## 3D renderer

The browser needs WebGL2. Use a current browser with graphics acceleration enabled; a clear startup message appears if the renderer cannot initialize. The production site remains entirely static and needs no backend or graphics server.

The market uses Three.js meshes, shared materials, an angled camera, and lighting with world shadows disabled. Simulation positions remain independent of camera projection. `GameRuntime` maps screen-relative keyboard or joystick movement to the world, advances the game engine, and redraws the scene. The HUD occupies the edges of the full browser window. Check actual devices when tuning render resolution, camera framing, or touch controls.

## Debug mode

Append `?debug=true` to the game URL to show FPS, draw calls, player position, inventory, customer states, and tutorial progress. This opt-in mode also exposes `window.__MARKET__` for developer inspection and controlled browser-test fixtures. The hook is absent during normal play.

To inspect a detached copy without changing the live market, use the browser console:

```js
window.__MARKET__.engine.snapshot();
```

The underlying hook also exposes live systems used by the automated test fixtures; it is not a read-only security boundary or a supported gameplay API. Use snapshots for inspection, and keep any fixture changes in an isolated test browser profile.

## Browser tests

Playwright tests the production build. Start it in one terminal:

```sh
npm run build
npm run preview
```

Leave the preview process running. In another terminal, run:

```sh
npm run test:e2e
```

By default, the configuration launches Google Chrome already installed on the computer. It connects to `http://127.0.0.1:4173/mini-market-game/`; it does not start the server or rebuild files. Rebuild after source changes before rerunning browser tests.

To use Playwright's Chromium instead of installed Chrome:

```sh
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

To run the suite with Firefox or WebKit:

```sh
npx playwright install firefox webkit
PLAYWRIGHT_BROWSER=firefox npm run test:e2e
PLAYWRIGHT_BROWSER=webkit npm run test:e2e
```

The touch gesture test uses Chromium's browser-control protocol and is skipped on Firefox and WebKit. The layout and other applicable browser tests still run. WebKit testing checks that engine's behavior; it does not replace testing Safari on an actual Apple device.

`PLAYWRIGHT_CHANNEL` selects a Chromium channel, such as `chrome`, `chromium`, or `msedge`; the chosen browser must be installed. `PLAYWRIGHT_BROWSER` selects `chromium` (default), `firefox`, or `webkit`. `PLAYWRIGHT_BASE_URL` overrides the target URL and should include the repository path and trailing slash, for example:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174/mini-market-game/ npm run test:e2e
```

The suite covers desktop movement, harvesting, shelves, sales, upgrades, save/reload, reset confirmation, responsive viewport sizes, and touch movement. It uses isolated browser contexts and controlled fixtures for long progression steps. Failure screenshots are written under `test-results/<browser>/`. The Pages workflow runs unit tests and the production build; browser tests are a separate command.

## Gameplay verification

Start a new game in a separate browser profile or confirm Reset Game in Settings. Do not clear a save that you want to keep.

1. Move with WASD and arrow keys; verify diagonals are consistent and the player stays inside world boundaries.
2. Wait at the tomato farm, collect produce, and confirm basket counts stop at capacity.
3. Move to the tomato shelf and confirm only matching produce transfers and shelf capacity is respected.
4. Repeat for eggs. Confirm empty and stocked shelf indicators differ.
5. Confirm the entrance station starts with three carts. Watch each customer push a cart into the store, verify selected products appear inside it, and confirm a fourth shopper waits until a cart is returned.
6. Stand near checkout; confirm progress completes, its cash pile grows, XP increases once, and the customer leaves. The wallet must not increase until approaching the gold cash circle. Camp there through another sale and reload: new payments must remain stacked until leaving and returning.
7. Open Manage, try an unaffordable upgrade, and verify the shortfall feedback. Earn enough and verify one button press purchases exactly one level.
8. Unlock corn and test its complete production-to-sale loop.
9. Hire the cashier and leave checkout. Confirm sales continue past $250 and with much larger cash balances, without crediting the wallet. Collect the full exact amount. At player level 20 buy the second checkout; verify simultaneous sales, separate piles, and saved in-flight customers. Check the same unlimited-storage/manual-collection behavior at the drive-through. Restore an older save with full registers and verify they reopen without losing cash. At million- and billion-dollar balances, confirm signs remain legible and each pile stays at six reusable bundles in two short layers. Save/reload a thief carrying more than $250, catch them, and verify exact recovery once.
10. Reload and verify balance, purchased upgrades, capacities, unlocks, and tutorial progress persist.
11. Toggle sound and test a confirmed reset. Canceling reset must preserve progress.
12. Use the fixed joystick and drag an open part of the world; test pointer release, orientation changes, and confirm touch movement does not scroll the page.
13. Check the original 3D characters and carried stacks, crop readiness, shelf counts, checkout spot, and floating rewards. Confirm the market has no upgrade pads or upgrade-price signs. Ensure important labels and the player remain readable in desktop, tablet, and phone layouts.
14. Open Manage and visit all four tabs. Check prerequisites, unaffordable buttons, the level roadmap, next-level prices, and capped upgrades. Test shelves at levels 3/10/20 (12 → 16 → 20 → 24 spaces), carts through 10 then 11–15 at levels 20/22/24/26/28, and advanced basket/cashier/marketing tiers at levels 20/25/30. Verify gates one XP below and exactly at the threshold, preservation of stock on upgrade/reload, and a full 15-customer checkout queue. Confirm the simulation pauses and resumes with keyboard focus restored when the dialog closes. Paid sales grant 5 XP per customer plus 2 per item, exactly once; partial orders earn none.
15. Expand through the production wing, coffee corner, carrot garden, and dairy meadow. Add farm units through their caps and verify independent growth. Supply all three machines and check their 2/4/6/8-item batch levels, inventory transfer, and save/reload behavior.
16. Hire three helpers, upgrade carrying capacity and speed, then watch them harvest, supply, collect, and stock without duplication. Upgrade marketing, cashier, and accountant through their limits; verify arrival rate, service timing, passive XP, and the player level meter.
17. Open the Basket drawer to inspect all nine products. Check management tabs, card scrolling, inventory previews, and close controls on portrait and landscape screens. Confirm a purchase saves without closing the management dialog.
18. Open the drive-through and observe several orders after each expansion. Confirm later goods such as coffee, milk, and cheese can appear, with two to four total units and no more than three product types per order.
19. Leave cash for three active minutes while away. Verify a visible thief approach, six-second theft warning, stolen cash, and sprint/net capture. Reload during flight and while caught: money must not duplicate or disappear. A helper must retain carried items while guarding, police must walk in and escort out, and the helper must resume work. Check the no-helper case, escape loss, cooldown, drive cash targeting, capture blocked by shelves, and desktop/mobile sprint controls.

Target desktop viewports include 1920×1080, 1440×900, and 1366×768. Also check an iPad-sized viewport, phone landscape, and phone portrait. Target current Chrome, Safari, Edge, and Firefox; device emulation is useful but does not replace testing a physical touch device.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` has a build job and a separate deployment job. Both pushes to `main` and pull requests run installation, lint, tests, and a production build. Only the `main` branch uploads and deploys the Pages artifact. A manual workflow run on `main` can redeploy it.

To configure a new fork or renamed repository:

1. Set the repository's Pages source to **GitHub Actions** in Settings → Pages.
2. Set `base` in `vite.config.ts` to `/<repository-name>/`. For an account-level `username.github.io` repository or a root custom domain, use `/`.
3. Update repository and demo URLs in the README.
4. Push to `main` and inspect the **Check and deploy to GitHub Pages** run in Actions.
5. Open the environment URL from the successful deployment and test the game, favicon, and reloading.

The workflow uses official GitHub actions with versioned releases. Deployment receives `pages: write` and `id-token: write`; pull request build checks need only repository read access.

If Pages returns 404, verify the repository Pages source and the deployment result. If the HTML loads but game assets fail, check the Vite base path and avoid root-relative asset URLs. Build output is generated locally and in CI; do not edit `dist/` as source code.
