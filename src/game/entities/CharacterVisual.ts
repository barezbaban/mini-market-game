import Phaser from 'phaser';
import { ART } from '../rendering/ArtFactory';
import { PRODUCTS } from '../data/products';
import type { CustomerData, ItemCounts } from '../types';

export class CharacterVisual {
  readonly container: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly leftFoot: Phaser.GameObjects.Image;
  private readonly rightFoot: Phaser.GameObjects.Image;
  private readonly shirt: Phaser.GameObjects.Image;
  private readonly face: Phaser.GameObjects.Image;
  private readonly hair: Phaser.GameObjects.Image;
  private readonly thought: Phaser.GameObjects.Container;
  private readonly thoughtProduct: Phaser.GameObjects.Image;
  private readonly thoughtAmount: Phaser.GameObjects.Text;
  private readonly carried: Phaser.GameObjects.Image[] = [];
  private readonly basket: Phaser.GameObjects.Image;
  private previousX = 0;
  private previousY = 0;
  private assignedId = -1;
  private inventoryKey = '';

  constructor(
    scene: Phaser.Scene,
    readonly kind: 'player' | 'customer' | 'cashier',
  ) {
    this.container = scene.add.container(0, 0);
    const shadow = scene.add.ellipse(0, 0, 37, 12, 0x485b44, 0.17);
    this.leftFoot = scene.add.image(-8, -5, ART.shoe).setScale(0.82);
    this.rightFoot = scene.add.image(8, -5, ART.shoe).setScale(0.82);
    this.body = scene.add.container(0, 0);
    this.shirt = scene.add
      .image(0, -25, ART.shirt)
      .setTint(kind === 'player' ? 0x699d88 : 0x98a7aa);
    this.face = scene.add.image(0, -51, 'market-face-0');
    this.hair = scene.add.image(0, -66, ART.hair).setTint(0x756142);
    const hands = scene.add
      .graphics()
      .fillStyle(0xe9bf94)
      .fillCircle(-18, -19, 5)
      .fillCircle(18, -19, 5);
    this.body.add([this.shirt, hands]);
    if (kind !== 'customer') this.body.add(scene.add.image(0, -21, ART.apron));
    this.body.add([this.face, this.hair]);
    if (kind === 'player') {
      this.hair.setVisible(false);
      this.body.add(scene.add.image(0, -70, ART.hat));
      const marker = scene.add.graphics().fillStyle(0x5b8b6f).fillTriangle(-4, -98, 4, -98, 0, -93);
      this.body.add(marker);
    }
    if (kind === 'cashier') {
      this.shirt.setTint(0xca9c68);
      this.body.add(scene.add.image(0, -70, ART.hat).setScale(0.73).setTint(0xd8e4cb));
    }
    this.basket = scene.add.image(22, -21, ART.basket).setScale(0.48).setVisible(false);
    this.body.add(this.basket);
    for (let index = 0; index < 8; index += 1) {
      const item = scene.add
        .image(-24, -29 - index * 10, ART.tomato)
        .setScale(0.53)
        .setVisible(false);
      this.carried.push(item);
      this.body.add(item);
    }
    const thoughtBackground = scene.add.graphics();
    thoughtBackground.fillStyle(0x456344, 0.12).fillRoundedRect(17, -94, 35, 32, 11);
    thoughtBackground
      .fillStyle(0xfffdf0)
      .fillRoundedRect(16, -97, 35, 32, 11)
      .fillCircle(19, -62, 3);
    this.thoughtProduct = scene.add.image(33, -82, ART.tomato).setScale(0.54);
    this.thoughtAmount = scene.add
      .text(33, -81, '', {
        fontFamily: '"Trebuchet MS", Arial, sans-serif',
        fontSize: '11px',
        fontStyle: '700',
        color: '#5f8364',
        resolution: 2,
      })
      .setOrigin(0.5);
    this.thought = scene.add
      .container(0, 0, [thoughtBackground, this.thoughtProduct, this.thoughtAmount])
      .setVisible(false);
    this.container.add([shadow, this.leftFoot, this.rightFoot, this.body, this.thought]);
  }

  setPosition(x: number, y: number, time: number, moving: boolean): void {
    const phase = time / 100 + this.assignedId;
    this.container.setPosition(x, y).setDepth(y + 100);
    this.body.y = moving ? Math.sin(phase) * 2 : Math.sin(time / 650 + this.assignedId) * 0.7;
    this.leftFoot.y = -5 + (moving ? Math.sin(phase) * 3 : 0);
    this.rightFoot.y = -5 + (moving ? -Math.sin(phase) * 3 : 0);
    this.leftFoot.rotation = moving ? Math.sin(phase) * 0.13 : 0;
    this.rightFoot.rotation = moving ? -Math.sin(phase) * 0.13 : 0;
    this.previousX = x;
    this.previousY = y;
  }

  updatePlayer(x: number, y: number, inventory: ItemCounts, time: number): void {
    const moving = Math.abs(x - this.previousX) + Math.abs(y - this.previousY) > 0.2;
    this.setPosition(x, y, time, moving);
    this.updateInventory(inventory);
  }

  updateCustomer(customer: CustomerData, time: number): void {
    if (this.assignedId !== customer.id) {
      this.assignedId = customer.id;
      this.shirt.setTint(customer.color);
      this.face.setTexture(`market-face-${customer.id % 3}`);
      this.hair.setTint([0x655541, 0xa2754d, 0x49473d, 0xc49c63][customer.id % 4]);
    }
    this.container.setVisible(true);
    const moving =
      Math.abs(customer.x - this.previousX) + Math.abs(customer.y - this.previousY) > 0.2;
    this.setPosition(customer.x, customer.y, time, moving);
    const wantsProduct =
      customer.state === 'WAITING_FOR_PRODUCT' || customer.state === 'MOVING_TO_SHELF';
    const wantsPayment = customer.state === 'QUEUEING' || customer.state === 'PAYING';
    this.thought.setVisible(wantsProduct || wantsPayment);
    this.thoughtProduct.setVisible(wantsProduct);
    this.thoughtAmount.setVisible(wantsPayment);
    if (wantsPayment) {
      const amount = PRODUCTS.reduce(
        (sum, product) => sum + customer.basket[product.id] * product.sellingPrice,
        0,
      );
      this.thoughtAmount.setText(`$${amount}`);
    }
    this.thought.y = customer.state === 'WAITING_FOR_PRODUCT' ? Math.sin(time / 360) * 2 : 0;
    this.thoughtProduct.setTexture(ART[customer.targetProduct]);
    this.updateInventory(customer.basket);
  }

  private updateInventory(inventory: ItemCounts): void {
    const key = `${inventory.tomato}:${inventory.egg}:${inventory.corn}`;
    if (key === this.inventoryKey) return;
    this.inventoryKey = key;
    const total = inventory.tomato + inventory.egg + inventory.corn;
    this.basket.setVisible(total > 0);
    const products = (['tomato', 'egg', 'corn'] as const).flatMap((product) =>
      Array.from({ length: inventory[product] }, () => product),
    );
    this.carried.forEach((item, index) => {
      item.setVisible(index < products.length);
      if (index < products.length) item.setTexture(ART[products[index]]);
    });
  }

  hide(): void {
    this.container.setVisible(false);
  }

  destroy(): void {
    this.container.destroy();
  }
}
