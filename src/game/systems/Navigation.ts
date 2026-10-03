import { GAME_CONFIG } from '../data/gameConfig';
import { crossesRect, worldSolids } from '../data/worldLayout';
import type { Rect } from '../data/worldLayout';
import type { GameState, Vec2 } from '../types';

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
let cached: { key: string; solids: Rect[]; nodes: Vec2[]; edges: number[][] } | null = null;
function graph(state: GameState) {
  const key = [
    state.upgrades.expansion,
    state.upgrades.secondCashier,
    state.upgrades.driveThrough,
    state.upgrades.pasteMachine > 0,
    state.upgrades.coffeeMachine > 0,
    state.upgrades.dairyMachine > 0,
    state.upgrades.grillMachine > 0,
  ].join(':');
  if (cached?.key === key) return cached;
  const solids = worldSolids(state);
  const nodes = solids
    .flatMap((r) => [
      { x: r.left - 10, y: r.top - 10 },
      { x: r.right + 10, y: r.top - 10 },
      { x: r.left - 10, y: r.bottom + 10 },
      { x: r.right + 10, y: r.bottom + 10 },
    ])
    .filter(
      (p) =>
        p.x >= GAME_CONFIG.bounds.left &&
        p.x <= GAME_CONFIG.bounds.right &&
        p.y >= GAME_CONFIG.bounds.top &&
        p.y <= GAME_CONFIG.bounds.bottom &&
        !solids.some((r) => crossesRect(p, p, r)),
    );
  const edges = nodes.map(() => [] as number[]);
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++)
      if (!solids.some((r) => crossesRect(nodes[a], nodes[b], r))) {
        edges[a].push(b);
        edges[b].push(a);
      }
  cached = { key, solids, nodes, edges };
  return cached;
}
export function canStand(state: GameState, p: Vec2): boolean {
  const b = GAME_CONFIG.bounds;
  return (
    p.x >= b.left &&
    p.x <= b.right &&
    p.y >= b.top &&
    p.y <= b.bottom &&
    !graph(state).solids.some((r) => crossesRect(p, p, r))
  );
}
export const clearWalk = (state: GameState, from: Vec2, to: Vec2): boolean =>
  !graph(state).solids.some((r) => crossesRect(from, to, r));

/** A new department can add furniture across an actor's already-planned route. */
export function repairWalk(state: GameState, actor: Vec2 & { path: Vec2[] }): void {
  let changed = false;
  if (!clearWalk(state, actor, actor)) {
    search: for (let radius = 10; radius <= 200; radius += 10) {
      for (let i = 0; i < 16; i++) {
        const candidate = {
          x: actor.x + Math.cos((i * Math.PI) / 8) * radius,
          y: actor.y + Math.sin((i * Math.PI) / 8) * radius,
        };
        if (canStand(state, candidate)) {
          Object.assign(actor, candidate);
          changed = true;
          break search;
        }
      }
    }
  }
  let from: Vec2 = actor;
  for (const point of actor.path) {
    if (!clearWalk(state, from, point)) changed = true;
    from = point;
  }
  if (changed && actor.path.length) actor.path = walkRoute(state, actor, actor.path.at(-1)!);
}

/** Cached furniture visibility graph. A route is planned only when a destination changes. */
export function walkRoute(state: GameState, from: Vec2, to: Vec2): Vec2[] {
  const g = graph(state);
  const clear = (a: Vec2, b: Vec2) => !g.solids.some((r) => crossesRect(a, b, r));
  if (clear(from, to)) return [{ ...to }];
  const nodes = [...g.nodes, { ...from }, { ...to }];
  const start = nodes.length - 2,
    finish = nodes.length - 1;
  const edges = g.edges.map((list) => [...list]);
  edges.push([], []);
  for (const endpoint of [start, finish])
    for (let i = 0; i < g.nodes.length; i++)
      if (clear(nodes[endpoint], nodes[i])) {
        edges[endpoint].push(i);
        edges[i].push(endpoint);
      }
  const costs = nodes.map(() => Infinity),
    previous = nodes.map(() => -1);
  const visited = new Set<number>();
  costs[start] = 0;
  while (visited.size < nodes.length) {
    let next = -1;
    for (let i = 0; i < nodes.length; i++)
      if (
        !visited.has(i) &&
        Number.isFinite(costs[i]) &&
        (next < 0 || costs[i] + distance(nodes[i], to) < costs[next] + distance(nodes[next], to))
      )
        next = i;
    if (next < 0) return []; // Never fall back to walking through a wall.
    if (next === finish) {
      const path: Vec2[] = [];
      for (let i = finish; i !== start; i = previous[i]) path.unshift({ ...nodes[i] });
      return path;
    }
    visited.add(next);
    for (const i of edges[next]) {
      const cost = costs[next] + distance(nodes[next], nodes[i]);
      if (cost < costs[i]) {
        costs[i] = cost;
        previous[i] = next;
      }
    }
  }
  return [];
}
export function exitRoute(state: GameState, from: Vec2): Vec2[] {
  return [
    ...walkRoute(state, from, GAME_CONFIG.entrance),
    { ...GAME_CONFIG.entranceOutside },
    { ...GAME_CONFIG.cartStation },
    { ...GAME_CONFIG.customerExit },
  ];
}
