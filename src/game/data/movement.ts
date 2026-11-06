import { GAME_CONFIG } from './gameConfig';
import type { GameState } from '../types';

export const CONTROL_ACTIONS = ['up', 'down', 'left', 'right', 'sprint'] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];
export type ControlBindings = Record<ControlAction, [string, string]>;
export const DEFAULT_BINDINGS: ControlBindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
};
export const WALK_SPEED = { min: 1, max: 1.35, default: 1, step: 0.05 } as const;
export const clampWalkSpeed = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(WALK_SPEED.max, Math.max(WALK_SPEED.min, Math.round(value * 20) / 20))
    : WALK_SPEED.default;
export const sprintDuration = (state: GameState): number =>
  GAME_CONFIG.sprintDuration + state.upgrades.sprint * 500;
export const validBinding = (code: unknown): code is string =>
  typeof code === 'string' &&
  /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Space|Enter|Backspace|Tab|Home|End|PageUp|PageDown|Insert|Delete|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Backquote|Minus|Equal)$/.test(
    code,
  );
export function validateBindings(value: unknown): ControlBindings {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_BINDINGS);
  const raw = value as Record<string, unknown>;
  const all: string[] = [];
  for (const action of CONTROL_ACTIONS) {
    const keys = raw[action];
    if (!Array.isArray(keys) || keys.length !== 2 || !keys.every(validBinding))
      return structuredClone(DEFAULT_BINDINGS);
    all.push(...keys);
  }
  // Restore a complete usable scheme rather than silently producing conflicting controls.
  if (new Set(all).size !== all.length) return structuredClone(DEFAULT_BINDINGS);
  return structuredClone(raw) as ControlBindings;
}
export const keyLabel = (code: string): string =>
  ({
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    Space: 'Space',
  })[code] ?? code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
export const heldAction = (
  keys: ReadonlySet<string>,
  bindings: ControlBindings,
  action: ControlAction,
): boolean => bindings[action].some((key) => keys.has(key));
