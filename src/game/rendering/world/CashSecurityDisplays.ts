import { Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, Vector3 } from 'three';
import type { Scene } from 'three';
import { CASH_POINTS, cashPointOpen, cashLabelAmount } from '../../data/cashPoints';
import { GAME_CONFIG } from '../../data/gameConfig';
import type { CashPointId, GameState, Vec2 } from '../../types';
import { createCharacter } from '../Models';
import type { CharacterModel } from '../Models';
import { block, label, ring, PALETTE as C } from './WorldKit';
import type { WorldLabel } from './WorldKit';

const world = (point: Vec2, height = 0) =>
  new Vector3((point.x - 640) / 100, height, (point.y - 390) / 100);

export class CashSecurityDisplays {
  private readonly stacks = new Map<
    CashPointId,
    { root: Group; bills: Group[]; status: WorldLabel; spot: Mesh }
  >();
  private readonly capture: Mesh;
  private readonly net = new Group();
  private thief?: CharacterModel;
  private police?: CharacterModel;
  private trap?: Mesh;
  private bag?: Group;
  private previousThief: Vec2 = { x: 0, y: 0 };
  private previousPolice: Vec2 = { x: 0, y: 0 };

  constructor(
    private readonly scene: Scene,
    player: Group,
  ) {
    this.capture = ring(scene, GAME_CONFIG.netRadius / 100, 0xe68850, 0.035);
    this.capture.name = 'net-capture-area';
    this.capture.visible = false;
    this.net.name = 'player-catching-net';
    this.net.position.set(0.16, 0.2, 0.08);
    block(this.net, 0, 0.15, 0.11, 0.024, 0.44, 0.024, C.wood).rotation.x = 0.6;
    const head = new Group();
    head.position.set(0, 0.34, 0.26);
    head.rotation.x = -0.45;
    this.net.add(head);
    head.add(
      new Mesh(
        new RingGeometry(0.155, 0.175, 24),
        new MeshBasicMaterial({ color: C.cream, side: 2 }),
      ),
    );
    for (let index = -2; index <= 2; index++) {
      const offset = index * 0.052;
      const span = 2 * Math.sqrt(0.155 ** 2 - offset ** 2);
      block(head, offset, 0, 0, 0.006, span, 0.006, C.white);
      block(head, 0, offset, 0, span, 0.006, 0.006, C.white);
    }
    player.add(this.net);
    this.net.visible = false;
  }

  private createStack(id: CashPointId, position: Vec2): void {
    const root = new Group();
    root.name = `cash-stack-${id}`;
    root.position.copy(world(position));
    this.scene.add(root);
    block(root, 0, 0.08, 0, 0.76, 0.09, 0.48, C.wood);
    // Six reusable bundles in two short layers, regardless of the cash balance.
    const bills = Array.from({ length: 6 }, (_, index) => {
      const bundle = new Group();
      bundle.name = 'cash-bundle';
      bundle.position.set(((index % 3) - 1) * 0.24, 0.16 + Math.floor(index / 3) * 0.048, 0);
      block(bundle, 0, 0, 0, 0.21, 0.041, 0.19, 0x53a66a);
      block(bundle, 0, 0.003, 0, 0.045, 0.044, 0.194, C.cream);
      root.add(bundle);
      return bundle;
    });
    const spot = ring(root, GAME_CONFIG.cashCollectRadius / 100, C.gold, 0.035);
    spot.position.y = 0.075;
    const plaque = new Group();
    plaque.position.set(0, 0.2, 0.48);
    plaque.rotation.x = -0.55;
    root.add(plaque);
    block(plaque, 0, 0, 0, 1.32, 0.28, 0.03, C.green);
    const status = label(plaque, 'CASH $0', 1.26, 0.25, {
      id: `cash:${id}:status`,
      kind: 'status',
      mount: 'surface',
      foreground: '#ffffff',
      border: false,
    });
    status.object.position.set(0, 0, 0.018);
    this.stacks.set(id, { root, bills, status, spot });
  }

