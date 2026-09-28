import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'backups/**',
      'src/game/GameRuntime 2.ts',
      'src/game/rendering/Models 2.ts',
      'src/game/rendering/WorldRenderer 2.ts',
      'src/game/rendering/world/WorldKit 2.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
);
