# Mini Market Manager

A small farm, a friendly market, and room to grow. Mini Market Manager is an original browser management game: harvest fresh produce, fill your shelves, serve customers, and turn your first sales into a thriving little business.

[Play on GitHub Pages](https://barezbaban.github.io/mini-market-game/) · [Architecture](docs/architecture.md) · [Development and deployment](docs/development.md)

## Gameplay

Start with **$0**, a basket that holds **8 items**, a tomato patch, and a chicken area. Walk near ripe produce to collect it, carry it to the matching shelf, and wait at checkout to serve customers. All everyday interactions happen automatically when you are close enough.

Grow → harvest → carry → stock → serve → earn → upgrade.

The market occupies the top of the map; the farm sits below it. Customers enter through the market entrance, find available products, form a checkout line, pay, and leave. Stand on an affordable upgrade pad for a little over a second to purchase it.

| Product  | Production time | Sale price | Availability           |
| -------- | --------------- | ---------- | ---------------------- |
| Tomatoes | 5 seconds       | $5         | Available at the start |
| Eggs     | 7 seconds       | $7         | Available at the start |
| Corn     | 10 seconds      | $10        | Unlock for $150        |

Spend earnings on a bigger basket ($100), a larger tomato shelf ($120), more frequent customers ($90), corn ($150), or a cashier ($300). The cashier serves the checkout automatically so you can concentrate on production and stocking.

## Features

- Original illustrated world, characters, product icons, and shop branding.
- Automatic harvesting, stocking, and checkout; no interaction button needed.
- Three products with configurable production, prices, capacities, and unlocks.
- Customer state machines, an orderly checkout queue, and a hireable cashier.
- Five in-world upgrades with prices, hold progress, and affordability feedback.
- Floating feedback, carried products, stock indicators, and a short first-time tutorial.
- Desktop movement and a virtual joystick for touch screens.
- Local saves, a sound toggle, and a confirmed reset in Settings.
- Modular TypeScript systems, automated tests, and GitHub Pages deployment.

## Controls

| Action           | Desktop                               | Touch                  |
| ---------------- | ------------------------------------- | ---------------------- |
| Move             | **WASD** or **arrow keys**            | Virtual joystick       |
| Harvest or stock | Stand near a farm or matching shelf   | Same                   |
| Serve checkout   | Stand beside the checkout counter     | Same                   |
| Buy an upgrade   | Hold position on its upgrade pad      | Same                   |
| Sound            | Use the speaker button in the toolbar | Tap the speaker button |
| Reset progress   | Open **Settings**                     | Tap **Settings**       |

Landscape is recommended on phones. The canvas scales to fit its container and supports portrait layouts with a rotation hint. Touch movement does not scroll the game page.

## Screenshots

![Mini Market Manager desktop gameplay: market above, farm below, and upgrades alongside the world](docs/screenshots/desktop.png)

The screenshot is captured from the running application. All scenery and character art are created for this project.

[Mobile landscape screenshot](docs/screenshots/mobile-landscape.png)

## Technology

TypeScript in strict mode, Vite, Phaser 3, HTML5 Canvas, CSS, and npm. ESLint and Prettier handle code quality; Vitest tests the core systems and Playwright exercises the browser experience. The first version runs entirely in the browser and stores progress in `localStorage`.

The target browsers are current Chrome, Safari, Edge, and Firefox. Production targets 60 FPS with a maximum of 10 active customers; actual performance depends on the device and browser.

## Local development

Use **Node.js 22.17.1 or newer in the Node 22 release line** for the same runtime used during development. Vite requires Node 20.19+ in the Node 20 line, or Node 22.12+; CI uses Node 22.

### Installation

```sh
git clone https://github.com/barezbaban/mini-market-game.git
cd mini-market-game
npm install
```

For a reproducible install from the committed lockfile, use `npm ci`.

### Development

```sh
npm run dev
```

Open the local URL printed by Vite, including `/mini-market-game/`. To play from a phone on the same trusted network, run `npm run dev -- --host 0.0.0.0` and open the computer's network address with the same port and path.

### Testing and quality checks

```sh
npm run lint
npm test
npm run build
```

`npm run test:watch` starts interactive unit testing. `npm run format` formats the project; `npm run format:check` checks formatting without changing files.

For browser tests, run `npm run build` and then `npm run preview`. Leave the preview running and, in a second terminal, run:

```sh
npm run test:e2e
```

The browser suite uses an installed Google Chrome by default and expects the production preview at `http://127.0.0.1:4173/mini-market-game/`. It does not start or rebuild the preview itself. [Browser testing instructions](docs/development.md#browser-tests) cover installing Playwright browsers, selecting Firefox or WebKit, and configuring a different browser channel or preview URL.

### Production build

```sh
npm run build
npm run preview
```

Vite emits the static site into `dist/`. Preview uses the same repository base path as production. See [development notes](docs/development.md) for debugging and a manual gameplay checklist.

## Deployment

The repository is configured for **GitHub Pages** at:

[https://barezbaban.github.io/mini-market-game/](https://barezbaban.github.io/mini-market-game/)

In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. Every push to `main` then installs dependencies, runs lint and tests, builds the site, and publishes `dist/` using the official GitHub Pages actions. The workflow can also be started from the Actions tab. Pull requests run the build checks without publishing.

Vite's `base` is `/mini-market-game/`. If you rename the repository or use a custom domain, update `vite.config.ts` and the links in this README to match. The workflow does not require a manually maintained deployment branch or copying built files.

## Project structure

```text
.github/workflows/deploy.yml   # CI and Pages publication
public/                       # Static files copied into the build
assets/                       # Original artwork and replacement guidelines
src/
  main.ts                     # Application startup
  game/
    data/                     # Product, upgrade, and game configuration
    entities/                 # Reusable character visuals
    managers/                 # Audio and other shared presentation services
    rendering/                # Original procedural art and world visuals
    scenes/                   # Phaser lifecycle and rendering orchestration
    systems/                  # Inventory, economy, farming, checkout, saves
    ui/                       # HUD, feedback, and touch input
    types.ts                  # Shared contracts
styles/                       # Responsive layout and interface styling
tests/                        # Core gameplay system tests
e2e/                          # Browser gameplay, persistence, layout, and touch tests
docs/                         # Architecture, development, and screenshots
```

Game rules live outside rendering. A storage interface separates game state from browser persistence, leaving a clear place for an API or cloud save implementation later. See [architecture and extension guidelines](docs/architecture.md).

## Configuration and original assets

- Change the working title and global timings in `src/game/data/gameConfig.ts`.
- Tune product names, growth times, prices, and shelf locations in `src/game/data/products.ts`.
- Tune upgrade descriptions, costs, and positions in `src/game/data/upgrades.ts`.
- Keep new content in these definitions and reuse the shared systems. The [extension guide](docs/architecture.md) explains how to add products, workers, and persistent storage.

The game artwork is made from original code-drawn shapes and project-authored SVGs. Audio uses original procedural sounds, so no external sound pack is needed. The interface uses optional Google Fonts with system-font fallbacks. Third-party fonts and libraries retain their respective licenses. See [asset credits](docs/credits.md).

## Roadmap

### Phase 2 — A busier neighborhood market

More products and shelves; farmers and shelf stockers; a storage room; multiple checkout counters; richer customer patience; daily objectives and achievements.

### Phase 3 — A growing business

Multiple supermarket locations; player levels; cosmetic customization; store analytics; opt-in accounts and cloud saves; leaderboards.

### Phase 4 — More ways to play

An installable PWA; Android and iOS packaging; a backend where needed; optional social or multiplayer features.

These are future possibilities, not features required to run the current game.

## License

Project code and original assets are available under the [MIT License](LICENSE).
