import Phaser from 'phaser';
import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS } from '../data/products';
import { UPGRADES } from '../data/upgrades';
import { CharacterVisual } from '../entities/CharacterVisual';
import type { CustomerData, GameState, ProductDefinition, UpgradeDefinition } from '../types';
import { ART, createArt } from './ArtFactory';

const COLOR = {
  ink: '#3f5545',
  secondary: '#7f8b70',
  sage: 0xd8e3c5,
  cream: 0xfff9e8,
  green: 0x5f8c70,
  paleGreen: 0xe5edd6,
  coral: 0xe38569,
  ochre: 0xe8b64f,
};

interface ProductVisual {
  shelfItems: Phaser.GameObjects.Image[];
  shelfCount: Phaser.GameObjects.Text;
  shelfLabel: Phaser.GameObjects.Text;
  farmLabel: Phaser.GameObjects.Text;
  farmStatus: Phaser.GameObjects.Text;
  farmProgress: Phaser.GameObjects.Graphics;
  fieldArt: Phaser.GameObjects.Image[];
  lock: Phaser.GameObjects.Container;
  highlight: Phaser.GameObjects.Graphics;
  previousCount: string;
  previousFarm: string;
}

interface UpgradeVisual {
  background: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  price: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Image;
  progress: Phaser.GameObjects.Graphics;
  previousState: string;
}

/** Render-only presentation. All economy and interaction rules live in the simulation. */
export class WorldRenderer {
  private readonly player: CharacterVisual;
  private readonly cashier: CharacterVisual;
  private readonly customers: CharacterVisual[] = [];
  private readonly productVisuals = new Map<string, ProductVisual>();
  private readonly upgradeVisuals = new Map<string, UpgradeVisual>();
  private readonly checkoutStatus: Phaser.GameObjects.Text;
  private readonly checkoutProgress: Phaser.GameObjects.Graphics;
  private readonly checkoutHighlight: Phaser.GameObjects.Graphics;
  private readonly chickens: Phaser.GameObjects.Image[] = [];
  private lastCheckout = '';

  constructor(private readonly scene: Phaser.Scene) {
    createArt(scene);
    this.drawLandscape();
    this.drawMarket();
    this.drawGarden();
    PRODUCTS.forEach((product) => this.createProduct(product));
    UPGRADES.forEach((upgrade) => this.createUpgrade(upgrade));
    this.drawCheckout();
    this.checkoutStatus = this.text(900, 331, 'OPEN FOR BUSINESS', 10, COLOR.secondary, '700');
    this.checkoutProgress = scene.add.graphics().setDepth(20);
    this.checkoutHighlight = scene.add.graphics().setDepth(9);
    this.player = new CharacterVisual(scene, 'player');
    this.cashier = new CharacterVisual(scene, 'cashier');
    this.cashier.hide();
    for (let index = 0; index < GAME_CONFIG.customerMax; index += 1) {
      const customer = new CharacterVisual(scene, 'customer');
      customer.hide();
      this.customers.push(customer);
    }
  }

