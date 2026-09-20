# Architecture and extension guide

The game separates three responsibilities: configuration describes the content, pure TypeScript gameplay systems own the rules, and a Three.js renderer displays the resulting state. `GameRuntime` coordinates the frame loop, input, presentation events, HUD, audio, and saving. Economy and progression can be tested without creating a WebGL context.

## Configuration and state

`src/game/data/gameConfig.ts` contains the title, world dimensions, movement speeds, interaction radii, production limits, checkout timing, save cadence, helper defaults, XP cadence, and expansion bounds. Product-specific values belong in `products.ts`; upgrade costs, prerequisites, categories, and level limits belong in `upgrades.ts`. `machines.ts` defines raw inputs, processed outputs, batch timing, and buffer limits.

`src/game/types.ts` defines the shared product, inventory, customer, upgrade, and save contracts. `GameState` contains durable progression as well as the live state consumed by the renderer. Avoid duplicating these values in UI components.

All gameplay timings are in milliseconds. Simulation positions use the configured two-dimensional map coordinates; the renderer converts them to the ground plane of the 3D world. Camera projection and screen-relative input conversion belong to the renderer. Product prices and balances use whole-number game currency.

## Core systems

- Inventory owns capacity checks and item transfers.
- Economy owns crediting sales, affordability, and spending.
- Farming advances each unlocked plot independently and limits uncollected output.
- Machines convert buffered raw ingredients into processed goods using their purchased batch level.
- Workers choose harvest, stocking, supply, and collection jobs using the same inventory rules as the player.
- Customers choose products, navigate, and move through explicit shopping states.
- Checkout resolves a customer's basket and credits the economy once payment completes.
- Upgrades validate prerequisites and cost before applying an effect.
- Progression awards sale XP and the accountant's timed passive XP.
- Drive-through owns vehicle arrival, ordered item handoff, dedicated staff automation, payment, and departure.
- Saves serialize validated progression through a storage interface.

The player and cashier both operate the same checkout rules. A customer's transition through the queue, payment, and departure must remain owned by the simulation; rendering should never credit money or remove stock.

Drive-through orders are a separate queue with explicit arriving, loading, payment, and leaving states. The player transfers one requested basket item per handoff interval. The dedicated runner uses the same shelf-removal rules, and the dedicated cashier can advance only the payment stage. Orders, delivered quantities, progress timers, and service totals are validated when a save is loaded.

## Customer lifecycle

Customers spawn beyond the visible shop, approach the storefront, pass through the animated entrance, move to a product shelf, wait when appropriate, collect available stock, move to checkout, queue, and pay. They then return through the same door and continue to an off-screen exit before their state is removed. Queue positions are derived from order in the line, with configured spacing. Customers cannot buy from an empty shelf, and only the customer at the front may pay.

Queue arrival order remains stable even when shoppers return from distant wings. Younger shoppers yield to earlier ones; when the head is blocked by a crowd, it plans a clear detour and walks it at the normal speed. Routing never resets a customer's basket, teleports them to checkout, or credits a sale. The regression and endurance suites exercise old blocked saves, mixed arrival rates, production gaps, and mid-queue reloads.

Keep the active-customer cap in configuration. A larger map or extra counters should introduce explicit destinations and queues rather than random movement.

## Adding a product

1. Add its identifier to `ProductId` and its definition to `PRODUCTS` in `products.ts`. Set its display names, production time, yield, selling price, shelf capacity, color, farm/shelf positions, area, and unlock or plot upgrade. Mark it as farm-grown or processed.
2. Extend the zero-count item factory and initial farm state for the new identifier. These typed records make missing initialization visible during compilation.
3. Extend the original produce model factory and HTML product icon for the new identifier. Keep the production, inventory, shelf, and checkout code generic.
4. Decide whether it is available initially or unlocked by an area or upgrade. For a processed product, add its recipe and buffers to `machines.ts`.
5. Extend save validation and migration when the persisted schema changes. Test production, stocking, purchasing, and loading an older save.

