# Career and playability update

This update implements a career and playability overhaul. Enjoyment and return visits require real playtesting; no design can guarantee that players will stay. Pushing to `main` publishes the browser game through the existing GitHub Pages workflow; the optional account server is deployed separately.

## Design

The intended session is 10–15 minutes with a visible next goal and a natural stopping point. Progress depends on serving the business, not leaving a tab open. There are no expiring contracts, daily streak penalties, real-money purchases or forced accounts.

| Stage                   | Department gate                                                           | Purpose                                                     |
| ----------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| First stall             | Start                                                                     | Learn harvesting, shelving, payment and manual cash pickup  |
| Neighborhood market     | 10 paid orders or first staff                                             | Hire help; select a contract; improve the actual bottleneck |
| Production business     | Level 3 + 20 orders + $250                                                | Cannery and raw-versus-processed allocation                 |
| Specialty shop          | Coffee: level 6 + 65 orders + $500; garden: level 9 + 140 orders + $1,000 | Varied baskets, coffee, carrots and grill                   |
| Established supermarket | Dairy: level 12 + 260 orders + $2,000                                     | Milk/cheese and a larger operation                          |

Owned upgrades are retained in old saves even if new purchase requirements are higher. The XP curve is unchanged. New harvest plots and additional helpers also have staged level requirements, displayed on their Manage cards.

## Implemented

- Five chapters, nine manually claimed milestone rewards, a next-goal HUD and a world-space direction indicator for the first harvest/delivery/payment loop.
- Goals tab; collapsed locked upgrades; suggestions based on empty shelves, checkout congestion, cart availability and staffing. Tabs reset their scroll position when switched and preserve scroll/focus during live updates.
- Three optional contract types: produce, mixed shopping and delivery. Only paid sales after acceptance count. Progress survives reloads. Rewards are claimed once; cancellation is free. Two and five completed contracts unlock shop-sign themes.
- Three named regulars with favorite products. Every fifth successful favorite-product visit earns 25 XP. Relationship progress is local and saved.
- Customer baskets grow from 2 to at most 6 items with departments. Most shoppers prefer available goods, while some demand an unlocked product that needs stocking. Base staffed checkout takes 4.5 seconds; each tier divides this by 1.25. Manual checkout remains 1 second, rewarding active service before hiring.
- Accountant audits groups of five new paid orders for 2 XP per tier. Idle time and orders before hiring do not grant audit XP.
- Helper priorities: balanced, waiting shoppers, processors or a selected product. Helpers finish deliveries and fall back to useful work. Machine policies reserve fresh shelf stock, prefer processing, or pause new batches. Quick and full-batch strategies are independent of equipment speed.
- Three rush-hour difficulties with readiness gates: 6/12/20 orders for 75/150/250 XP. Duration 90 seconds, cooldown 60 seconds; no money penalty. Active older 8-order/100-XP challenges are preserved on migration.
- Theft warning extended to 12 seconds; theft is 25% of one neglected pile, capped at $250. Menus protect theft encounters. Optional Safe pause freezes the whole simulation; otherwise menus keep the shop and challenge timers running. Hidden tabs do not catch up offline.
- Low-power option: render at up to 30 FPS, DPR capped at 1, unchanged simulation speed. Normal DPR remains capped at 1.5. No shadows. Rapid save-trigger events are coalesced rather than writing every item pickup.
- Phone toolbar reduced to a More button; first-harvest guidance remains visible. Desktop and touch movement remain unchanged.
- Download/import backups with validation and explicit confirmation, rolling local backup and separate pre-import recovery copy. An unreadable original save cannot be silently overwritten by a new autosave.
- Local-only playtest report export: milestones, elapsed play, orders, walkouts, product sales, upgrades and contracts. No telemetry is automatically uploaded.
- Optional account service extended with manual revision-checked cloud backups, owner isolation, conflict responses, idempotent retries and five database history revisions. API hosting is not purchased or activated by the Pages deployment.
- Visual polish: the guide follows each rendered camera frame, nearby sale feedback is separated, cash-pickup signs clear the front wall, and helper focus uses accessible task/product tiles instead of an overlapping dropdown.

## Verification and interpretation

Game tests cover progression gates, migration, conservation of money/items, long-running production, queue separation, contract claims, staff preferences, processor policies, recovery and challenge rules. Browser tests exercise actual controls, portrait/landscape layouts, persistence, menu timing, low-power resolution, touch input and existing rendering regressions. Cloud API tests isolate accounts, stale revisions, retry IDs, input size and Origin checks.

A stocked high-demand five-minute simulation checks that upgraded checkout throughput is at least 30% higher than a basic staffed checkout. This is a controlled bottleneck test, not a claim about normal novice income or real-world retention. Keep production and demand scenarios separate when tuning: unlimited-stock fixtures cannot measure farm balancing.

Local verification on 2026-10-04: 203 game/unit tests passed; 51 production-preview Chrome checks passed; the separate API-configured cloud UI check passed with intercepted test accounts. Five server checks passed, including real PostgreSQL concurrent writes, idempotent migration and history recovery in a disposable local database. Frontend/server TypeScript builds and ESLint passed. Phone checks used emulated viewport/touch input, not physical-device heat measurements. No live account data was used and no production deployment was performed.

## Playtesting and separate service activation

1. Play a fresh game on a real phone for 15 minutes without developer currency. Record time to first harvest, first cash pickup, first meaningful purchase and first hire using the local report. Confirm the player understands what to do without assistance.
2. Ask 3–5 new players to repeat this. Observe where they get lost, whether the next upgrade is desirable, and whether tasks feel repetitive. Do not count completion under coaching as successful onboarding.
3. Run a 15-minute device thermal/battery check in normal and low-power modes at equal game state. Browser automation cannot certify temperature, RAM behavior on every phone or battery savings.
4. Play the complete economy over several sessions. Level gates are initial tuning, not validated pacing. Review chapter unlock times, stock shortages, helper work distribution and meaningful choice before increasing grind or adding products.
5. Deploy the isolated API/database only after hosting/domain approval. Test real PostgreSQL migration and rollback/recovery, a two-device conflict and HTTPS cookies on staging. Configure off-server database backups and test restoring them.
6. Public leaderboards require a separate server-validated scoring design. Do not rank uploaded casual saves. Password recovery/email verification, cloud history UI, automatic sync, PWA packaging and additional locations remain separate follow-up projects, not features claimed by this update.
