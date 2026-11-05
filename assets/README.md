# Original 3D game artwork

The world models, characters, produce, interface icons, and procedural label textures are original artwork authored for Mini Market Manager. No external model pack, sprite pack, or game artwork is loaded. The HTML interface optionally loads DM Sans and Outfit through Google Fonts, with local fallbacks; see [credits](../docs/credits.md).

Open [market.blend](blender/market.blend) in Blender 4.5 to inspect or edit the 42-piece vertex-painted library. Each object has a stable name; its position in the gallery is for editing only. Keep its local origin, dimensions, and paint layer when exporting replacements. The web build loads [market.glb](../public/models/market.glb), **not** the .blend project. Finished props each use one mesh, and shelf items share instanced geometry. The customer cart-pushing animation is a separate Blender export.

The runtime uses the library for products, crops, animals, scenery, carts, drive-through vehicles, machines, counters, and furniture. Characters keep their animated joints and interchangeable clothing; walls, adjustable shelves, and the rest of the building use modular Blender pieces. Three.js still owns placement, character motion, stock, and progression; UI icons, localized signs, and interaction/progress overlays deliberately aren't baked into models. If the library fails to load, the built-in geometry remains playable.

To regenerate both assets from the original authoring recipe in a fresh Blender process (this overwrites the two output files):

```sh
blender -b -noaudio --python-exit-code 1 -P scripts/author-market.py -- public/models/market.glb assets/blender/market.blend
```

After hand-editing the .blend, export it directly as GLB with active vertex colours instead of regenerating it from the recipe. Render comparisons can be repeated against a local production preview with `node scripts/profile-market.mjs`; set `MARKET_ART=legacy` for the matching fallback scenes. These fixed-scene samples measure render workload, not device temperature or memory over a long play session.

To introduce future original model assets, replace or extend the corresponding model factory while preserving its positioning, animation, inventory, and color contracts. Keep reusable geometry and material ownership explicit. Use Vite's base URL when loading files so the GitHub Pages repository path works. The simulation and versioned saves have no dependency on the mesh implementation.

Artwork is included under the repository's MIT license.

The shared pickup/stocking motion is in [reach.blend](blender/reach.blend). The game samples the shoulder track from `public/animations/reach.glb` on successful item transfers only. A helper uses their own pose; waiting, moving past a shelf, or attempting to stock a full shelf does not trigger it. Regenerate with `blender -b -noaudio --python-exit-code 1 -P scripts/author-reach.py -- public/animations/reach.glb assets/blender/reach.blend`.