The content definition is the main extension point; adding a product should not require a separate farming, inventory, or economy system. The explicit TypeScript identifiers and initial records still need to be kept in sync.

## Adding an upgrade or worker

Create upgrade content in `upgrades.ts`, including its base cost, cost-growth multiplier, maximum level, prerequisites, category, display text, and optional world pad. `upgradeCost` and `upgradeAvailable` are shared by the simulation and management UI. Add its identifier to the type contract and implement the effect in the upgrade system. Keep purchasing atomic: validate availability and affordability, spend once, apply the effect once, and save the new progression. The historical shelf upgrade is preserved in saves; every shelf now includes capacity for 12 items, so its card is informational and further purchases are rejected.

`WorkerSystem` operates up to three helpers. Each helper owns a basket, target, route, job, and action timer. Hiring adds a helper while capacity and speed upgrades preserve existing helpers and their inventories. The cashier processes the same checkout queue as the player. Marketing changes the arrival rate, and the accountant contributes timed XP through progression. Additional staff behavior belongs in these simulation systems.

## Persistence and a future API

The `SaveRepository` contract exposes `read`, `write`, and `clear`; the first implementation uses `localStorage`. Keep browser storage access inside that adapter. Version 2 saves include per-plot growth, machine buffers and batches, helper state, XP, and the accountant timer. The save system migrates version 1 progression, clamps invalid individual values, and rebuilds capacities and unlocks from purchased upgrades. Malformed or unsupported saves fall back to a fresh game instead of crashing. Save versioning and validation belong in this system so stored data cannot directly bypass capacity or unlock rules. The existing storage key is retained across the expansion.

A network save service will need an asynchronous adapter, authentication, conflict handling, and a retry strategy. Keep those concerns behind a persistence boundary. An API should exchange a versioned save document and validate progression server-side if shared rankings or multiplayer make the data authoritative.

Local saves belong to the browser profile and site origin. Development and GitHub Pages have separate saves. Clearing site data removes progress; a local save is not a cloud backup.

## Presentation and assets

`src/game/GameRuntime.ts` advances the engine, consumes its events, schedules saves, and presents the state through `WorldRenderer`. It normalizes keyboard and pointer input, observes viewport changes, pauses gameplay when requested, and clears input when focus is lost. Rendering can continue during pause so the scene responds to resizing. A lost WebGL context pauses updates and triggers a save attempt.

`src/game/rendering/WorldRenderer.ts` owns the Three.js scene, camera, WebGL renderer, and state-to-visual updates. `Models.ts` creates original characters, produce, foliage, and hens from meshes. Shared geometry and materials reduce allocations. World construction helpers live in `rendering/world/`; canvas textures are used for labels, while scenery and characters are volumetric meshes. World shadows are disabled. Character animation, camera easing, and presentation effects never change progression.

The HTML HUD floats above the full-screen renderer. It updates currency, XP level progress, a carried-product preview, a complete inventory drawer, sound state, and contextual guidance. The four-tab management dialog uses content definitions for costs and prerequisites, displays concrete current/next effects, and purchases exclusively through `GameEngine.purchaseUpgrade`. Opening it pauses simulation; closing restores the prior pause state and appropriate keyboard focus. Purchases save and refresh the HUD and world immediately while the dialog remains open. `FloatingText` pools short-lived DOM labels and projects each event's world position through the active camera. `MobileControls` supplies a movement vector for both the fixed joystick and dragging the game surface.

Reuse visual objects and cached resources across frames. Replace procedural mesh factories with original model assets later without changing sales, production, or saves. Dispose renderer resources when the runtime is torn down, and keep ownership of shared geometry and materials explicit.

Use Vite's configured base URL for new static assets. Root-relative paths such as `/models/tomato.glb` bypass `/mini-market-game/` and break project Pages deployments.

The title is centralized in `GAME_CONFIG.title`. When rebranding, also update the document title and metadata, package description, README, and favicon. Preserve the existing save key if progress should survive the rename.
