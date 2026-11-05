import { expect, test } from '@playwright/test';
for (const legacy of [true, false]) {
  test(
    legacy
      ? 'market remains playable without the GLB'
      : 'Blender art shares geometry and batches upgraded shelf stock',
    async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      if (legacy) await page.route('**/models/market.glb', (route) => route.abort());
      await page.goto('./?debug=true&lang=ckb');
      await page.waitForFunction(() => window.__MARKET__?.ready);
      const result = await page.evaluate(() => {
        const { engine, world } = window.__MARKET__;
        const s = engine.state;
        s.upgrades.shelf = 3;
        s.shelfCapacities.tomato = 24;
        s.shelves.tomato = 21;
        world.update(s, 16, 16);
        const shelf = world.scene.getObjectByName('shelf-tomato')!;
        const stock = shelf.getObjectByName('blender:stock:tomato') as
          import('three').InstancedMesh | undefined;
        const before = stock?.count;
        s.shelves.tomato = 2;
        world.update(s, 32, 16);
        const loose = world.scene.getObjectByName('blender:tomato') as
          import('three').Mesh | undefined;
        return {
          before,
          after: stock?.count,
          shared: !!stock && loose?.geometry === stock.geometry,
          rows: shelf.children.filter((n) => n.visible && n.name.startsWith('shelf-tomato:row-'))
            .length,
          till: !!world.scene.getObjectByName('blender:till'),
        };
      });
      expect(result.rows).toBe(6);
      expect(result.till).toBe(!legacy);
      if (!legacy) expect(result).toMatchObject({ before: 21, after: 2, shared: true });
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await page.locator('#manage-button').click();
      await expect(page.locator('#management-dialog')).toBeVisible();
    },
  );
}
