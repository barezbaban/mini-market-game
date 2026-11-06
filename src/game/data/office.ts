import type { GameState, OfficeState, Vec2 } from '../types';
import type { Rect } from './worldLayout';

export const OFFICE = {
  bounds: { left: -780, right: 20, top: 220, bottom: 1080 },
  entrance: { x: 20, y: 640 },
  marketing: { x: -580, y: 420 },
  accountant: { x: -170, y: 420 },
  manager: { x: -580, y: 885 },
  vault: { x: -170, y: 885 },
  accountantSeat: { x: -170, y: 470 },
  marketingSeat: { x: -580, y: 470 },
  managerSeat: { x: -580, y: 935 },
  vaultDeposit: { x: -205, y: 925 },
  vaultCollect: { x: -85, y: 875 },
  paperworkMs: 2400,
  pickupMs: 900,
  depositMs: 1000,
} as const;
export const OFFICE_ROOMS = [
  {
    id: 'marketing',
    title: 'MARKETING',
    left: -780,
    right: -390,
    top: 220,
    bottom: 580,
    color: 0xe5dfed,
  },
  {
    id: 'accountant',
    title: 'ACCOUNTANT',
    left: -310,
    right: 20,
    top: 220,
    bottom: 580,
    color: 0xd9e9e6,
  },
  {
    id: 'manager',
    title: 'MANAGER',
    left: -780,
    right: -390,
    top: 700,
    bottom: 1080,
    color: 0xeee1c9,
  },
  {
    id: 'vault',
    title: 'CASH VAULT',
    left: -310,
    right: 20,
    top: 700,
    bottom: 1080,
    color: 0xcbd8d8,
  },
] as const;
// Open center hall and real door gaps. All rooms are roofless and walkable.
export const OFFICE_WALLS: Rect[] = [
  { left: -790, right: 30, top: 210, bottom: 230 },
  { left: -790, right: 30, top: 1070, bottom: 1090 },
  { left: -790, right: -770, top: 220, bottom: 1080 },
  { left: 10, right: 30, top: 220, bottom: 580 },
  { left: 10, right: 30, top: 700, bottom: 1080 },
  { left: -400, right: -380, top: 220, bottom: 580 },
  { left: -320, right: -300, top: 220, bottom: 580 },
  { left: -400, right: -380, top: 700, bottom: 1080 },
  { left: -320, right: -300, top: 700, bottom: 1080 },
  ...[-780, -310].flatMap((left) =>
    [580, 700].flatMap((y) => [
      { left, right: left + 100, top: y - 10, bottom: y + 10 },
      { left: left + 220, right: left === -780 ? -390 : 20, top: y - 10, bottom: y + 10 },
    ]),
  ),
];
export const OFFICE_FURNITURE: Rect[] = [
  ...[OFFICE.marketing, OFFICE.accountant, OFFICE.manager].map((p) => ({
    left: p.x - 62,
    right: p.x + 62,
    top: p.y - 30,
    bottom: p.y + 27,
  })),
  { left: -755, right: -705, top: 275, bottom: 425 },
  { left: -70, right: -20, top: 270, bottom: 385 },
  { left: -755, right: -705, top: 790, bottom: 960 },
  { left: -285, right: -35, top: 980, bottom: 1050 },
];
export const accountantCapacity = (state: GameState): number => state.upgrades.accountant * 100;
export const accountantSpeed = (state: GameState): number =>
  140 * (1 + Math.max(0, state.upgrades.accountant - 1) * 0.025);
export function createOfficeState(): OfficeState {
  return {
    vault: 0,
    doorOpen: 0,
    collectionArmed: true,
    accountant: {
      ...OFFICE.accountantSeat,
      phase: 'DESK',
      carrying: 0,
      target: null,
      lastTarget: null,
      path: [],
      elapsed: 0,
    },
  };
}

export type VaultAccess = 'public' | 'manager' | 'accountant';
export const VAULT_DOOR = {
  x: -150,
  y: 700,
  width: 120,
  openingMs: 450,
  barrier: { left: -210, right: -90, top: 690, bottom: 710 },
} as const;
export const VAULT_RESTRICTED: Rect = { left: -320, right: 30, top: 690, bottom: 1090 };
export const nearVaultDoor = (p: Vec2): boolean =>
  Math.abs(p.x - VAULT_DOOR.x) <= 100 && Math.abs(p.y - VAULT_DOOR.y) <= 125;
export const vaultDoorRequested = (state: GameState): boolean =>
  nearVaultDoor(state.player) ||
  (state.upgrades.accountant > 0 && nearVaultDoor(state.office.accountant));
