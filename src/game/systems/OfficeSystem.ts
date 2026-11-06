import {
  OFFICE,
  accountantCapacity,
  accountantSpeed,
  createOfficeState,
  VAULT_DOOR,
  vaultDoorRequested,
} from '../data/office';
import { CASH_POINTS, cashPointOpen, cashPosition } from '../data/cashPoints';
import type { AccountantPhase, CashPointId, GameEvent, GameState, Vec2 } from '../types';
import { canStand, clearWalk, clearMovement, walkRoute } from './Navigation';

/** Moves existing revenue between register, carried bag and vault. Never earns or spends it. */
export class OfficeSystem {
  constructor(
    private readonly state: GameState,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}
  private go(phase: AccountantPhase, destination: Vec2): void {
    const a = this.state.office.accountant;
    a.phase = phase;
    a.elapsed = 0;
    a.path = walkRoute(this.state, a, destination, 'accountant');
  }
  private walk(deltaMs: number): boolean {
    const a = this.state.office.accountant;
    let distance = (accountantSpeed(this.state) * deltaMs) / 1000;
    while (a.path.length && distance > 0) {
      const p = a.path[0],
        d = Math.hypot(p.x - a.x, p.y - a.y);
      const fraction = d ? Math.min(1, distance / d) : 1;
      const next = { x: a.x + (p.x - a.x) * fraction, y: a.y + (p.y - a.y) * fraction };
      if (!clearMovement(this.state, a, next, 'accountant')) break;
      if (d <= distance) {
        a.x = p.x;
        a.y = p.y;
        a.path.shift();
        distance -= d;
      } else {
        a.x += ((p.x - a.x) / d) * distance;
        a.y += ((p.y - a.y) / d) * distance;
        distance = 0;
      }
    }
    return a.path.length === 0;
  }
  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    const direction = vaultDoorRequested(this.state) ? 1 : -1;
    this.state.office.doorOpen = Math.max(
      0,
      Math.min(1, this.state.office.doorOpen + (direction * deltaMs) / VAULT_DOOR.openingMs),
    );
    if (!this.state.upgrades.accountant) return;
    const a = this.state.office.accountant;
    a.elapsed += deltaMs;
    switch (a.phase) {
      case 'DESK': {
        if (a.carrying) {
          this.go('TO_DESK', OFFICE.accountantSeat);
          break;
        }
        if (a.elapsed < 1800) break;
        a.elapsed = 0;
        const candidates = CASH_POINTS.filter(
          (p) => cashPointOpen(this.state, p.id) && this.state.cashStacks[p.id].amount > 0,
        );
        const lastIndex = CASH_POINTS.findIndex((p) => p.id === a.lastTarget);
        const turn = (id: CashPointId) =>
          (CASH_POINTS.findIndex((p) => p.id === id) - lastIndex + CASH_POINTS.length - 1) %
          CASH_POINTS.length;
        candidates.sort((x, y) =>
          lastIndex >= 0
            ? turn(x.id) - turn(y.id)
            : this.state.cashStacks[y.id].unattendedMs - this.state.cashStacks[x.id].unattendedMs,
        );
        const target = candidates[0];
        if (target) {
          a.target = target.id;
          this.go('TO_CASH', target.position);
        }
        break;
      }
      case 'TO_CASH':
        if (!a.target || !this.state.cashStacks[a.target].amount) {
          a.target = null;
          this.go('RETURNING', OFFICE.accountantSeat);
          break;
        }
        if (
          this.walk(deltaMs) &&
          Math.hypot(a.x - cashPosition(a.target).x, a.y - cashPosition(a.target).y) < 2
        ) {
          a.phase = 'PICKUP';
          a.elapsed = 0;
        }
        break;
      case 'PICKUP': {
        if (a.elapsed < OFFICE.pickupMs) break;
        const stack = a.target && this.state.cashStacks[a.target];
        if (stack) {
          a.carrying = Math.min(stack.amount, accountantCapacity(this.state));
          stack.amount -= a.carrying;
          if (!stack.amount) stack.unattendedMs = 0;
          a.lastTarget = a.target;
        }
        a.target = null;
        this.go(a.carrying ? 'TO_DESK' : 'RETURNING', OFFICE.accountantSeat);
        break;
      }
      case 'TO_DESK':
      case 'RETURNING':
        if (
          this.walk(deltaMs) &&
          Math.hypot(a.x - OFFICE.accountantSeat.x, a.y - OFFICE.accountantSeat.y) < 2
        ) {
          a.phase = a.carrying ? 'PAPERWORK' : 'DESK';
          a.elapsed = 0;
        }
        break;
      case 'PAPERWORK':
        if (a.elapsed >= OFFICE.paperworkMs) this.go('TO_VAULT', OFFICE.vaultDeposit);
        break;
      case 'TO_VAULT':
        if (
          this.walk(deltaMs) &&
          Math.hypot(a.x - OFFICE.vaultDeposit.x, a.y - OFFICE.vaultDeposit.y) < 2
        ) {
          a.phase = 'DEPOSIT';
          a.elapsed = 0;
        }
        break;
      case 'DEPOSIT':
        if (a.elapsed < OFFICE.depositMs) break;
        if (Number.isSafeInteger(this.state.office.vault + a.carrying)) {
          this.state.office.vault += a.carrying;
          if (a.carrying)
            this.emit({
              type: 'notice',
              text: `Vault deposit: $${a.carrying}`,
              ...OFFICE.vaultDeposit,
            });
          a.carrying = 0;
          this.go('RETURNING', OFFICE.accountantSeat);
        }
        break;
    }
  }
}

