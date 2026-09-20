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

The market uses Three.js meshes, shared materials, an angled camera, and lighting with shadows. Simulation positions remain independent of camera projection. `GameRuntime` maps screen-relative keyboard or joystick movement to the world, advances the game engine, and redraws the scene. The HUD occupies the edges of the full browser window. Check actual devices when tuning render resolution, shadows, camera framing, or touch controls.

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
5. Watch customers enter, choose stocked products, and form a spaced checkout queue.
6. Stand near checkout; confirm progress completes, money increases once, and the customer leaves.
7. Try an unaffordable upgrade and verify the shortfall feedback. Earn enough, hold on a pad, and verify it purchases once.
8. Unlock corn and test its complete production-to-sale loop.
9. Hire the cashier and leave checkout. Confirm customers continue to pay without the player present.
10. Reload and verify balance, purchased upgrades, capacities, unlocks, and tutorial progress persist.
11. Toggle sound and test a confirmed reset. Canceling reset must preserve progress.
12. Use the fixed joystick and drag an open part of the world; test pointer release, orientation changes, and confirm touch movement does not scroll the page.
13. Check the original 3D characters and carried stacks, crop readiness, shelf counts, checkout spot, upgrade progress, and floating rewards. Ensure important labels and the player remain readable in desktop, tablet, and phone layouts.

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
