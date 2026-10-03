import { CASH_POINTS, cashPointOpen, cashPosition } from '../data/cashPoints';
import { GAME_CONFIG } from '../data/gameConfig';
import type { GameEvent, GameState, Vec2 } from '../types';
import { EconomySystem } from './EconomySystem';
import { exitRoute, walkRoute } from './Navigation';

function move(actor: Vec2 & { path: Vec2[] }, delta: number, speed: number): void {
  let remaining = (speed * delta) / 1000;
  while (remaining > 0 && actor.path.length) {
    const target = actor.path[0];
    const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
    if (distance <= remaining) {
      Object.assign(actor, target);
      actor.path.shift();
      remaining -= distance;
    } else {
      actor.x += ((target.x - actor.x) * remaining) / distance;
      actor.y += ((target.y - actor.y) * remaining) / distance;
      remaining = 0;
    }
  }
}

/** A single persistent encounter: neglected cash, visible approach, theft, chase, then police. */
export class SecuritySystem {
  private previousPlayer: Vec2;
  private netReadyMs = 0;
  constructor(
    private readonly state: GameState,
    private readonly economy: EconomySystem,
    private readonly emit: (event: GameEvent) => void = () => {},
    private readonly clearLine: (from: Vec2, to: Vec2) => boolean = () => true,
  ) {
    this.previousPlayer = { ...state.player };
  }

  private flee(): void {
    const thief = this.state.security.thief!;
    thief.phase = 'FLEEING';
    thief.elapsed = 0;
    thief.path = exitRoute(this.state, thief);
  }

  private releaseGuard(): void {
    const worker = this.state.workers.find(({ id }) => id === this.state.security.guardId);
    if (worker) {
      worker.task = 'idle';
      worker.product = null;
      worker.machine = undefined;
      worker.path = [];
      worker.actionElapsed = 0;
    }
    this.state.security.guardId = null;
  }