  update(state: GameState, time: number, delta: number): void {
    // Phaser supplies elapsed milliseconds; animation remains independent of game speed.
    void delta;
    this.player.updatePlayer(state.player.x, state.player.y, state.inventory, time);
    this.cashier.container.setVisible(state.cashier);
    if (state.cashier) this.cashier.setPosition(950, 225, time, false);
    this.customers.forEach((visual, index) => {
      const customer = state.customers[index];
      if (customer) visual.updateCustomer(customer, time);
      else visual.hide();
    });
    PRODUCTS.forEach((product) => this.updateProduct(product, state, time));
    UPGRADES.forEach((upgrade) => this.updateUpgrade(upgrade, state));
    const paying = state.customers.find((customer) => customer.state === 'PAYING');
    const queue = state.customers.filter(
      (customer) => customer.state === 'QUEUEING' || customer.state === 'PAYING',
    );
    const nextCustomer =
      paying ??
      queue.reduce<CustomerData | undefined>(
        (first, customer) => (!first || customer.id < first.id ? customer : first),
        undefined,
      );
    const amount = nextCustomer
      ? PRODUCTS.reduce(
          (sum, product) => sum + nextCustomer.basket[product.id] * product.sellingPrice,
          0,
        )
      : 0;
    const checkoutText = paying
      ? `CHECKOUT · $${amount}`
      : queue.length
        ? `$${amount} READY · ${queue.length} IN LINE`
        : state.cashier
          ? 'IN GOOD HANDS'
          : 'OPEN FOR BUSINESS';
    if (checkoutText !== this.lastCheckout) {
      this.checkoutStatus
        .setText(checkoutText)
        .setColor(paying || queue.length ? '#598467' : COLOR.secondary);
      this.lastCheckout = checkoutText;
    }
    this.checkoutProgress.clear();
    if (paying) {
      this.checkoutProgress.fillStyle(0xe4e7d3).fillRoundedRect(854, 347, 92, 5, 3);
      this.checkoutProgress
        .fillStyle(COLOR.green)
        .fillRoundedRect(
          854,
          347,
          Math.max(5, 92 * Math.min(1, state.checkoutProgress / GAME_CONFIG.checkoutTime)),
          5,
          3,
        );
    }
    this.checkoutHighlight.clear();
    if (queue.length && !state.cashier) {
      this.checkoutHighlight
        .lineStyle(2, 0x79a083, 0.35 + Math.sin(time / 420) * 0.1)
        .strokeEllipse(GAME_CONFIG.cashierSpot.x, GAME_CONFIG.cashierSpot.y, 57, 31);
    }
    this.chickens.forEach((chicken, index) => {
      chicken.rotation = Math.sin(time / 1200 + index * 2) * 0.06;
    });
  }

  dispose(): void {
    this.player.destroy();
    this.cashier.destroy();
    this.customers.forEach((customer) => customer.destroy());
  }

  private text(
    x: number,
    y: number,
    value: string,
    size: number,
    color = COLOR.ink,
    weight = '600',
  ): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, value, {
        fontFamily: '"Trebuchet MS", Arial, sans-serif',
        fontSize: `${size}px`,
        fontStyle: weight,
        color,
        resolution: 2,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(30);
  }

