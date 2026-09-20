# Architecture and extension guide

The game separates three responsibilities: configuration describes the content, pure TypeScript gameplay systems own the rules, and a Three.js renderer displays the resulting state. `GameRuntime` coordinates the frame loop, input, presentation events, HUD, audio, and saving. Economy and progression can be tested without creating a WebGL context.

## Configuration and state

`src/game/data/gameConfig.ts` contains the title, world dimensions, movement speeds, interaction radii, production limits, checkout timing, save cadence, and layout anchors. Product-specific values belong in `products.ts`; upgrade-specific values belong in `upgrades.ts`.

`src/game/types.ts` defines the shared product, inventory, customer, upgrade, and save contracts. `GameState` contains durable progression as well as the live state consumed by the renderer. Avoid duplicating these values in UI components.

All gameplay timings are in milliseconds. Simulation positions use the configured two-dimensional map coordinates; the renderer converts them to the ground plane of the 3D world. Camera projection and screen-relative input conversion belong to the renderer. Product prices and balances use whole-number game currency.

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
3. Extend the original produce model factory and HTML product icon for the new identifier. Keep the production, inventory, shelf, and checkout code generic.
4. Decide whether it is available initially or unlocked by an upgrade, and add the matching content definition.
5. Extend save validation and migration when the persisted schema changes. Test production, stocking, purchasing, and loading an older save.

The content definition is the main extension point; adding a product should not require a separate farming, inventory, or economy system. The explicit TypeScript identifiers and initial records still need to be kept in sync.

## Adding an upgrade or worker

Create upgrade content in `upgrades.ts`, including its cost, maximum level, display text, and world position. Add its identifier to the type contract and implement the effect in the upgrade system. Keep purchasing atomic: validate availability and affordability, spend once, apply the effect once, and save the new progression.

The cashier is the first worker. Additional worker types should consume the same simulation operations used by the player: a stocker transfers inventory, a farmer harvests production, and another cashier processes a separate queue. Give each worker a small state machine inside the simulation.

## Persistence and a future API

The `SaveRepository` contract exposes `read`, `write`, and `clear`; the first implementation uses `localStorage`. Keep browser storage access inside that adapter. The save system accepts its supported schema version, clamps invalid individual values, and rebuilds capacities and unlocks from purchased upgrades. Malformed or unsupported saves fall back to a fresh game instead of crashing. Save versioning and validation belong in this system so stored data cannot directly bypass capacity or unlock rules.

A network save service will need an asynchronous adapter, authentication, conflict handling, and a retry strategy. Keep those concerns behind a persistence boundary. An API should exchange a versioned save document and validate progression server-side if shared rankings or multiplayer make the data authoritative.

Local saves belong to the browser profile and site origin. Development and GitHub Pages have separate saves. Clearing site data removes progress; a local save is not a cloud backup.

## Presentation and assets

`src/game/GameRuntime.ts` advances the engine, consumes its events, schedules saves, and presents the state through `WorldRenderer`. It normalizes keyboard and pointer input, observes viewport changes, pauses gameplay when requested, and clears input when focus is lost. Rendering can continue during pause so the scene responds to resizing. A lost WebGL context pauses updates and triggers a save attempt.

`src/game/rendering/WorldRenderer.ts` owns the Three.js scene, camera, WebGL renderer, and state-to-visual updates. `Models.ts` creates original characters, produce, foliage, and hens from meshes. Shared geometry and materials reduce allocations. World construction helpers live in `rendering/world/`; canvas textures are used for labels, while scenery and characters are volumetric meshes. Character animation, camera easing, shadows, and presentation effects never change progression.

The HTML HUD floats above the full-screen renderer. It updates currency, carried products, sound state, and contextual guidance. `FloatingText` pools short-lived DOM labels and projects each event's world position through the active camera. `MobileControls` supplies a movement vector for both the fixed joystick and dragging the game surface.

Reuse visual objects and cached resources across frames. Replace procedural mesh factories with original model assets later without changing sales, production, or saves. Dispose renderer resources when the runtime is torn down, and keep ownership of shared geometry and materials explicit.

Use Vite's configured base URL for new static assets. Root-relative paths such as `/models/tomato.glb` bypass `/mini-market-game/` and break project Pages deployments.

The title is centralized in `GAME_CONFIG.title`. When rebranding, also update the document title and metadata, package description, README, and favicon. Preserve the existing save key if progress should survive the rename.