  update(state: GameState, time: number): void {
    for (const { id, position } of CASH_POINTS) {
      if (cashPointOpen(state, id) && !this.stacks.has(id)) this.createStack(id, position);
      const visual = this.stacks.get(id);
      if (!visual) continue;
      visual.root.visible = cashPointOpen(state, id);
      const cash = state.cashStacks[id];
      visual.bills.forEach((bill, index) => {
        bill.visible = index < Math.min(visual.bills.length, Math.ceil(cash.amount / 25));
      });
      visual.spot.visible = cash.amount > 0;
      visual.status.setText(
        cash.amount ? `PICK UP ${cashLabelAmount(cash.amount)}` : 'CASH $0',
        '#ffffff',
        '#168a65',
      );
    }
    const encounter = state.security.thief;
    const chasing = Boolean(
      encounter && ['APPROACHING', 'STEALING', 'FLEEING'].includes(encounter.phase),
    );
    this.capture.visible = chasing;
    this.net.visible = chasing;
    this.capture.position.copy(world(state.player, 0.09));
    (this.capture.material as MeshBasicMaterial).color.setHex(
      encounter &&
        state.netReady &&
        Math.hypot(state.player.x - encounter.x, state.player.y - encounter.y) <=
          GAME_CONFIG.netRadius
        ? C.green
        : 0xe68850,
    );
    if (encounter && !this.thief) {
      this.thief = createCharacter('customer', 0x3c4961);
      this.thief.group.name = 'cash-thief';
      block(this.thief.group, 0, 0.548, 0.072, 0.13, 0.037, 0.012, 0x273041);
      this.bag = new Group();
      this.bag.position.set(-0.13, 0.23, -0.12);
      block(this.bag, 0, 0, 0, 0.2, 0.22, 0.17, C.wood);
      block(this.bag, 0, 0.12, 0, 0.11, 0.035, 0.1, C.cream);
      this.thief.group.add(this.bag);
      this.trap = new Mesh(
        new SphereGeometry(0.31, 12, 8),
        new MeshBasicMaterial({ color: C.white, wireframe: true, transparent: true, opacity: 0.8 }),
      );
      this.trap.position.y = 0.32;
      this.trap.scale.y = 1.3;
      this.thief.group.add(this.trap);
      this.scene.add(this.thief.group);
    }
    if (this.thief) {
      this.thief.group.visible = Boolean(encounter);
      if (encounter) {
        this.thief.group.position.copy(world(encounter));
        const dx = encounter.x - this.previousThief.x,
          dy = encounter.y - this.previousThief.y;
        if (dx || dy) this.thief.setFacing(dx, dy);
        this.thief.animate(time, Math.hypot(dx, dy) > 0.01);
        this.trap!.visible = encounter.phase === 'CAUGHT';
        this.bag!.visible = encounter.stolen > 0;
        this.previousThief = { ...encounter };
      }
    }
    if (state.security.police && !this.police) {
      this.police = createCharacter('customer', 0x3b6ca0);
      this.police.group.name = 'police-officer';
      block(this.police.group, 0, 0.64, 0, 0.18, 0.065, 0.16, 0x294e79);
      block(this.police.group, 0, 0.613, 0.075, 0.17, 0.018, 0.11, 0x233041);
      block(this.police.group, 0, 0.27, 0.07, 0.16, 0.025, 0.025, 0x233041);
      block(this.police.group, -0.035, 0.38, 0.09, 0.035, 0.04, 0.012, C.gold);
      this.scene.add(this.police.group);
    }
    if (this.police) {
      const officer = state.security.police;
      this.police.group.visible = Boolean(officer);
      if (officer) {
        this.police.group.position.copy(world(officer));
        const dx = officer.x - this.previousPolice.x,
          dy = officer.y - this.previousPolice.y;
        if (dx || dy) this.police.setFacing(dx, dy);
        this.police.animate(time, Math.hypot(dx, dy) > 0.01);
        this.previousPolice = { ...officer };
      }
    }
  }
}
