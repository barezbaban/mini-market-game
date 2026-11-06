import { Group, MeshStandardMaterial } from 'three';
import { VAULT_DOOR } from '../../data/office';
import type { GameState } from '../../types';
import { block, disc, label, sphere, PALETTE as C } from './WorldKit';

/** Sliding leaves retract into the wall; no swinging slab can obstruct the passage. */
export class VaultDoorDisplay {
  readonly root = new Group();
  private readonly leaves: Group[] = [];
  private readonly lamp = new MeshStandardMaterial({ color: 0xb76249, roughness: 0.6 });
  constructor(parent: Group) {
    this.root.name = 'vault-security-door';
    this.root.position.set((VAULT_DOOR.x - 640) / 100, 0, (VAULT_DOOR.y - 390) / 100);
    parent.add(this.root);
    const width = VAULT_DOOR.width / 100;
    for (const side of [-1, 1]) {
      block(this.root, side * (width / 2 + 0.07), 0.59, 0, 0.14, 1.02, 0.22, 0x47695e);
      const leaf = new Group();
      leaf.name = `vault-door-${side < 0 ? 'left' : 'right'}`;
      this.root.add(leaf);
      this.leaves.push(leaf);
      block(leaf, 0, 0.56, 0, width / 2 - 0.015, 0.94, 0.12, 0x789b8d);
      for (const face of [-1, 1]) {
        block(leaf, 0, 0.56, face * 0.067, width / 2 - 0.1, 0.78, 0.02, 0xa2b6a9);
        for (const y of [0.23, 0.88])
          for (const x of [-0.19, 0.19]) sphere(leaf, x, y, face * 0.083, 0.018, 0x456354);
      }
      if (side === -1) {
        disc(leaf, 0, 0.57, 0.105, 0.16, 0.055, 0xd4ddd0).rotation.x = Math.PI / 2;
        for (const turn of [0, Math.PI / 2])
          block(leaf, 0, 0.57, 0.14, 0.23, 0.025, 0.025, 0x456354).rotation.z = turn;
      }
    }
    block(this.root, 0, 1.13, 0, width + 0.3, 0.12, 0.22, 0x47695e);
    block(this.root, 0, 0.085, 0, width, 0.015, 0.18, 0x9bac9c);
    for (const face of [-1, 1]) {
      block(this.root, 0.7, 0.65, face * 0.15, 0.13, 0.23, 0.06, 0x2d4f46);
      const light = sphere(this.root, 0.7, 0.7, face * 0.19, 0.035, C.green);
      light.material = this.lamp;
    }
    const caption = label(this.root, 'MANAGER · ACCOUNTANT', 1.8, 0.23, {
      id: 'office:vault:access',
      kind: 'status',
      mount: 'surface',
      foreground: '#ffffff',
      background: '#365e50',
    });
    caption.object.position.set(0, 1.3, 0.12);
    caption.object.rotation.x = -0.55;
    this.setOpening(0);
  }
  private setOpening(value: number): void {
    this.leaves.forEach((leaf, i) => {
      leaf.position.x = (i ? 1 : -1) * (VAULT_DOOR.width / 400 + value * 0.65);
    });
  }
  update(state: GameState): void {
    const opening = state.office.doorOpen;
    this.setOpening(opening);
    this.lamp.color.setHex(opening >= 0.95 ? 0x61c78a : opening > 0 ? 0xe6bd5c : 0xb76249);
    this.root.userData.opening = opening;
    this.root.userData.allowedRoles = ['manager', 'accountant'];
  }
}
