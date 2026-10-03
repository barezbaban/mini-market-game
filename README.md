# Mini Market Manager

A small farm, a friendly market, and room to grow. Mini Market Manager is an original 3D browser management game: harvest fresh produce, fill your shelves, serve customers, and turn your first sales into a thriving little business.

[Play on GitHub Pages](https://barezbaban.github.io/mini-market-game/) · [Architecture](docs/architecture.md) · [Development and deployment](docs/development.md)

## Gameplay

Start with **$0**, a basket that holds **8 items**, a tomato patch, and a chicken area. Walk near ripe produce to collect it, carry it to the matching shelf, and wait at checkout to serve customers. Payments stack beside the register: approach the gold cash circle to bank them, then step away before collecting the next batch.

Grow → harvest → process → carry → stock → serve → earn → upgrade.

The market occupies the top of the map; the farms and processing areas sit below it. Customers arrive from outside, take a shopping cart, walk through the labeled sliding entrance, find available products, form a checkout line, pay, return the cart, and continue off-screen before leaving the simulation. Products collected by each shopper appear inside that shopper's cart. The store starts with **3 carts**; each Shopping carts purchase adds one, initially up to **10**. Player levels **20, 22, 24, 26, and 28** unlock carts 11–15. Shoppers need a free cart to enter. Open **Manage** to inspect and purchase every upgrade. Keeping progression in this dedicated screen leaves the market floor clear and easy to read. Pause and Manage only pause player controls: customers, staff, production, patience, theft, and rush-hour timers keep running. Manage shows a live rush countdown and enables the next challenge as soon as its cooldown finishes.

| Product       | Production                              | Sale price | Availability                            |
| ------------- | --------------------------------------- | ---------- | --------------------------------------- |
| Tomatoes      | 3 per plant / 3 seconds                 | $5         | Available at the start                  |
| Eggs          | 1 per nest / 4 seconds                  | $7         | Available at the start                  |
| Corn          | 2 per plot / 5 seconds                  | $10        | Unlock for $150                         |
| Tomato paste  | 1 tomato → 1 can; 6-second batch        | $15        | Production department and cannery       |
| Coffee beans  | 2 per plant / 4 seconds                 | $12        | Coffee corner                           |
| Ground coffee | 1 bean → 1 bag; 8-second batch          | $24        | Coffee corner and grinder               |
| Carrots       | 1 per bed / 2 seconds                   | $8         | Carrot garden                           |
| Milk          | 2 per cow / 5 seconds                   | $14        | Dairy meadow                            |
| Cheese        | 1 milk → 1 cheese; 7-second batch       | $29        | Dairy meadow and kitchen                |
| Grilled corn  | 1 corn → 1 grilled corn; 6-second batch | $23        | Carrot garden, corn farm and $360 grill |

All shelves start with **3 rows × 4 spaces = 12 items**. At player levels **3, 10, and 20**, buy an extra visible row for every shelf, including future shelves: **16 → 20 → 24 items**. Existing stock is preserved. Add up to five tomato plants, nests, corn plots, coffee plants, and cows; the carrot garden supports eight beds. Every plot has its own production timer. Machines process **up to** 2, 4, 6, or 8 ingredients per batch as they are upgraded, and start a smaller batch when less input is available. Stand near a machine while carrying its raw ingredient to supply it, then collect the finished products when your basket has room.

Fit out the compact store in four stages: **production department ($250)**, **coffee corner ($500)**, **carrot garden ($1,000)**, and **dairy meadow ($2,000)**. The management cards show current capacity, the next effect, the exact next price, and any prerequisite. Most repeated upgrades grow more expensive; the carrot-bed price increases by 20% each time. Departments stay within one compact footprint: two shelf rows, two indoor checkout stations, a wide front entrance, a service-side opening, and a three-column farmyard.

Hire up to **three helpers** to harvest, operate machines, and stock shelves. Their baskets grow **2 → 3 → 4 → 5 → 6** items; ten speed levels multiply walking speed by **1.10** at each upgrade. The cashier starts with five purchasable tiers and marketing with ten. Player levels **20, 25, and 30** unlock three additional tiers for the cashier, marketing director, and player basket (up to 40 carried items). Each cashier tier after hiring divides checkout time by 1.25; each marketing tier adds 20% of the base arrival rate. Every paid store or drive-through order earns **5 customer XP + 2 XP per item sold** (7 XP for one item, 9 XP for two). Picking up goods and unpaid orders do not earn sales XP. The accountant still earns **5 XP per tier every 10 seconds**. Manage shows the next unlock, XP remaining, and a complete level roadmap. Unlocks are permission to buy with game money, not automatic purchases; existing saves keep owned upgrades and XP.

The **drive-through service** is available to purchase from the beginning. Cars and bikes queue in a separate lane below the office and farms. Only the vehicle at the pickup window displays its two-to-four-item order, with delivered/requested quantities; waiting vehicles stay unobstructed. Carry each requested product to the drive window one at a time, then remain there to process payment. Collect the money from its separate cash pile. The counter shows OPEN, ARRIVING, LOAD or PAYMENT as appropriate. The drive-through runner and drive-through cashier are separate hires: the runner takes requested stock from shelves, while the cashier handles only completed payments. Paid vehicles continue forward out of the lane instead of reversing through the queue.

Every register has **unlimited cash storage** and keeps selling while money waits for collection. Each display stays at two short layers of bills, even with a large balance; compact world signs show amounts such as $25K or $1.2M, while the HUD and save retain the exact money. Helpers and cashiers never bank money for you; camping at a cash pile does not collect new payments. At **player level 20**, buy a **second staffed checkout** for **$1,500** after hiring the first cashier. Both draw from the same queue and share speed upgrades, but keep separate cash piles. Existing saves with full registers reopen without losing stored cash. The thief remains the risk of leaving money unattended.

Cash left unattended for **three minutes** attracts a thief when you are away. They walk into the store, spend **six seconds** attempting theft, then flee with the pile. Hold **Shift** or the **Sprint** button while moving (four seconds of stamina, six seconds to refill). Get the thief inside your visible **net circle** to catch them and recover stolen cash once. A hired helper guards the netted thief until police arrive and walk them out; without helpers, the net holds them. Escaped cash is lost. Cash piles, collection readiness, and encounters survive reloads; menu screens keep theft timers running; hidden tabs and closed games do not advance them.

## Features

- Original low-poly 3D world, rounded characters, produce models, and shop branding.
- Full-screen game presentation with clear lighting, no world shadows, and a compact HUD.
- Automatic harvesting, stocking, and checkout; no interaction button needed.
- Ten products, independently growing farm plots, and four processing machines, including a corn grill with its own shelf.
- Four equipment-speed upgrades multiply processor speed by 1.20 each; later tiers require player levels 5, 10 and 20. Batch capacity upgrades remain separate.
- Optional **Manage → Start rush hour** challenge: 90 seconds, double store arrivals within the cart limit, and 100 bonus XP for 8 paid store/drive-through orders. Success ends the rush early; either outcome has a 60-second cooldown that also counts down in menus. No cash penalty for missing the goal, and payments still require manual collection.
- Small customer emojis appear only for empty shelves, after 30 seconds queued for payment, or briefly after a completed purchase. Normal shopping has no mood bar; product-and-quantity thought bubbles remain. Two minutes waiting for stock or checkout triggers a walkout via the door and cart return. Walking and payment do not consume patience; unpaid goods are returned, with overflow held safely until shelf space opens. No sales XP for walkouts.
- Customer state machines, visible product-filled shopping carts, an animated entrance, an orderly checkout queue, and a hireable cashier.
- Purchasable car-and-bike drive-through orders with separate runner and cashier automation.
- Four store expansions, level milestones, growing shelf rows, and management tabs for Store, Farms, Machines, and Staff.
- Upgradeable helpers, cashier, marketing director, and accountant; player XP and levels.
- Floating feedback, carried products, stock indicators, and a short first-time tutorial.
- Desktop movement, touch joystick/drag movement with a dead zone, and simultaneous two-thumb Sprint. Touch targets are at least 44 pixels; cancellation and rotation release movement safely. Items transfer automatically in stand areas, without tiny drag targets.
- Original cheerful synthesized music, pickup/stock sounds and register chimes, separate effect/music volume sliders, and an instant master mute. Sound begins after a gesture, continues in menus, suspends in hidden tabs, and uses bounded, cleaned-up audio voices.
- Local saves (including challenge timers, patience, returned stock and sound preferences) and a confirmed reset in Settings. Hiding or closing the tab never advances timers; opening Pause or Manage does not freeze or reset them.
- Modular TypeScript systems, automated tests, and GitHub Pages deployment.

## Controls

| Action               | Desktop                                                | Touch                              |
| -------------------- | ------------------------------------------------------ | ---------------------------------- |
| Move                 | **WASD**, **arrow keys**, or drag the world            | Virtual joystick or drag the world |
| Harvest or stock     | Stand near a farm or matching shelf                    | Same                               |
| Serve checkout       | Stand beside the checkout counter                      | Same                               |
| Serve drive-through  | Bring listed items to its window, then process payment | Same                               |
| Bank register cash   | Approach the gold cash circle; step away between trips | Same                               |
| Sprint / catch thief | Hold Shift while moving; bring thief into net circle   | Hold Sprint while moving           |
| Buy an upgrade       | Open **Manage**                                        | Same                               |
| See all inventory    | Open the **Basket** dropdown                           | Tap **Basket**                     |
| Sound                | Use the speaker button in the toolbar                  | Tap the speaker button             |
| Reset progress       | Open **Settings**                                      | Tap **Settings**                   |

The game fills the browser window. The camera and overlays adapt to desktop, tablet, phone landscape, and phone portrait. Touch movement does not scroll the page; drag an open part of the world to position a temporary joystick, or use the fixed touch joystick.

## Screenshots

![Compact store with two shelf aisles, front glass entrance, indoor checkouts, grouped farms and a separate drive-through lane](docs/screenshots/compact-map.png)

The screenshots are captured from the running application. Scenery, characters, and produce are original 3D meshes created for this project.

The compact-map overview uses an isolated, fully unlocked demonstration fixture and a zoomed-out camera to show the complete layout. Gameplay normally uses the following camera. Older saves relocate once into this layout while retaining money, inventory, upgrades, orders, XP, and cash awaiting collection. The captures below show earlier layouts.

[Mobile landscape screenshot](docs/screenshots/mobile-landscape.png) · [Mobile portrait screenshot](docs/screenshots/mobile-portrait.png)

[Expanded store](docs/screenshots/expanded-store.png) · [Management panel](docs/screenshots/management.png)

[Drive-through order](docs/screenshots/drive-through.png)

The expanded-store, management, and mobile-portrait captures use isolated demonstration fixtures with selected upgrades and currency, so new areas and controls can be shown. These fixtures do not represent progression earned during a play session or modify a player's saved market. The desktop capture advances an isolated gameplay session; mobile landscape shows a fresh market.

## Technology

TypeScript in strict mode, Vite, Three.js, WebGL2, HTML, CSS, and npm. ESLint and Prettier handle code quality; Vitest tests the core systems and Playwright exercises the browser experience. The game runs entirely in the browser and stores progress in `localStorage`.

The target browsers are current Chrome, Safari, Edge, and Firefox with WebGL2 available. Enable browser graphics acceleration if the game reports that 3D graphics are unavailable. Rendering targets 60 FPS with a maximum of 10 active customers; actual performance depends on the device and browser. The renderer and interface can change while the pure TypeScript game engine and versioned saves remain independent.

## Local development

Use **Node.js 22.17.1 or newer in the Node 22 release line** for the same runtime used during development. Vite requires Node 20.19+ in the Node 20 line, or Node 22.12+; CI uses Node 22.

### Installation

```sh
git clone https://github.com/barezbaban/mini-market-game.git
cd mini-market-game
npm install
```

For a reproducible install from the committed lockfile, use `npm ci`.

If installation reports `EACCES` or root-owned files in your npm cache, use a writable cache without changing system permissions:

```sh
npm install --cache /tmp/mini-market-game-npm-cache
```

The same `--cache` option works with `npm ci`. This handles the cache permission issue encountered on the development Mac; `sudo npm install` is unnecessary. See [installation troubleshooting](docs/development.md#npm-cache-permissions) for details.

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
    managers/                 # Audio and other shared presentation services
    rendering/                # Three.js renderer, original models, and world meshes
    systems/                  # Inventory, farms, machines, workers, progression, saves
    ui/                       # HUD, feedback, and touch input
    GameRuntime.ts            # Frame loop, input, lifecycle, and presentation events
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
- Configure processing recipes, batch timings, and buffers in `src/game/data/machines.ts`.
- Keep new content in these definitions and reuse the shared systems. The [extension guide](docs/architecture.md) explains how to add products, workers, and persistent storage.

The world and characters are built from original procedural 3D meshes with shared geometry and materials. SVG icons support the HTML interface; small canvas textures provide readable world labels. Audio uses original procedural sounds, so no external model or sound pack is needed. The interface uses optional Google Fonts with system-font fallbacks. Third-party fonts and libraries retain their respective licenses. See [asset credits](docs/credits.md).

## Roadmap

### Phase 2 — A busier neighborhood market

Additional recipes; a storage room; richer customer patience; daily objectives and achievements.

### Phase 3 — A growing business

Multiple supermarket locations; cosmetic customization; store analytics; opt-in accounts and cloud saves; leaderboards.

### Phase 4 — More ways to play

An installable PWA; Android and iOS packaging; a backend where needed; optional social or multiplayer features.

These are future possibilities, not features required to run the current game.

## License

Project code and original assets are available under the [MIT License](LICENSE).
