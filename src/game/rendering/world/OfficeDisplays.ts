import { Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Scene } from 'three';
import { OFFICE, OFFICE_ROOMS, OFFICE_WALLS, accountantCapacity } from '../../data/office';
import type { GameState, Vec2 } from '../../types';
import { createCharacter, type CharacterModel } from '../Models';
import {
  block,
  disc,
  label,
  material,
  PALETTE as C,
  ring,
  sphere,
  type WorldLabel,
} from './WorldKit';
import { VaultDoorDisplay } from './VaultDoorDisplay';
import { cashLabelAmount } from '../../data/cashPoints';

const point = (p: Vec2, h = 0) => ({ x: (p.x - 640) / 100, y: h, z: (p.y - 390) / 100 });
/** Roofless office wing. Stationary decoration is batched per room, not rebuilt each frame. */
export class OfficeDisplays {
  readonly root = new Group();
  private readonly accountant: CharacterModel;
  private readonly marketing: CharacterModel;
  private readonly bag = new Group();
  private readonly vaultDoor: VaultDoorDisplay;
  private readonly piles: InstancedMesh;
  private readonly bands: InstancedMesh;
  private readonly vaultLabel: WorldLabel;
  private readonly staffStatus: WorldLabel;
  private readonly collectRing: Mesh;
  private readonly previous = { ...OFFICE.accountantSeat } as Vec2;
  private readonly pen: Group;
  private readonly screens: Mesh[] = [];
  constructor(scene: Scene) {
    this.root.name = 'office-wing';
    scene.add(this.root);
    const floor = new Group();
    Object.assign(floor.position, point({ x: -380, y: 650 }));
    this.root.add(floor);
    block(floor, 0, 0.01, 0, 8.15, 0.1, 8.75, 0xf6f1df);
    block(floor, 0, 0.065, -0.1, 8, 0.018, 1.12, 0xdac49f);
    block(floor, 0.3, 0.065, 0, 0.8, 0.018, 8.4, 0xdac49f);
    block(floor, 4.35, 0.02, -0.1, 1.5, 0.08, 1.2, 0xf6f1df);
    const walls = new Group();
    this.root.add(walls);
    for (const wall of OFFICE_WALLS) {
      const p = point({ x: (wall.left + wall.right) / 2, y: (wall.top + wall.bottom) / 2 });
      const h = wall.top === 210 ? 0.95 : wall.top === 1070 ? 0.22 : 0.45;
      block(
        walls,
        p.x,
        h / 2 + 0.06,
        p.z,
        (wall.right - wall.left) / 100,
        h,
        (wall.bottom - wall.top) / 100,
        0xfaf5e7,
      );
      block(
        walls,
        p.x,
        h + 0.07,
        p.z,
        (wall.right - wall.left) / 100,
        0.055,
        (wall.bottom - wall.top) / 100,
        0x658778,
      );
    }
    this.batch(walls);
    const entrance = new Group();
    Object.assign(entrance.position, point({ x: -350, y: 640 }));
    this.root.add(entrance);
    const sign = label(entrance, 'OFFICE', 1.25, 0.27, {
      id: 'office:team:title',
      kind: 'area',
      mount: 'surface',
      foreground: '#ffffff',
      background: '#356b5b',
    });
    sign.object.position.set(0, 0.08, 0);
    sign.object.rotation.x = -Math.PI / 2;
    for (const room of OFFICE_ROOMS) {
      const center = { x: (room.left + room.right) / 2, y: (room.top + room.bottom) / 2 };
      const g = new Group();
      g.name = `office-room-${room.id}`;
      Object.assign(g.position, point(center));
      this.root.add(g);
      block(
        g,
        0,
        0.07,
        0,
        (room.right - room.left - 20) / 100,
        0.025,
        (room.bottom - room.top - 20) / 100,
        room.color,
      );
      const id = room.id === 'marketing' ? 'customers' : room.id;
      const title = label(g, room.title, room.id === 'vault' ? 1.7 : 1.65, 0.26, {
        id: `office:${id}:title`,
        kind: 'object',
        mount: 'surface',
        foreground: '#ffffff',
        background:
          room.id === 'marketing' ? '#80649c' : room.id === 'vault' ? '#42605a' : '#457e78',
      });
      const signHeight = room.id === 'vault' ? 0.095 : 1.02;
      const signZ = room.id === 'vault' ? -1.28 : -(room.bottom - room.top) / 200 + 0.18;
      title.object.position.set(0, signHeight, signZ);
      if (room.id === 'vault') title.object.rotation.x = -Math.PI / 2;
      else
        block(
          g,
          0,
          signHeight,
          signZ - 0.06,
          1.8,
          0.32,
          0.08,
          room.id === 'marketing' ? 0x80649c : 0x457e78,
        );
      if (room.id !== 'vault') {
        const deskPos = OFFICE[room.id];
        const desk = new Group();
        desk.name = `office-desk-${room.id}`;
        desk.position.set((deskPos.x - center.x) / 100, 0, (deskPos.y - center.y) / 100);
        g.add(desk);
        this.desk(
          desk,
          room.id === 'marketing' ? 0xa68abb : room.id === 'accountant' ? 0x709b9f : 0x4f7c63,
          room.id,
        );
        this.chair(
          g,
          (deskPos.x - center.x) / 100,
          (deskPos.y + 50 - center.y) / 100,
          room.id === 'manager' ? 0x3f6557 : 0x668787,
        );
        // Low rugs and room-specific cabinets frame the work area without blocking its doorway.
        block(
          g,
          0,
          0.09,
          0.18,
          1.8,
          0.012,
          1.45,
          room.id === 'marketing' ? 0xcac2db : room.id === 'manager' ? 0xd3b27e : 0xb5cec5,
        );
        this.plant(g, (room.right - center.x) / 100 - 0.4, -(room.bottom - room.top) / 200 + 0.55);
        this.window(g, -0.18, -(room.bottom - room.top) / 200 + 0.13);
        this.cabinet(g, room.id === 'accountant' ? 1.15 : -1.4, -0.5, room.id === 'manager');
        this.picture(
          g,
          -1.02,
          -(room.bottom - room.top) / 200 + 0.13,
          room.id === 'marketing' ? 0xc099ce : 0x9ac7af,
        );
        if (room.id === 'marketing') {
          this.pinboard(g, 1.24, -0.95);
          block(g, 1.25, 0.22, 0.65, 0.57, 0.37, 0.64, 0xc1a5cd);
          block(g, 1.25, 0.47, 0.9, 0.57, 0.37, 0.14, 0xc1a5cd);
        }
        if (room.id === 'manager') {
          block(g, 1.18, 0.2, 0.48, 0.55, 0.31, 1.1, 0x96ad90);
          block(g, 1.42, 0.43, 0.48, 0.14, 0.45, 1.1, 0x68836a);
          const name = label(desk, 'YOUR OFFICE', 0.75, 0.16, {
            id: 'office:manager:owner',
            kind: 'status',
            mount: 'surface',
            background: '#fff7df',
            foreground: '#365e4c',
          });
          name.object.position.set(0, 0.58, 0.33);
          name.object.rotation.x = -0.65;
        }
      } else {
        block(g, 0, 0.14, 1.25, 2.6, 0.1, 0.72, 0x879b91);
        // A low steel rail keeps the cash visible from the game's overhead camera.
        block(g, 0, 0.2, 1.65, 2.65, 0.15, 0.11, 0x728e85);
        for (let x = -1.2; x < 1.3; x += 0.4) block(g, x, 0.2, 1.57, 0.035, 0.14, 0.025, 0xc6d3cb);
      }
      this.batch(g);
    }
    this.batch(floor);
    this.vaultDoor = new VaultDoorDisplay(this.root);
    const cash = new Group();
    cash.name = 'vault-cash-stacks';
    Object.assign(cash.position, point({ x: -160, y: 1015 }));
    this.root.add(cash);
    const template = block(new Group(), 0, 0, 0, 0.29, 0.09, 0.17, 0x348863);
    this.piles = new InstancedMesh(template.geometry, material(0x348863), 48);
    this.piles.name = 'vault-banknotes';
    cash.add(this.piles);
    this.bands = new InstancedMesh(template.geometry, material(0xf7e8ba), 48);
    cash.add(this.bands);
    for (let i = 0; i < 48; i++) {
      const x = ((i % 8) - 3.5) * 0.29,
        z = ((Math.floor(i / 8) % 2) - 0.5) * 0.28,
        y = 0.24 + Math.floor(i / 16) * 0.095;
      this.piles.setMatrixAt(i, new Matrix4().makeScale(0.26, 0.085, 0.19).setPosition(x, y, z));
      this.bands.setMatrixAt(i, new Matrix4().makeScale(0.055, 0.088, 0.195).setPosition(x, y, z));
    }
    this.piles.instanceMatrix.needsUpdate = true;
    this.bands.instanceMatrix.needsUpdate = true;
    const collect = new Group();
    collect.name = 'vault-collection';
    Object.assign(collect.position, point(OFFICE.vaultCollect));
    this.root.add(collect);
    this.collectRing = ring(collect, 0.35, C.gold, 0.045);
    this.collectRing.position.y = 0.105;
    this.vaultLabel = label(collect, 'VAULT $0', 1.3, 0.29, {
      id: 'office:vault:balance',
      kind: 'status',
      mount: 'surface',
      background: '#fff6db',
      foreground: '#31664f',
    });
    block(collect, 0, 0.25, -0.38, 1.4, 0.32, 0.04, C.cream).rotation.x = -0.6;
    this.vaultLabel.object.position.set(0, 0.25, -0.35);
    this.vaultLabel.object.rotation.x = -0.6;
    this.accountant = createCharacter('office', 0x709cab);
    this.accountant.group.name = 'office-accountant';
    this.accountant.group.scale.setScalar(1.2);
    this.root.add(this.accountant.group);
    this.marketing = createCharacter('office', 0xa58bc1);
    this.marketing.group.name = 'office-marketing';
    this.marketing.group.scale.setScalar(1.2);
    Object.assign(this.marketing.group.position, point(OFFICE.marketingSeat));
    this.marketing.setFacing(0, -1);
    this.marketing.group.rotation.y = Math.PI;
    this.root.add(this.marketing.group);
    this.bag.name = 'accountant-cash-bag';
    this.bag.position.set(0, 0.29, 0.21);
    this.accountant.group.add(this.bag);
    block(this.bag, 0, 0, 0, 0.25, 0.18, 0.15, 0xa67c4e);
    block(this.bag, 0, 0.095, 0, 0.21, 0.025, 0.12, 0xc5a371);
    block(this.bag, 0, 0.12, 0, 0.15, 0.025, 0.08, 0x398564);
    block(this.bag, 0, 0.134, 0, 0.035, 0.008, 0.085, C.cream);
    this.pen = new Group();
    this.pen.name = 'accountant-pen';
    Object.assign(this.pen.position, point({ x: -149, y: 439 }, 0.47));
    this.root.add(this.pen);
    block(this.pen, 0, 0, 0, 0.015, 0.015, 0.12, 0x385972).rotation.y = 0.4;
    const status = new Group();
    Object.assign(status.position, point({ x: -170, y: 550 }, 0.12));
    this.root.add(status);
    this.staffStatus = label(status, 'PAPERWORK', 1.4, 0.2, {
      id: 'office:accountant:status',
      kind: 'status',
      mount: 'surface',
      foreground: '#3c6e5d',
      background: '#f4f5e9',
    });
    this.staffStatus.object.rotation.x = -Math.PI / 3;
  }
  update(state: GameState, time: number): void {
    this.vaultDoor.update(state);
    const a = state.office.accountant,
      moving = Math.hypot(a.x - this.previous.x, a.y - this.previous.y) > 0.01;
    this.accountant.group.visible = state.upgrades.accountant > 0;
    Object.assign(this.accountant.group.position, point(a));
    const seated = a.phase === 'DESK' || a.phase === 'PAPERWORK';
    if (moving) this.accountant.setFacing(a.x - this.previous.x, a.y - this.previous.y);
    else if (seated) this.accountant.setFacing(0, -1);
    this.accountant.setOfficePose?.(seated ? 'paperwork' : a.carrying ? 'carrying' : 'walking');
    this.accountant.animate(time, moving);
    this.previous.x = a.x;
    this.previous.y = a.y;
    this.bag.visible = a.carrying > 0;
    this.marketing.group.visible = state.upgrades.customers > 0;
    this.marketing.setOfficePose?.('typing');
    this.marketing.animate(time, false);
    this.pen.visible = state.upgrades.accountant > 0 && seated;
    this.pen.position.x = point({ x: -149, y: 439 }).x + Math.sin(time * 0.014) * 0.025;
    this.pen.rotation.y = Math.sin(time * 0.012) * 0.18;
    this.staffStatus.setText(
      state.upgrades.accountant
        ? seated
          ? 'PAPERWORK'
          : a.carrying
            ? `CARRYING ${cashLabelAmount(a.carrying)}`
            : 'COLLECTING CASH'
        : 'HIRE IN MANAGE',
    );
    this.staffStatus.object.userData.capacity = accountantCapacity(state);
    this.vaultLabel.setText(`VAULT ${cashLabelAmount(state.office.vault)}`);
    const bundles = state.office.vault
      ? Math.min(48, Math.max(1, Math.ceil(state.office.vault / 50)))
      : 0;
    this.piles.count = bundles;
    this.bands.count = bundles;
    this.collectRing.visible = state.office.vault > 0;
    this.screens.forEach((screen, i) => {
      screen.scale.x = 0.27 + Math.sin(time * 0.002 + i) * 0.006;
    });
  }
  private desk(g: Group, color: number, id: string): void {
    block(g, 0, 0.43, 0, 1.18, 0.09, 0.57, 0xd6ac7c);
    for (const x of [-0.48, 0.48]) block(g, x, 0.22, 0, 0.09, 0.4, 0.46, 0xf2eee2);
    block(g, -0.23, 0.58, -0.08, 0.03, 0.3, 0.03, 0x405b55);
    block(g, -0.23, 0.71, -0.12, 0.46, 0.29, 0.065, 0x405b55);
    block(g, -0.23, 0.71, -0.081, 0.4, 0.23, 0.01, color);
    this.screens.push(block(g, -0.23, 0.73, -0.071, 0.28, 0.023, 0.008, 0xd2eee2));
    block(g, -0.21, 0.485, 0.18, 0.36, 0.02, 0.13, 0x8b9d91);
    for (let i = 0; i < 4; i++) block(g, -0.33 + i * 0.075, 0.5, 0.18, 0.045, 0.008, 0.07, C.cream);
    block(g, 0.3, 0.485, 0.16, 0.24, 0.025, 0.24, C.cream);
    block(g, 0.3, 0.502, 0.14, 0.17, 0.006, 0.018, 0x9fbaa9);
    disc(g, 0.39, 0.5, -0.15, 0.06, 0.1, 0xf0e1b9);
    disc(g, 0.39, 0.558, -0.15, 0.043, 0.008, 0x765239);
    if (id === 'accountant') {
      block(g, 0.14, 0.49, -0.13, 0.18, 0.035, 0.12, 0x354f4a);
      for (let i = 0; i < 3; i++) block(g, 0.1 + i * 0.04, 0.512, -0.1, 0.02, 0.01, 0.025, C.cream);
    }
  }
  private chair(g: Group, x: number, z: number, color: number): void {
    const c = new Group();
    c.name = 'office-chair';
    c.position.set(x, 0, z);
    g.add(c);
    disc(c, 0, 0.1, 0, 0.035, 0.18, 0x7e9087);
    block(c, 0, 0.2, 0, 0.36, 0.08, 0.32, color);
    block(c, 0, 0.4, 0.14, 0.36, 0.36, 0.075, color);
    for (const side of [-1, 1]) {
      block(c, side * 0.17, 0.29, 0, 0.035, 0.19, 0.22, 0x425f55);
      block(c, side * 0.11, 0.055, 0, 0.25, 0.04, 0.045, 0x62796d).rotation.y = side * 0.6;
    }
  }
  private cabinet(g: Group, x: number, z: number, books: boolean): void {
    block(g, x, 0.48, z, 0.42, 0.8, 1.05, 0xc1a37d);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 4; col++)
        block(
          g,
          x + 0.22,
          0.25 + row * 0.22,
          z - 0.35 + col * 0.2,
          0.03,
          0.14,
          0.14,
          books ? [0x7a9e91, 0xc28765, 0x9b8fa7][(row + col) % 3] : 0xe1dbc8,
        );
  }
  private window(g: Group, x: number, z: number): void {
    block(g, x, 0.66, z, 1.1, 0.53, 0.06, 0xfdf9e9);
    block(g, x, 0.66, z + 0.04, 0.98, 0.41, 0.02, 0xa6d6d2);
    block(g, x, 0.66, z + 0.055, 0.025, 0.43, 0.015, C.cream);
    block(g, x, 0.66, z + 0.055, 1, 0.025, 0.015, C.cream);
  }
  private picture(g: Group, x: number, z: number, color: number): void {
    block(g, x, 0.63, z, 0.36, 0.39, 0.06, 0x96764f);
    block(g, x, 0.63, z + 0.04, 0.29, 0.32, 0.015, C.cream);
    sphere(g, x, 0.65, z + 0.065, 0.095, color).scale.z = 0.12;
  }
  private pinboard(g: Group, x: number, z: number): void {
    block(g, x, 0.6, z, 0.55, 0.52, 0.06, 0xaf8b5d);
    for (let i = 0; i < 4; i++)
      block(
        g,
        x + ((i % 2) - 0.5) * 0.23,
        0.48 + Math.floor(i / 2) * 0.23,
        z + 0.04,
        0.18,
        0.17,
        0.015,
        [0xf2e3a2, 0xb7cddf, 0xd4e7c0, 0xecc6b0][i],
      );
  }
  private plant(g: Group, x: number, z: number): void {
    disc(g, x, 0.2, z, 0.14, 0.28, 0xc2956b);
    disc(g, x, 0.38, z, 0.025, 0.3, 0x648852);
    for (let i = 0; i < 4; i++) {
      const leaf = sphere(
        g,
        x + Math.sin(i * 1.6) * 0.09,
        0.5 + i * 0.04,
        z + Math.cos(i * 1.6) * 0.08,
        0.14,
        0x68966b,
      );
      leaf.scale.set(0.098, 0.154, 0.098);
    }
  }
  private batch(root: Group): void {
    root.updateWorldMatrix(true, true);
    const inverse = new Matrix4().copy(root.matrixWorld).invert(),
      groups = new Map<string, Mesh[]>();
    root.traverse((o) => {
      if (
        o instanceof Mesh &&
        o.material instanceof MeshStandardMaterial &&
        !this.screens.includes(o)
      ) {
        const k = o.geometry.uuid + o.material.uuid;
        const list = groups.get(k) ?? [];
        list.push(o);
        groups.set(k, list);
      }
    });
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const instance = new InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
      meshes.forEach((m, i) => {
        instance.setMatrixAt(i, new Matrix4().multiplyMatrices(inverse, m.matrixWorld));
        m.removeFromParent();
      });
      instance.instanceMatrix.needsUpdate = true;
      instance.computeBoundingSphere();
      root.add(instance);
    }
  }
}