  private finish(): void {
    this.releaseGuard();
    this.state.security.thief = null;
    this.state.security.police = null;
    this.state.security.cooldownMs = GAME_CONFIG.thiefCooldown;
  }

  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    // Moving into capture range is deliberate play. An idle avatar on the escape
    // route must not turn stolen cash into another automatic income source.
    const moved =
      Math.hypot(
        this.state.player.x - this.previousPlayer.x,
        this.state.player.y - this.previousPlayer.y,
      ) > 0.01;
    this.netReadyMs = moved ? 500 : Math.max(0, this.netReadyMs - deltaMs);
    this.previousPlayer = { ...this.state.player };
    this.state.netReady = this.netReadyMs > 0;
    const security = this.state.security;
    security.cooldownMs = Math.max(0, security.cooldownMs - deltaMs);
    if (!security.thief) {
      if (security.cooldownMs) return;
      const target = CASH_POINTS.filter(
        ({ id, position }) =>
          cashPointOpen(this.state, id) &&
          this.state.cashStacks[id].amount > 0 &&
          this.state.cashStacks[id].unattendedMs >= GAME_CONFIG.thiefDelay &&
          Math.hypot(this.state.player.x - position.x, this.state.player.y - position.y) > 180,
      ).sort(
        (a, b) =>
          this.state.cashStacks[b.id].unattendedMs - this.state.cashStacks[a.id].unattendedMs,
      )[0];
      if (!target) return;
      security.thief = {
        ...GAME_CONFIG.customerSpawn,
        phase: 'APPROACHING',
        target: target.id,
        stolen: 0,
        elapsed: 0,
        path: [
          { ...GAME_CONFIG.entranceOutside },
          { ...GAME_CONFIG.entrance },
          ...walkRoute(this.state, GAME_CONFIG.entrance, target.position),
        ],
      };
      this.emit({
        type: 'notice',
        text: `Thief approaching ${target.name}! Collect your cash.`,
        ...target.position,
      });
      return;
    }
    const thief = security.thief;
    const capturable = ['APPROACHING', 'STEALING', 'FLEEING'].includes(thief.phase);
    if (
      capturable &&
      this.state.netReady &&
      thief.y >= GAME_CONFIG.bounds.top &&
      thief.x >= GAME_CONFIG.bounds.left &&
      Math.hypot(this.state.player.x - thief.x, this.state.player.y - thief.y) <=
        GAME_CONFIG.netRadius &&
      this.clearLine(this.state.player, thief) &&
      this.economy.recover(thief.stolen)
    ) {
      const recovered = thief.stolen;
      security.recovered += recovered;
      thief.stolen = 0;
      thief.phase = 'CAUGHT';
      thief.elapsed = 0;
      thief.path = [];
      const guard = [...this.state.workers].sort(
        (a, b) =>
          Math.hypot(a.x - thief.x, a.y - thief.y) - Math.hypot(b.x - thief.x, b.y - thief.y),
      )[0];
      if (guard) {
        security.guardId = guard.id;
        guard.task = 'idle';
        guard.path = walkRoute(this.state, guard, { x: thief.x + 28, y: thief.y + 12 });
      }
      this.emit({
        type: 'money',
        text: recovered ? `Caught! Recovered $${recovered}` : 'Thief caught — cash safe!',
        ...thief,
      });
      return;
    }
    thief.elapsed += deltaMs;
    if (thief.phase === 'APPROACHING') {
      if (!this.state.cashStacks[thief.target].amount) {
        this.flee();
        return;
      }
      move(thief, deltaMs, 140);
      if (!thief.path.length) {
        thief.phase = 'STEALING';
        thief.elapsed = 0;
        this.emit({ type: 'notice', text: 'Thief at the cash! Run into net range.', ...thief });
      }
    } else if (thief.phase === 'STEALING') {
      const stack = this.state.cashStacks[thief.target];
      if (!stack.amount) {
        this.flee();
        return;
      }
      if (thief.elapsed >= GAME_CONFIG.thiefStealTime) {
        // An interruption can cost a portion, never an entire long session's takings.
        thief.stolen = Math.min(250, Math.max(1, Math.ceil(stack.amount * 0.25)));
        stack.amount -= thief.stolen;
        stack.unattendedMs = 0;
        this.emit({
          type: 'notice',
          text: `Stolen $${thief.stolen}! Sprint and catch the thief.`,
          ...cashPosition(thief.target),
        });
        this.flee();
      }
    } else if (thief.phase === 'FLEEING') {
      move(thief, deltaMs, GAME_CONFIG.thiefSpeed);
      if (!thief.path.length) {
        security.lost += thief.stolen;
        this.emit({
          type: 'notice',
          text: thief.stolen
            ? `Thief escaped with $${thief.stolen}. Collect cash sooner!`
            : 'Thief left empty-handed.',
          ...this.state.player,
        });
        this.finish();
      }
    } else if (thief.phase === 'CAUGHT') {
      const guard = this.state.workers.find(({ id }) => id === security.guardId);
      if (guard) {
        if (!guard.path.length && Math.hypot(guard.x - thief.x, guard.y - thief.y) > 40)
          guard.path = walkRoute(this.state, guard, { x: thief.x + 28, y: thief.y + 12 });
        move(guard, deltaMs, GAME_CONFIG.helperBaseSpeed * 1.1 ** this.state.upgrades.helperSpeed);
      }
      if (!security.police && thief.elapsed >= GAME_CONFIG.policeDelay) {
        security.police = {
          ...GAME_CONFIG.customerSpawn,
          path: walkRoute(this.state, GAME_CONFIG.customerSpawn, { x: thief.x + 25, y: thief.y }),
        };
      }
      if (security.police) {
        move(security.police, deltaMs, 240);
        if (!security.police.path.length) {
          thief.phase = 'ESCORTED';
          thief.elapsed = 0;
          security.police.path = exitRoute(this.state, security.police);
          this.releaseGuard();
          this.emit({
            type: 'notice',
            text: 'Police have the thief. Back to the market!',
            ...thief,
          });
        }
      }
    } else if (thief.phase === 'ESCORTED' && security.police) {
      move(security.police, deltaMs, 190);
      thief.x = security.police.x - 22;
      thief.y = security.police.y;
      if (!security.police.path.length) this.finish();
    }
  }
}