  private drawLandscape(): void {
    const g = this.scene.add.graphics().setDepth(0);
    g.fillStyle(COLOR.sage).fillRect(0, 0, 1280, 780);
    g.fillStyle(0xc9d9b3).fillEllipse(42, 360, 310, 630).fillEllipse(1234, 412, 278, 830);
    g.fillStyle(0xe0e8cc).fillRoundedRect(124, 473, 884, 249, 50);
    g.fillStyle(0xcbdab7).fillEllipse(617, 746, 1180, 178);
    // A stable pattern keeps scenery pleasant without visual noise or frame-time work.
    let seed = 76;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let index = 0; index < 260; index += 1) {
      const x = random() * 1280;
      const y = random() * 780;
      if (x > 97 && x < 1054 && y > 96 && y < 460) continue;
      g.lineStyle(1.5, 0x94b181, 0.27)
        .lineBetween(x, y, x - 2, y - 4)
        .lineBetween(x + 2, y, x + 3, y - 3);
    }
    // Garden path and little inset paving stones.
    g.fillStyle(0xc4cbb0).fillRoundedRect(112, 410, 920, 60, 24);
    g.fillStyle(0xe9e8d3).fillRoundedRect(110, 403, 922, 57, 22);
    for (let x = 124; x < 1013; x += 56) {
      g.fillStyle(x % 3 ? 0xf5f0dc : 0xfaf4e2).fillRoundedRect(x, 411, 48, 35, 8);
      g.lineStyle(1, 0xdbdcc4).lineBetween(x + 6, 443, x + 37, 443);
    }
    g.fillStyle(0xe3e1c9).fillRoundedRect(1060, 141, 158, 565, 35);
    for (let y = 160; y < 692; y += 22) {
      g.fillStyle(0xf5efda, 0.55).fillRoundedRect(1084 + (y % 3) * 5, y, 103, 16, 6);
    }
    [265, 475, 685].forEach((x) => {
      for (let y = 481; y < 547; y += 24) {
        g.fillStyle(0xefebd1).fillRoundedRect(x - 25 + (y % 2) * 3, y, 49, 16, 7);
      }
    });
    // Trees frame the scene, leaving the playable routes open.
    [
      { x: 46, y: 205, scale: 0.9 },
      { x: 55, y: 397, scale: 0.72 },
      { x: 1218, y: 119, scale: 0.84 },
      { x: 1029, y: 757, scale: 0.78 },
      { x: 83, y: 727, scale: 0.87 },
    ].forEach(({ x, y, scale }) =>
      this.scene.add
        .image(x, y, ART.tree)
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setDepth(y + 90),
    );
    [
      [84, 462],
      [88, 485],
      [107, 477],
      [1018, 514],
      [1006, 535],
      [1019, 700],
      [1240, 384],
      [1229, 411],
    ].forEach(([x, y], index) => {
      this.scene.add
        .image(x, y, ART.flower)
        .setScale(0.55 + (index % 3) * 0.1)
        .setDepth(y);
    });
    this.text(1138, 153, 'LITTLE UPGRADES', 10, '#748264', '700').setLetterSpacing(1.5);
    this.drawBicycle(958, 695);
    // A small welcome mat and chalkboard by the open market entrance.
    g.fillStyle(0xb2bd9b).fillRoundedRect(954, 377, 63, 24, 8);
    g.lineStyle(1, 0xd6e0bf).lineBetween(963, 385, 1008, 385).lineBetween(963, 390, 1008, 390);
    const sign = this.scene.add.graphics().setDepth(461);
    sign.lineStyle(4, 0xaa865a).lineBetween(990, 370, 983, 405).lineBetween(1007, 369, 1018, 405);
    sign.fillStyle(0xba976b).fillRoundedRect(980, 349, 33, 42, 4);
    sign.fillStyle(0x637e66).fillRoundedRect(984, 353, 25, 33, 2);
    this.text(997, 365, 'hello', 8, '#fff5d5', '700').setDepth(462).setAngle(-5);
    this.text(997, 378, '♡', 12, '#e9c184').setDepth(462);
  }

  private drawMarket(): void {
    const g = this.scene.add.graphics().setDepth(1);
    // Raised foundation and softly tiled shop floor.
    g.fillStyle(0x879d77, 0.2).fillRoundedRect(101, 121, 940, 284, 25);
    g.fillStyle(0xb7baa0).fillRoundedRect(99, 127, 932, 275, 20);
    g.fillStyle(0xfaf3dd).fillRoundedRect(99, 116, 932, 277, 20);
    g.fillStyle(0xefe6cc).fillRoundedRect(107, 135, 916, 44, 10);
    g.lineStyle(1, 0xe9e3ce, 0.9);
    for (let x = 121; x < 1013; x += 55) g.lineBetween(x, 178, x, 380);
    for (let y = 182; y < 390; y += 46) g.lineBetween(112, y, 1017, y);
    g.fillStyle(0xfff9e7).fillRoundedRect(99, 374, 932, 18, 8);
    g.fillStyle(0xe6dcc1)
      .fillRoundedRect(95, 167, 15, 214, 6)
      .fillRoundedRect(1019, 167, 15, 214, 6);
    g.fillStyle(0xfef8e7)
      .fillRoundedRect(97, 164, 10, 213, 4)
      .fillRoundedRect(1020, 164, 10, 213, 4);
    const awning = this.scene.add.graphics().setDepth(170);
    awning.fillStyle(0x947962, 0.13).fillRoundedRect(101, 101, 931, 85, 10);
    awning.fillStyle(0xb36a52).fillRoundedRect(96, 90, 939, 69, 11);
    awning.fillStyle(0xf1c891).fillRoundedRect(96, 87, 939, 55, 11);
    for (let index = 0; index < 22; index += 1) {
      const x = 98 + index * 42.5;
      awning.fillStyle(index % 2 === 0 ? 0xe18e70 : 0xffe6b5).fillRect(x, 96, 42, 43);
      awning.fillRoundedRect(x, 131, 42, 29, { tl: 0, tr: 0, bl: 11, br: 11 });
      awning.fillStyle(0xffffff, 0.08).fillRect(x + 2, 97, 12, 35);
    }
    awning.fillStyle(0xc1785c).fillRoundedRect(94, 85, 943, 12, 5);
    // Boutique sign anchored to the awning.
    awning.fillStyle(0x896f55, 0.15).fillRoundedRect(432, 95, 270, 59, 15);
    awning.fillStyle(0xfff7df).fillRoundedRect(430, 90, 270, 59, 15);
    awning.lineStyle(1, 0xdfd7b9).strokeRoundedRect(436, 96, 258, 47, 11);
    this.text(565, 113, 'MINI MARKET', 24, '#52745c', '800').setLetterSpacing(2).setDepth(171);
    this.text(565, 135, 'FRESH FROM OUR LITTLE FARM', 7, '#9c9877', '700')
      .setLetterSpacing(1.6)
      .setDepth(171);
    this.drawPlanter(128, 190);
    this.drawPlanter(1000, 190);
    this.text(563, 364, 'a little care goes a long way', 11, '#a5a58a', '400');
  }

  private drawGarden(): void {
    this.text(199, 496, 'THE KITCHEN GARDEN', 11, '#768966', '700')
      .setOrigin(0, 0.5)
      .setLetterSpacing(1.5);
    const g = this.scene.add.graphics().setDepth(2);
    // Field borders and gently furrowed soil.
    [265, 475, 685].forEach((x, index) => {
      g.fillStyle(0x708d56, 0.14).fillRoundedRect(x - 80, 556, 160, 94, 18);
      g.fillStyle(index === 1 ? 0xb8a37c : 0xac8b63).fillRoundedRect(x - 80, 546, 160, 95, 16);
      g.fillStyle(index === 1 ? 0xe2d1a2 : 0xc3a17a).fillRoundedRect(x - 75, 549, 150, 84, 12);
      g.fillStyle(index === 1 ? 0xeadbb6 : 0xb58e65);
      for (let row = 0; row < 3; row += 1) g.fillRoundedRect(x - 65, 560 + row * 23, 130, 12, 5);
      g.fillStyle(0xe3c995).fillRoundedRect(x - 84, 625, 168, 10, 4);
      g.fillStyle(0xf0dba9).fillRoundedRect(x - 83, 622, 166, 6, 3);
      g.fillStyle(0x9c815a)
        .fillCircle(x - 73, 628, 2)
        .fillCircle(x + 73, 628, 2);
    });
    // Chicken house, straw, and a tiny picket fence.
    g.fillStyle(0xb68a5f).fillRoundedRect(423, 537, 52, 41, 5);
    g.fillStyle(0xf5dfb2).fillRoundedRect(428, 539, 42, 33, 2);
    g.fillStyle(0x8f7b51).fillRoundedRect(443, 548, 17, 25, { tl: 8, tr: 8, bl: 0, br: 0 });
    g.fillStyle(0xc38462).fillTriangle(417, 542, 450, 518, 480, 542);
    g.fillStyle(0xdda07b).fillTriangle(421, 539, 450, 519, 450, 539);
    g.lineStyle(3, 0xf7e6bc)
      .lineBetween(410, 573, 410, 603)
      .lineBetween(532, 573, 532, 607)
      .lineBetween(407, 581, 427, 581)
      .lineBetween(516, 581, 536, 581);
    [
      [460, 609],
      [505, 588],
    ].forEach(([x, y], index) => {
      const chicken = this.scene.add
        .image(x, y, ART.chicken)
        .setScale(index ? 0.64 : 0.8)
        .setDepth(y + 100);
      if (index) chicken.setFlipX(true);
      this.chickens.push(chicken);
    });
    // Friendly garden shed fills the non-interactive corner.
    this.drawGardenCorner();
  }

  private createProduct(product: ProductDefinition): void {
    const { x, y } = product.shelf;
    const shelf = this.scene.add.graphics().setDepth(y + 60);
    shelf.fillStyle(0x6d7150, 0.13).fillEllipse(x, y + 37, 162, 31);
    shelf.fillStyle(0xa9855c).fillRoundedRect(x - 75, y - 35, 150, 79, 6);
    shelf.fillStyle(0xd9b17b).fillRoundedRect(x - 75, y - 43, 150, 74, 7);
    shelf
      .fillStyle(0xc69c66)
      .fillRoundedRect(x - 65, y - 35, 130, 26, 4)
      .fillRoundedRect(x - 65, y + 1, 130, 23, 4);
    shelf
      .fillStyle(0xf0d19a)
      .fillRoundedRect(x - 79, y - 11, 158, 8, 3)
      .fillRoundedRect(x - 79, y + 25, 158, 9, 3);
    shelf
      .fillStyle(0xf2d39e)
      .fillRect(x - 75, y - 39, 7, 70)
      .fillRect(x + 68, y - 39, 7, 70);
    shelf
      .fillStyle(0xb18b5e)
      .fillRect(x - 66, y + 34, 10, 11)
      .fillRect(x + 57, y + 34, 10, 11);
    shelf.fillStyle(0xfff9e8).fillRoundedRect(x - 17, y + 24, 35, 14, 3);
    this.text(x, y + 31, `$${product.sellingPrice}`, 9, '#8a785b', '700').setDepth(y + 62);
    const shelfItems = Array.from({ length: 12 }, (_, index) => {
      const slot = index % 6;
      const row = Math.floor(index / 6);
      return this.scene.add
        .image(x - 50 + slot * 20, y - 27 + row * 35, ART[product.id])
        .setScale(0.69)
        .setDepth(y + 61)
        .setVisible(false);
    });
    const shelfLabel = this.text(x, y + 68, product.plural, 16, COLOR.ink, '700');
    const shelfCount = this.text(x, y + 90, '0 / 8 · needs stocking', 10, '#b58a61', '600');
    const fieldArt: Phaser.GameObjects.Image[] = [];
    if (product.id !== 'egg') {
      [-45, 0, 45].forEach((offset, index) => {
        const crop = this.scene.add
          .image(
            product.farm.x + offset,
            product.farm.y + (index % 2 ? 7 : -4),
            product.id === 'tomato' ? ART.plant : ART.stalk,
          )
          .setScale(product.id === 'tomato' ? 0.86 : 0.91)
          .setOrigin(0.5, 0.85)
          .setDepth(product.farm.y + 70 + index);
        fieldArt.push(crop);
      });
    } else {
      [0, 1, 2].forEach((index) => {
        fieldArt.push(
          this.scene.add
            .image(product.farm.x - 35 + index * 27, product.farm.y + 30, ART.egg)
            .setScale(0.45)
            .setDepth(product.farm.y + 106),
        );
      });
    }
    const farmLabel = this.text(
      product.farm.x,
      662,
      product.id === 'tomato' ? 'Tomato patch' : product.id === 'egg' ? 'Happy hens' : 'Corn field',
      15,
      COLOR.ink,
      '700',
    );
    const farmStatus = this.text(product.farm.x, 686, 'GROWING', 11, '#648268', '600');
    const farmProgress = this.scene.add.graphics().setDepth(20);
    const lockGraphic = this.scene.add
      .graphics()
      .fillStyle(0xf1eed7, 0.96)
      .fillRoundedRect(-58, -34, 116, 64, 14);
    const lockIcon = this.scene.add.image(0, -10, ART.lock).setScale(0.64);
    const lockText = this.scene.add
      .text(0, 17, 'A FUTURE HARVEST', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '8px',
        fontStyle: '700',
        color: '#839173',
      })
      .setOrigin(0.5);
    const lock = this.scene.add
      .container(product.farm.x, product.farm.y - 8, [lockGraphic, lockIcon, lockText])
      .setDepth(710)
      .setVisible(false);
    const highlight = this.scene.add.graphics().setDepth(8);
    this.productVisuals.set(product.id, {
      shelfItems,
      shelfCount,
      shelfLabel,
      farmLabel,
      farmStatus,
      farmProgress,
      fieldArt,
      lock,
      highlight,
      previousCount: '',
      previousFarm: '',
    });
  }

  private updateProduct(product: ProductDefinition, state: GameState, time: number): void {
    const visual = this.productVisuals.get(product.id)!;
    const unlocked = state.unlockedProducts.includes(product.id);
    const amount = state.shelves[product.id];
    const shelfText = !unlocked
      ? 'COMING SOON'
      : amount === 0
        ? `0 / ${state.shelfCapacities[product.id]} · needs stocking`
        : `${amount} / ${state.shelfCapacities[product.id]} ${amount >= state.shelfCapacities[product.id] ? '· FULL' : 'in stock'}`;
    if (visual.previousCount !== shelfText) {
      visual.shelfCount
        .setText(shelfText)
        .setColor(!unlocked ? '#a3aa8e' : amount ? '#78906d' : '#bd805f');
      visual.shelfLabel.setAlpha(unlocked ? 1 : 0.45);
      visual.shelfItems.forEach((item, index) => item.setVisible(unlocked && index < amount));
      visual.previousCount = shelfText;
    }
    const farm = state.farms[product.id];
    const farmText = !unlocked
      ? 'Unlock for $150 →'
      : farm.ready > 0
        ? `${farm.ready} ready to collect`
        : 'A little more sunshine…';
    if (visual.previousFarm !== farmText) {
      visual.farmStatus.setText(farmText).setColor(unlocked ? '#648268' : '#9a9f7e');
      visual.farmLabel.setAlpha(unlocked ? 1 : 0.6);
      visual.lock.setVisible(!unlocked);
      visual.fieldArt.forEach((image, index) =>
        image
          .setAlpha(unlocked ? (farm.ready ? 1 : 0.65) : 0.26)
          .setVisible(product.id !== 'egg' || index < farm.ready),
      );
      visual.previousFarm = farmText;
    }
    visual.farmProgress.clear();
    if (unlocked) {
      visual.farmProgress.fillStyle(0xc5d5ad).fillRoundedRect(product.farm.x - 40, 704, 80, 5, 3);
      const progress =
        farm.ready >= GAME_CONFIG.farmCapacity ? 1 : farm.elapsed / product.productionTime;
      visual.farmProgress
        .fillStyle(farm.ready ? 0x77985f : 0xa9b989)
        .fillRoundedRect(product.farm.x - 40, 704, Math.max(4, Math.min(1, progress) * 80), 5, 3);
    }
    visual.highlight.clear();
    if (
      unlocked &&
      Math.hypot(state.player.x - product.farm.x, state.player.y - product.farm.y) <
        GAME_CONFIG.interactionRadius
    ) {
      visual.highlight
        .lineStyle(2, 0x73945b, 0.55)
        .strokeRoundedRect(product.farm.x - 86, 542, 172, 99, 18);
    }
    if (unlocked && state.inventory[product.id] > 0) {
      const near =
        Math.hypot(state.player.x - product.shelf.x, state.player.y - product.shelf.y) <
        GAME_CONFIG.interactionRadius;
      visual.highlight
        .lineStyle(2, COLOR.green, near ? 0.7 : 0.2 + Math.sin(time / 600) * 0.08)
        .strokeEllipse(product.shelf.x, product.shelf.y + 37, 167, 40);
    }
  }

  private createUpgrade(upgrade: UpgradeDefinition): void {
    const { x, y } = upgrade.position;
    const background = this.scene.add.graphics().setDepth(12);
    const iconKey =
      upgrade.icon === 'corn'
        ? ART.corn
        : upgrade.icon === 'basket'
          ? ART.basket
          : upgrade.icon === 'shelf'
            ? ART.shelf
            : upgrade.icon === 'heart'
              ? ART.heart
              : ART.worker;
    const icon = this.scene.add
      .image(x, y - 23, iconKey)
      .setScale(0.61)
      .setDepth(13);
    const label = this.text(x, y + 1, upgrade.name, 11, '#68785b', '700');
    const price = this.text(x, y + 22, `$${upgrade.cost}`, 14, '#7a805e', '700');
    const progress = this.scene.add.graphics().setDepth(15);
    this.upgradeVisuals.set(upgrade.id, {
      background,
      label,
      price,
      icon,
      progress,
      previousState: '',
    });
  }

  private updateUpgrade(upgrade: UpgradeDefinition, state: GameState): void {
    const visual = this.upgradeVisuals.get(upgrade.id)!;
    const { x, y } = upgrade.position;
    const owned = state.upgrades[upgrade.id] >= upgrade.maxLevel;
    const affordable = state.money >= upgrade.cost;
    const active = state.activeUpgrade === upgrade.id;
    const key = `${owned}-${affordable}-${active}`;
    if (key !== visual.previousState) {
      visual.background.clear();
      visual.background.fillStyle(0x778860, 0.1).fillRoundedRect(x - 67, y - 42, 134, 90, 16);
      visual.background
        .fillStyle(owned ? 0xdce8cd : 0xfffae9)
        .fillRoundedRect(x - 67, y - 45, 134, 89, 16);
      visual.background
        .lineStyle(active ? 2 : 1, owned ? 0xb4c79f : affordable ? 0x95b084 : 0xe0e2c9)
        .strokeRoundedRect(x - 67, y - 45, 134, 89, 16);
      visual.price
        .setText(owned ? '✓ ALL YOURS' : active && affordable ? 'HOLD TO GROW' : `$${upgrade.cost}`)
        .setFontSize(owned || (active && affordable) ? 10 : 14)
        .setColor(owned || affordable ? '#55795b' : '#9d9e82');
      visual.icon.setAlpha(owned || affordable ? 1 : 0.65);
      visual.label.setColor(owned ? '#68805c' : '#68785b');
      visual.previousState = key;
    }
    visual.progress.clear();
    if (active && !owned && affordable) {
      visual.progress.fillStyle(0xd9e5c9).fillRoundedRect(x - 45, y + 33, 90, 4, 2);
      visual.progress
        .fillStyle(COLOR.green)
        .fillRoundedRect(
          x - 45,
          y + 33,
          Math.max(4, Math.min(1, state.upgradeProgress / GAME_CONFIG.upgradeHoldTime) * 90),
          4,
          2,
        );
    }
  }

  private drawCheckout(): void {
    const g = this.scene.add.graphics().setDepth(340);
    g.fillStyle(0x686a51, 0.13).fillEllipse(896, 277, 112, 26);
    g.fillStyle(0xc39e6d).fillRoundedRect(846, 229, 85, 44, 9);
    g.fillStyle(0xead4a1).fillRoundedRect(846, 219, 85, 43, 8);
    g.fillStyle(0xb8c6a4).fillRoundedRect(841, 211, 98, 32, 9);
    g.fillStyle(0xd8e0c1).fillRoundedRect(841, 207, 98, 29, 8);
    g.fillStyle(0xf9f2da).fillRoundedRect(851, 215, 43, 11, 4);
    g.fillStyle(0x608274).fillRoundedRect(903, 194, 30, 26, 5);
    g.fillStyle(0x94b6a0).fillRoundedRect(907, 198, 22, 13, 2);
    g.fillStyle(0xcde0b4).fillRect(911, 202, 14, 4);
    g.fillStyle(0x547564).fillRoundedRect(899, 216, 38, 9, 3);
    g.fillStyle(0xf4edd5).fillRoundedRect(881, 203, 12, 14, 2);
    g.lineStyle(1, 0xc2c9a5).lineBetween(884, 207, 890, 207).lineBetween(884, 210, 890, 210);
    this.text(900, 308, 'Checkout', 16, COLOR.ink, '700');
    const marks = this.scene.add.graphics().setDepth(3);
    marks.lineStyle(2, 0xd3d7be, 0.9);
    for (let index = 0; index < 4; index += 1)
      marks.strokeEllipse(
        GAME_CONFIG.queueStart.x,
        GAME_CONFIG.queueStart.y + index * GAME_CONFIG.queueSpacing,
        18,
        8,
      );
    const { x, y } = GAME_CONFIG.cashierSpot;
    marks.fillStyle(0xc9debc).fillEllipse(x, y, 49, 25);
    marks.lineStyle(1.5, 0x84a67b).strokeEllipse(x, y, 49, 25);
    marks
      .fillStyle(0x7d9f76)
      .fillRoundedRect(x - 10, y - 6, 7, 13, 3)
      .fillRoundedRect(x + 3, y - 6, 7, 13, 3);
    this.text(x + 20, y + 25, 'SERVE HERE', 8, '#85a078', '700');
  }

  private drawPlanter(x: number, y: number): void {
    const g = this.scene.add.graphics().setDepth(y + 100);
    g.fillStyle(0xb4a680, 0.22).fillEllipse(x, y + 9, 40, 12);
    g.fillStyle(0xc28c66).fillRoundedRect(x - 14, y - 14, 28, 22, 5);
    g.fillStyle(0xd9a980).fillRoundedRect(x - 17, y - 17, 34, 8, 3);
    g.fillStyle(0x7b9d65)
      .fillCircle(x - 7, y - 24, 13)
      .fillCircle(x + 7, y - 29, 13)
      .fillCircle(x, y - 35, 12);
    g.fillStyle(0x9eb785)
      .fillCircle(x - 6, y - 34, 8)
      .fillCircle(x + 9, y - 34, 7);
  }

  private drawGardenCorner(): void {
    const g = this.scene.add.graphics().setDepth(4);
    // Three wooden produce crates, a watering can and a small garden notice.
    g.fillStyle(0xa5b489, 0.14).fillEllipse(913, 608, 166, 58);
    for (const [x, y] of [
      [857, 587],
      [918, 607],
      [893, 575],
    ]) {
      g.fillStyle(0xbe9865).fillRoundedRect(x - 22, y - 14, 44, 29, 4);
      g.fillStyle(0xe0bc85)
        .fillRoundedRect(x - 24, y - 18, 48, 8, 3)
        .fillRoundedRect(x - 24, y + 7, 48, 7, 2);
      g.lineStyle(2, 0xeacf9d)
        .lineBetween(x - 15, y - 8, x - 15, y + 6)
        .lineBetween(x, y - 8, x, y + 6)
        .lineBetween(x + 15, y - 8, x + 15, y + 6);
    }
    [
      [845, 565],
      [863, 570],
      [882, 554],
      [901, 556],
    ].forEach(([x, y], index) =>
      this.scene.add
        .image(x, y, index < 2 ? ART.tomato : ART.egg)
        .setScale(0.58)
        .setDepth(6),
    );
    g.fillStyle(0x88aaa0)
      .fillRoundedRect(951, 583, 24, 24, 5)
      .fillTriangle(974, 590, 989, 579, 980, 601);
    g.lineStyle(4, 0x709389).strokeEllipse(951, 592, 18, 21);
    g.fillStyle(0x9fc0ac).fillEllipse(963, 583, 24, 7);
    this.text(901, 646, 'Good things take a little tending.', 11, '#83916f', '400');
    const sign = this.scene.add.graphics().setDepth(10);
    sign.fillStyle(0xbba070).fillRoundedRect(878, 486, 6, 38, 2);
    sign.fillStyle(0xf4e9c8).fillRoundedRect(832, 470, 104, 33, 7);
    this.text(884, 486, 'FARM → FRESH', 10, '#88916c', '700').setLetterSpacing(1);
  }

  private drawBicycle(x: number, y: number): void {
    const g = this.scene.add.graphics().setDepth(y);
    g.fillStyle(0x728764, 0.13).fillEllipse(x, y + 10, 95, 17);
    g.lineStyle(3, 0x768577)
      .strokeCircle(x - 28, y - 8, 19)
      .strokeCircle(x + 31, y - 8, 19);
    g.lineStyle(1, 0xb2c1a0)
      .strokeCircle(x - 28, y - 8, 15)
      .strokeCircle(x + 31, y - 8, 15);
    g.lineStyle(4, 0xe0aa78).strokeTriangle(x - 28, y - 8, x - 13, y - 35, x + 3, y - 8);
    g.lineBetween(x - 13, y - 35, x + 23, y - 35)
      .lineBetween(x + 23, y - 35, x + 3, y - 8)
      .lineBetween(x + 21, y - 42, x + 31, y - 8);
    g.lineStyle(4, 0x7c8170)
      .lineBetween(x - 21, y - 39, x - 6, y - 39)
      .lineBetween(x + 21, y - 42, x + 29, y - 46);
    this.scene.add
      .image(x + 37, y - 41, ART.basket)
      .setScale(0.46)
      .setDepth(y + 1);
    this.scene.add
      .image(x + 40, y - 60, ART.flower)
      .setScale(0.6)
      .setDepth(y + 2);
  }
}
