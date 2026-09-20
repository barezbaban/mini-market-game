# Architecture and extension guide

The game separates three responsibilities: configuration describes the content, gameplay systems own the rules, and Phaser scenes display the resulting state. This keeps economy and progression testable without starting a canvas.

## Configuration and state

`src/game/data/gameConfig.ts` contains the title, world dimensions, movement speeds, interaction radii, production limits, checkout timing, save cadence, and layout anchors. Product-specific values belong in `products.ts`; upgrade-specific values belong in `upgrades.ts`.

`src/game/types.ts` defines the shared product, inventory, customer, upgrade, and save contracts. `GameState` contains durable progression as well as the live state consumed by the renderer. Avoid duplicating these values in UI components.

All gameplay timings are in milliseconds; world positions are canvas coordinates. Product prices and balances use whole-number game currency.

## Core systems

- Inventory owns capacity checks and item transfers.
- Economy owns crediting sales, affordability, and spending.
- Farming advances production and limits uncollected output.
- Customers choose products, navigate, and move through explicit shopping states.
- Checkout resolves a customer's basket and credits the economy once payment completes.
- Upgrades validate prerequisites and cost before applying an effect.
- Saves serialize validated progression through a storage interface.

The player and cashier both operate the same checkout rules. A customer's transition through the queue, payment, and departure must remain owned by the simulation; rendering should never credit money or remove stock.

## Customer lifecycle

Customers enter the shop, move to a product shelf, wait when appropriate, collect available stock, move to checkout, queue, pay, and leave. Queue positions are derived from order in the line, with configured spacing. Customers cannot buy from an empty shelf, and only the customer at the front may pay.

Keep the active-customer cap in configuration. A larger map or extra counters should introduce explicit destinations and queues rather than random movement.

## Adding a product

1. Add its identifier to `ProductId` and its definition to `PRODUCTS` in `products.ts`. Set its display names, production time, selling price, shelf capacity, unlock cost, sprite key, color, and farm/shelf positions.
2. Extend the zero-count item factory and initial farm state for the new identifier. These typed records make missing initialization visible during compilation.
3. Supply an original icon or texture under the configured sprite key. Keep the production, inventory, shelf, and checkout code generic.
4. Decide whether it is available initially or unlocked by an upgrade, and add the matching content definition.
5. Extend save validation and migration when the persisted schema changes. Test production, stocking, purchasing, and loading an older save.

The content definition is the main extension point; adding a product should not require a separate farming, inventory, or economy system. The explicit TypeScript identifiers and initial records still need to be kept in sync.

## Adding an upgrade or worker

Create upgrade content in `upgrades.ts`, including its cost, maximum level, display text, and world position. Add its identifier to the type contract and implement the effect in the upgrade system. Keep purchasing atomic: validate availability and affordability, spend once, apply the effect once, and save the new progression.

The cashier is the first worker. Additional worker types should consume the same simulation operations used by the player: a stocker transfers inventory, a farmer harvests production, and another cashier processes a separate queue. Give each worker a small state machine instead of placing worker logic inside the main scene.

## Persistence and a future API

The `SaveRepository` contract exposes `read`, `write`, and `clear`; the first implementation uses `localStorage`. Keep browser storage access inside that adapter. The save system accepts its supported schema version, clamps invalid individual values, and rebuilds capacities and unlocks from purchased upgrades. Malformed or unsupported saves fall back to a fresh game instead of crashing. Save versioning and validation belong in this system so stored data cannot directly bypass capacity or unlock rules.

A network save service will need an asynchronous adapter, authentication, conflict handling, and a retry strategy. Keep those concerns behind a persistence boundary. An API should exchange a versioned save document and validate progression server-side if shared rankings or multiplayer make the data authoritative.

Local saves belong to the browser profile and site origin. Development and GitHub Pages have separate saves. Clearing site data removes progress; a local save is not a cloud backup.

## Presentation and assets

Scenes should coordinate bootstrapping, input, rendering, and the HUD. Reuse game objects and update their state instead of rebuilding the world every frame. Procedural art and texture keys make the first version self-contained; a future sprite sheet can replace a texture without changing sales or farming rules.

Use Vite's configured base URL for new static assets. Root-relative paths such as `/sprites/tomato.png` bypass `/mini-market-game/` and break project Pages deployments.

The title is centralized in `GAME_CONFIG.title`. When rebranding, also update the document title and metadata, package description, README, and favicon. Preserve the existing save key if progress should survive the rename.
