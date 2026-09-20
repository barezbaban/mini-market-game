const paths: Record<string, string> = {
  basket: '<path d="m7 9 3-6m7 6-3-6M4 9h16l-2 11H6L4 9Zm5 4v3m6-3v3"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  settings:
    '<path d="m10 3-1 3-3 1-3 3v4l3 3 3 1 1 3h4l1-3 3-1 3-3v-4l-3-3-3-1-1-3h-4Z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 2m0 3v.1"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m7 4 14 8-14 8V4Z"/>',
  leaf: '<path d="M19 3C7 2 2 8 6 15s15 4 13-12ZM5 21 16 8"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
};

export function icon(name: string, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.leaf}</svg>`;
}

export function productIcon(id: string): string {
  const drawing =
    id === 'tomato'
      ? '<ellipse cx="12" cy="14" rx="9" ry="8" fill="#e76850"/><path d="m12 9-6-4 5 1 2-4 1 5 5-1-5 4" fill="#4a8657"/><ellipse cx="8" cy="13" rx="2" ry="3" fill="#fba08d"/>'
      : id === 'egg'
        ? '<path d="M20 15c0 5-3.5 7-8 7s-8-2-8-7C4 9 8 2 12 2s8 7 8 13Z" fill="#e1c38d"/><path d="M16 14c0 4-2 6-6 6-3 0-4-2-4-5C6 10 9 4 12 4s4 6 4 10Z" fill="#fff1d3"/>'
        : '<path d="M7 15C3 11 2 11 2 11c0 8 4 11 10 11s10-5 10-11c-4 1-6 4-7 6" fill="#7b9f52"/><ellipse cx="12" cy="10" rx="5" ry="9" fill="#efc54f"/><path d="M10 4v12m4-12v12M8 7h8m-8 4h8m-8 4h8" stroke="#ffe38b" stroke-width="1.4"/>';
  return `<svg class="produce-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${drawing}</svg>`;
}
