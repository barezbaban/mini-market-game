import Phaser from 'phaser';

export const ART = {
  tomato: 'market-tomato',
  egg: 'market-egg',
  corn: 'market-corn',
  plant: 'market-tomato-plant',
  stalk: 'market-corn-stalk',
  chicken: 'market-chicken',
  tree: 'market-tree',
  flower: 'market-flower',
  lock: 'market-lock',
  basket: 'market-basket',
  shelf: 'market-shelf-icon',
  heart: 'market-heart',
  worker: 'market-worker',
  shoe: 'market-shoe',
  shirt: 'market-shirt',
  apron: 'market-apron',
  hat: 'market-hat',
  hair: 'market-hair',
} as const;

type Painter = (graphics: Phaser.GameObjects.Graphics) => void;

/** Original, resolution-independent artwork, rasterized once for the scene. */
export function createArt(scene: Phaser.Scene): void {
  const texture = (key: string, width: number, height: number, paint: Painter) => {
    if (scene.textures.exists(key)) return;
    const graphic = scene.add.graphics();
    paint(graphic);
    graphic.generateTexture(key, width, height);
    graphic.destroy();
  };

  texture(ART.tomato, 40, 42, (g) => {
    g.fillStyle(0xab513d, 0.16).fillEllipse(20, 36, 28, 8);
    g.fillStyle(0xd95343).fillCircle(20, 23, 15);
    g.fillStyle(0xf37557).fillEllipse(18, 20, 26, 25);
    g.fillStyle(0xffb28a, 0.85).fillEllipse(12, 17, 6, 9);
    g.fillStyle(0x557d45).fillTriangle(19, 13, 9, 8, 16, 18);
    g.fillTriangle(19, 13, 31, 9, 23, 19).fillTriangle(19, 13, 21, 5, 24, 15);
    g.lineStyle(3, 0x42683b).lineBetween(20, 13, 19, 6);
  });
  texture(ART.egg, 40, 42, (g) => {
    g.fillStyle(0xb78e58, 0.17).fillEllipse(20, 36, 25, 7);
    g.fillStyle(0xdcc7a0).fillEllipse(21, 25, 25, 28);
    g.fillStyle(0xfff3cf).fillEllipse(19, 23, 24, 28).fillCircle(19, 15, 9);
    g.fillStyle(0xfffbed).fillEllipse(15, 18, 6, 12);
    g.fillStyle(0xc5a575, 0.4).fillCircle(24, 28, 1).fillCircle(25, 22, 1).fillCircle(20, 32, 1);
  });
  texture(ART.corn, 40, 48, (g) => {
    g.fillStyle(0x536f34, 0.13).fillEllipse(20, 41, 29, 8);
    g.fillStyle(0xe5ab33).fillRoundedRect(11, 6, 19, 33, 10);
    g.fillStyle(0xf8d563).fillRoundedRect(13, 6, 15, 30, 8);
    g.fillStyle(0xffe795);
    for (let y = 11; y < 34; y += 6) {
      g.fillRoundedRect(15, y, 4, 4, 1).fillRoundedRect(21, y, 4, 4, 1);
    }
    g.fillStyle(0x6b984b).fillTriangle(18, 43, 2, 24, 17, 32);
    g.fillStyle(0x507e40).fillTriangle(19, 43, 36, 19, 28, 39);
    g.lineStyle(1, 0xa4bd6c).lineBetween(18, 40, 8, 29).lineBetween(23, 38, 31, 27);
  });
  texture(ART.plant, 76, 86, (g) => {
    g.fillStyle(0x614a31, 0.2).fillEllipse(38, 73, 55, 14);
    g.lineStyle(5, 0x5c824a).lineBetween(38, 71, 38, 20);
    g.lineStyle(3, 0x759157).lineBetween(38, 48, 16, 35).lineBetween(38, 39, 59, 25);
    g.fillStyle(0x739d58).fillEllipse(22, 32, 30, 17).fillEllipse(54, 26, 28, 17);
    g.fillStyle(0x588a4e).fillEllipse(21, 51, 26, 18).fillEllipse(55, 50, 31, 21);
    g.fillStyle(0x84aa63).fillEllipse(36, 20, 21, 27);
    for (const [x, y] of [
      [24, 40],
      [51, 43],
      [35, 58],
    ]) {
      g.fillStyle(0xc95342).fillCircle(x, y + 1, 9);
      g.fillStyle(0xf47a59).fillCircle(x - 1, y - 1, 8);
      g.fillStyle(0xffb593).fillCircle(x - 3, y - 4, 2);
      g.fillStyle(0x486f3e).fillTriangle(x, y - 6, x - 4, y - 12, x + 4, y - 10);
    }
  });
  texture(ART.stalk, 66, 100, (g) => {
    g.fillStyle(0x80672d, 0.15).fillEllipse(33, 88, 50, 10);
    g.lineStyle(5, 0x6a8e45).lineBetween(33, 89, 32, 22);
    g.fillStyle(0x739b4d).fillTriangle(33, 58, 6, 33, 17, 58);
    g.fillTriangle(33, 73, 2, 57, 21, 75);
    g.fillStyle(0x86a854).fillTriangle(32, 45, 58, 22, 48, 52);
    g.fillTriangle(33, 79, 64, 47, 47, 75);
    g.fillStyle(0xf1c34f).fillRoundedRect(32, 42, 12, 28, 6);
    g.lineStyle(1, 0xffdf7b).lineBetween(37, 47, 37, 65).lineBetween(41, 47, 41, 64);
    g.lineStyle(2, 0xc4a25d)
      .lineBetween(32, 26, 29, 6)
      .lineBetween(31, 20, 21, 10)
      .lineBetween(33, 18, 42, 9);
  });
  texture(ART.chicken, 58, 56, (g) => {
    g.fillStyle(0x62593a, 0.14).fillEllipse(29, 49, 39, 9);
    g.lineStyle(3, 0xdcaa5b).lineBetween(24, 43, 21, 50).lineBetween(36, 44, 39, 50);
    g.fillStyle(0xe4d4ab).fillEllipse(27, 31, 37, 28);
    g.fillStyle(0xfff5d8).fillEllipse(25, 29, 36, 29).fillCircle(40, 20, 12);
    g.fillStyle(0xf5e6c2).fillEllipse(22, 31, 20, 16);
    g.fillStyle(0xfff5d8).fillTriangle(14, 27, 3, 16, 4, 33);
    g.fillStyle(0xe56f51).fillCircle(38, 8, 5).fillCircle(44, 9, 4).fillEllipse(45, 29, 6, 9);
    g.fillStyle(0xe3ae45).fillTriangle(50, 19, 58, 23, 49, 25);
    g.fillStyle(0x3e4f3b).fillCircle(43, 18, 2);
  });
  texture(ART.tree, 142, 180, (g) => {
    g.fillStyle(0x517452, 0.14).fillEllipse(71, 163, 117, 24);
    g.fillStyle(0x9f7b54).fillRoundedRect(61, 77, 17, 84, 5);
    g.fillStyle(0xc4a170).fillRect(63, 90, 5, 66);
    g.lineStyle(8, 0x9f7b54).lineBetween(68, 126, 44, 103).lineBetween(71, 104, 95, 79);
    g.fillStyle(0x61895d).fillCircle(50, 79, 40).fillCircle(90, 74, 39).fillCircle(69, 46, 40);
    g.fillStyle(0x7da371).fillCircle(40, 57, 30).fillCircle(82, 40, 34).fillCircle(101, 60, 28);
    g.fillStyle(0x95b484).fillCircle(58, 32, 21).fillCircle(93, 35, 16);
    g.fillStyle(0xb4c796, 0.8).fillEllipse(45, 30, 12, 7).fillEllipse(95, 57, 10, 6);
  });
  texture(ART.flower, 32, 42, (g) => {
    g.lineStyle(2, 0x6b9255).lineBetween(16, 38, 16, 18);
    g.fillStyle(0x7da064).fillEllipse(9, 29, 12, 6).fillEllipse(23, 34, 12, 6);
    g.fillStyle(0xfff0c2)
      .fillCircle(10, 13, 6)
      .fillCircle(21, 13, 6)
      .fillCircle(16, 7, 6)
      .fillCircle(16, 19, 6);
    g.fillStyle(0xeeb54e).fillCircle(16, 13, 5);
  });
  texture(ART.lock, 32, 38, (g) => {
    g.lineStyle(5, 0x788674).strokeRoundedRect(9, 4, 15, 22, 8);
    g.fillStyle(0x87977d).fillRoundedRect(3, 17, 27, 20, 6);
    g.fillStyle(0xe9ecd8).fillCircle(16, 25, 3).fillRect(14, 25, 4, 7);
  });
  texture(ART.basket, 48, 44, (g) => {
    g.lineStyle(4, 0x9c7549).strokeRoundedRect(13, 3, 23, 23, 12);
    g.fillStyle(0xb78b56).fillRoundedRect(5, 16, 39, 25, 5);
    g.fillStyle(0xd7ad6d).fillRoundedRect(4, 14, 41, 8, 3);
    g.lineStyle(2, 0xebc58b);
    for (let x = 11; x <= 39; x += 7) g.lineBetween(x, 23, x, 37);
    g.lineBetween(8, 29, 41, 29).lineBetween(8, 35, 41, 35);
  });
  texture(ART.shelf, 48, 44, (g) => {
    g.fillStyle(0xb8905c).fillRoundedRect(5, 5, 7, 36, 2).fillRoundedRect(37, 5, 7, 36, 2);
    g.fillStyle(0xdbb27b).fillRoundedRect(3, 15, 43, 6, 2).fillRoundedRect(3, 33, 43, 6, 2);
    g.fillStyle(0xe97b59).fillCircle(18, 11, 5).fillCircle(30, 11, 5);
    g.fillStyle(0xf0d17c).fillCircle(18, 29, 5).fillCircle(30, 29, 5);
  });
  texture(ART.heart, 48, 44, (g) => {
    g.fillStyle(0xe88975)
      .fillCircle(16, 15, 11)
      .fillCircle(32, 15, 11)
      .fillTriangle(6, 20, 42, 20, 24, 40);
    g.fillStyle(0xf7b2a0).fillEllipse(12, 12, 6, 9);
  });
  texture(ART.worker, 48, 44, (g) => {
    g.fillStyle(0x71998d).fillRoundedRect(9, 24, 31, 20, 9);
    g.fillStyle(0xefcfaa).fillCircle(24, 15, 12);
    g.fillStyle(0x56776b).fillRoundedRect(11, 3, 27, 9, 4).fillRect(8, 10, 31, 4);
    g.fillStyle(0xf4e9c8).fillRoundedRect(18, 29, 14, 15, 3);
    g.fillStyle(0x4d5844).fillCircle(20, 16, 1.5).fillCircle(28, 16, 1.5);
  });
  texture(ART.shoe, 18, 15, (g) => {
    g.fillStyle(0x56574a).fillRoundedRect(1, 3, 16, 11, 5);
    g.fillStyle(0x7e7963).fillRoundedRect(2, 1, 14, 8, 4);
  });
  texture(ART.shirt, 42, 42, (g) => {
    g.fillStyle(0xffffff).fillRoundedRect(5, 5, 32, 34, 12);
    g.fillStyle(0xe6e6e6).fillRoundedRect(1, 10, 10, 19, 5).fillRoundedRect(31, 10, 10, 19, 5);
  });
  texture(ART.apron, 28, 32, (g) => {
    g.fillStyle(0xefe7c8).fillRoundedRect(4, 1, 20, 29, 5);
    g.fillStyle(0xd1cfab).fillRoundedRect(8, 14, 12, 8, 2);
    g.lineStyle(2, 0xfff4d6).lineBetween(5, 5, 4, 0).lineBetween(23, 5, 24, 0);
  });
  [0xf0cda6, 0xdca777, 0xba7e57].forEach((skin, index) => {
    texture(`market-face-${index}`, 42, 40, (g) => {
      g.fillStyle(skin)
        .fillCircle(4, 21, 4)
        .fillCircle(38, 21, 4)
        .fillRoundedRect(5, 4, 32, 33, 14);
      g.fillStyle(0x444b3b).fillCircle(15, 20, 1.6).fillCircle(27, 20, 1.6);
      g.fillStyle(0xe69276, 0.55).fillEllipse(11, 26, 5, 3).fillEllipse(31, 26, 5, 3);
      g.lineStyle(1.3, 0xa97052).beginPath().arc(21, 25, 4, 0.3, 2.7).strokePath();
    });
  });
  texture(ART.hat, 62, 34, (g) => {
    g.fillStyle(0xba9252).fillEllipse(31, 23, 59, 20);
    g.fillStyle(0xe8c57d).fillEllipse(31, 21, 59, 19).fillRoundedRect(13, 2, 36, 24, 12);
    g.fillStyle(0xf3d996).fillEllipse(28, 9, 28, 11);
    g.fillStyle(0xb88654).fillRoundedRect(14, 18, 34, 7, 3);
    g.lineStyle(1, 0xc5a665, 0.6).strokeEllipse(31, 23, 50, 11);
  });
  texture(ART.hair, 44, 26, (g) => {
    g.fillStyle(0xffffff).fillRoundedRect(3, 0, 38, 19, 12).fillRoundedRect(3, 10, 7, 15, 4);
    g.fillTriangle(15, 10, 35, 9, 27, 21);
  });
}
