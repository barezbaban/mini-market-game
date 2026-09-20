# Original 3D game artwork

The world models, characters, produce, interface icons, and procedural label textures are original artwork authored for Mini Market Manager. No external model pack, sprite pack, or game artwork is loaded. The HTML interface optionally loads DM Sans and Outfit through Google Fonts, with local fallbacks; see [credits](../docs/credits.md).

`src/game/rendering/Models.ts` builds rounded character models, produce, hens, and trees from reusable Three.js geometry and materials. `src/game/rendering/world/` contains the world-building helpers; `WorldRenderer.ts` composes the scene and presents simulation state. The HTML interface uses project-authored SVG icons in `src/game/ui/icons.ts`.

To introduce future original model assets, replace or extend the corresponding model factory while preserving its positioning, animation, inventory, and color contracts. Keep reusable geometry and material ownership explicit. Use Vite's base URL when loading files so the GitHub Pages repository path works. The simulation and versioned saves have no dependency on the mesh implementation.

Artwork is included under the repository's MIT license.
