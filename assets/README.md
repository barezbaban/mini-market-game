# Original game artwork

All illustrations in this repository are original procedural artwork authored for Mini Market Manager. No external artwork, sprite packs, or game assets are loaded. The HTML interface optionally loads DM Sans and Outfit through Google Fonts, with local fallbacks; see [credits](../docs/credits.md).

`src/game/rendering/ArtFactory.ts` paints the produce, crops, chickens, foliage, upgrade icons, and character parts into reusable Phaser textures at startup. `WorldRenderer.ts` draws the market, garden, and interface details. `src/game/entities/CharacterVisual.ts` assembles and animates reusable characters.

To replace a texture with a future image asset, load an original PNG or SVG using the corresponding texture key from `ART`; the factory preserves textures that are already loaded. The simulation has no dependency on the artwork.

Artwork is included under the repository's MIT license.