export function restoreOffice(raw: unknown, state: GameState): void {
  const obj = (v: unknown): Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const count = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n)
      ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n)))
      : 0;
  const source = obj(raw),
    saved = obj(source.accountant);
  state.office = createOfficeState();
  state.office.vault = count(source.vault);
  state.office.doorOpen =
    typeof source.doorOpen === 'number' && Number.isFinite(source.doorOpen)
      ? Math.max(0, Math.min(1, source.doorOpen))
      : 0;
  state.office.collectionArmed = source.collectionArmed !== false;
  const a = state.office.accountant;
  a.carrying = count(saved.carrying);
  const validPoint = (id: unknown): id is CashPointId =>
    CASH_POINTS.some((p) => p.id === id) && cashPointOpen(state, id as CashPointId);
  a.lastTarget = validPoint(saved.lastTarget) ? saved.lastTarget : null;
  if (
    typeof saved.x === 'number' &&
    typeof saved.y === 'number' &&
    Number.isFinite(saved.x) &&
    Number.isFinite(saved.y) &&
    canStand(state, { x: saved.x, y: saved.y }, 'accountant')
  ) {
    a.x = saved.x;
    a.y = saved.y;
  }
  const phases: AccountantPhase[] = [
    'DESK',
    'TO_CASH',
    'PICKUP',
    'TO_DESK',
    'PAPERWORK',
    'TO_VAULT',
    'DEPOSIT',
    'RETURNING',
  ];
  a.phase = phases.includes(saved.phase as AccountantPhase)
    ? (saved.phase as AccountantPhase)
    : 'DESK';
  a.target = validPoint(saved.target) ? saved.target : null;
  if (a.carrying && !['TO_DESK', 'PAPERWORK', 'TO_VAULT', 'DEPOSIT'].includes(a.phase))
    a.phase = 'TO_DESK';
  if (!a.carrying && ['TO_DESK', 'PAPERWORK', 'TO_VAULT', 'DEPOSIT'].includes(a.phase))
    a.phase = 'RETURNING';
  if (['TO_CASH', 'PICKUP'].includes(a.phase) && !a.target) a.phase = 'RETURNING';
  const destination =
    ['TO_CASH', 'PICKUP'].includes(a.phase) && a.target
      ? cashPosition(a.target)
      : ['TO_VAULT', 'DEPOSIT'].includes(a.phase)
        ? OFFICE.vaultDeposit
        : OFFICE.accountantSeat;
  if (
    ['DESK', 'PAPERWORK', 'DEPOSIT', 'PICKUP'].includes(a.phase) &&
    Math.hypot(a.x - destination.x, a.y - destination.y) > 2
  )
    a.phase = a.carrying
      ? ['DEPOSIT'].includes(a.phase)
        ? 'TO_VAULT'
        : 'TO_DESK'
      : a.target
        ? 'TO_CASH'
        : 'RETURNING';
  a.elapsed = Math.min(count(saved.elapsed), OFFICE.paperworkMs);
  a.path = ['TO_CASH', 'TO_DESK', 'TO_VAULT', 'RETURNING'].includes(a.phase)
    ? walkRoute(state, a, destination, 'accountant')
    : [];
  if (a.path.some((p, i) => !clearWalk(state, i ? a.path[i - 1] : a, p, 'accountant'))) a.path = [];
  // A damaged or edited save must not strand legitimate money when staff are absent.
  if (
    !state.upgrades.accountant &&
    a.carrying &&
    Number.isSafeInteger(state.office.vault + a.carrying)
  ) {
    state.office.vault += a.carrying;
    a.carrying = 0;
    a.phase = 'DESK';
  }
}
