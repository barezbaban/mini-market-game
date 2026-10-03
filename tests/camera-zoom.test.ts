import { describe, expect, it } from 'vitest';
import { CAMERA_ZOOM, clampCameraZoom } from '../src/game/data/cameraConfig';
import { createInitialState, SaveSystem, validateSave } from '../src/game/systems/SaveSystem';

describe('saved camera zoom', () => {
  it('keeps the existing view for new players and older saves', () => {
    expect(createInitialState().cameraZoom).toBe(CAMERA_ZOOM.default);
    const legacy = { ...createInitialState(), money: 1234, xp: 321 } as Record<string, unknown>;
    delete legacy.cameraZoom;
    for (const version of [1, 2]) {
      const restored = validateSave({ ...legacy, version })!;
      expect(restored.cameraZoom).toBe(1);
      expect(restored.money).toBe(1234);
      expect(restored.xp).toBe(321);
    }
  });

  it.each([undefined, null, '150', {}, NaN, Infinity, -Infinity])(
    'safely defaults an invalid zoom: %s',
    (value) => {
      expect(clampCameraZoom(value)).toBe(1);
      expect(validateSave({ ...createInitialState(), cameraZoom: value })!.cameraZoom).toBe(1);
    },
  );

  it.each([
    [-100, 0.75],
    [0, 0.75],
    [0.5, 0.75],
    [0.75, 0.75],
    [1, 1],
    [1.25, 1.25],
    [1.75, 1.75],
    [2, 1.75],
    [100000, 1.75],
  ])('bounds zoom %s to %s', (value, expected) => {
    expect(clampCameraZoom(value)).toBe(expected);
    expect(validateSave({ ...createInitialState(), cameraZoom: value })!.cameraZoom).toBe(expected);
  });

  it('round-trips a preference through the actual save repository', () => {
    let stored: string | null = null;
    const saves = new SaveSystem({
      read: () => stored,
      write: (value) => {
        stored = value;
      },
      clear: () => {
        stored = null;
      },
    });
    const state = createInitialState();
    state.cameraZoom = 1.5;
    state.money = 987;
    expect(saves.save(state)).toBe(true);
    expect(saves.load()).toMatchObject({ cameraZoom: 1.5, money: 987 });
    expect(saves.reset()).toBe(true);
    expect(saves.load().cameraZoom).toBe(CAMERA_ZOOM.default);
  });
});
