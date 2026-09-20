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
  manage:
    '<path d="M3 9h18v12H3V9Zm-1 0 3-6h14l3 6M8 21v-7h5v7M2 9a3 3 0 0 0 5 2 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 5-2"/>',
  shelf: '<path d="M4 3v18M20 3v18M3 10h18M3 19h18M8 4h4v6H8V4Zm6 9h4v6h-4v-6Z"/>',
  worker: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3M8 14v7m8-7v7"/>',
  heart: '<path d="M12 21 3 12a6 6 0 0 1 9-8 6 6 0 0 1 9 8l-9 9Z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8h-5a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9m3-11v14"/>',
  machine: '<path d="M4 7h16v14H4V7Zm3-4h10v4M8 11h8v5H8v-5Zm0 9h8"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  car: '<path d="M3 15V9l3-4h11l4 5v5H3Zm3 0v3m12-3v3M7 11h10M8 8h8"/><circle cx="7" cy="15" r="2"/><circle cx="17" cy="15" r="2"/>',
};

export function icon(name: string, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.leaf}</svg>`;
}

export function productIcon(id: string): string {
  const drawings: Record<string, string> = {
    tomato:
      '<ellipse cx="12" cy="14" rx="9" ry="8" fill="#e76850"/><path d="m12 9-6-4 5 1 2-4 1 5 5-1-5 4" fill="#4a8657"/><ellipse cx="8" cy="13" rx="2" ry="3" fill="#fba08d"/>',
    egg: '<path d="M20 15c0 5-3.5 7-8 7s-8-2-8-7C4 9 8 2 12 2s8 7 8 13Z" fill="#e1c38d"/><path d="M16 14c0 4-2 6-6 6-3 0-4-2-4-5C6 10 9 4 12 4s4 6 4 10Z" fill="#fff1d3"/>',
    corn: '<path d="M7 15C3 11 2 11 2 11c0 8 4 11 10 11s10-5 10-11c-4 1-6 4-7 6" fill="#7b9f52"/><ellipse cx="12" cy="10" rx="5" ry="9" fill="#efc54f"/><path d="M10 4v12m4-12v12M8 7h8m-8 4h8m-8 4h8" stroke="#ffe38b" stroke-width="1.4"/>',
    coffee:
      '<ellipse cx="12" cy="12" rx="7" ry="10" transform="rotate(35 12 12)" fill="#875540"/><path d="M16 4c-7 4-2 10-9 16" fill="none" stroke="#c49472" stroke-width="2.5" stroke-linecap="round"/><path d="M7 7 5 11" stroke="#ac7955" stroke-width="2" stroke-linecap="round"/>',
    carrot:
      '<path d="M10 6 19 12 6 22C2 24 2 20 4 17l6-11Z" fill="#f3943f"/><path d="m10 6 4 3-9 11Z" fill="#ffb552"/><path d="m14 8-1-6m3 7 4-7m-3 9 6-4" stroke="#569357" stroke-width="2.5" stroke-linecap="round"/><path d="m7 13 3 2m-5 2 2 1" stroke="#dc7436" stroke-width="1.4"/>',
    tomatoPaste:
      '<path d="M5 5h14v15c0 3-14 3-14 0V5Z" fill="#bbc7bc"/><path d="M5 8h14v11H5Z" fill="#e87960"/><ellipse cx="12" cy="5" rx="7" ry="3" fill="#e6e9db"/><ellipse cx="12" cy="5" rx="5" ry="1.5" fill="#b1bfae"/><circle cx="12" cy="14" r="4" fill="#fff0d1"/><circle cx="12" cy="14" r="2.7" fill="#d9614b"/><path d="m12 12-2-2 3 1 1-2" stroke="#5b9751" stroke-width="1.1" fill="none"/>',
    groundCoffee:
      '<path d="M6 2h12l-1 5 4 13c0 3-18 3-18 0L7 7 6 2Z" fill="#c79963"/><path d="M6 2h12v3H6Z" fill="#92704a"/><path d="M5 10h14v8H5Z" fill="#f8eacb"/><ellipse cx="12" cy="14" rx="2.8" ry="4" transform="rotate(25 12 14)" fill="#85553d"/><path d="m13 11-2 6" stroke="#d4ab7d" stroke-width="1"/>',
  };
  const drawing = drawings[id] ?? drawings.tomato;
  return `<svg class="produce-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${drawing}</svg>`;
}
