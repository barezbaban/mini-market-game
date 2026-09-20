# Original assets and credits

Mini Market Manager's map, 3D character and produce models, interface, procedural label textures, favicon, and audio are original work created for this repository. The game takes inspiration from the broad farm-and-market management genre; it does not use assets from another game.

The world artwork is constructed with procedural Three.js meshes. Project-authored SVGs provide interface icons, and canvas textures provide world labels. Sound feedback is generated procedurally in the browser. No external model download, paid art pack, or third-party sound recording is required to play.

The interface requests two optional typefaces through Google Fonts: **DM Sans**, by the DM Sans Project Authors, and **Outfit**, by the Outfit Project Authors. Both use the SIL Open Font License 1.1; see the upstream [DM Sans license](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt) and [Outfit license](https://github.com/google/fonts/blob/main/ofl/outfit/OFL.txt). The game falls back to installed system fonts if those requests are unavailable. These fonts are third-party typography, not project-authored artwork.

Project-authored code and assets are distributed under the repository's MIT license. Dependencies such as Three.js, Vite, TypeScript, Vitest, ESLint, and Prettier are separate projects with their own licenses and copyright notices. Their inclusion does not transfer ownership of those projects to this repository.

When adding an external asset in the future, record its author, source URL, license, and any required attribution here. When replacing procedural artwork, preserve the model factory contracts and product identifiers so gameplay systems remain independent of the art files.
