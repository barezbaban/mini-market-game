/** Camera magnification only: does not increase render resolution or texture sizes. */
export const CAMERA_ZOOM = { min: 0.75, max: 1.75, step: 0.05, default: 1 } as const;

export function clampCameraZoom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(CAMERA_ZOOM.min, Math.min(CAMERA_ZOOM.max, value))
    : CAMERA_ZOOM.default;
}
