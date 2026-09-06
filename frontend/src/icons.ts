const paths: Record<string, string> = {
  leaf: '<path d="M20 4C12 2 3 6 4 13c1 6 8 7 12 3 3-3 4-7 4-12Z"/><path d="M4 21 15 10M8 17v-5m3 2h5"/>',
  sliders:
    '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4c-1-1 0-3 2-3h2a3 3 0 0 0 3-3 9 9 0 0 0-9-8Z"/><path d="M7 10h.01M10 6h.01M15 7h.01M6 14h.01"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  save: '<path d="M4 4h13l3 3v13H4ZM8 4v6h8V4M8 20v-7h8v7"/>',
  folder: '<path d="M3 7V5h7l2 3h9v12H3V7Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 3m0 3h.01"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v3"/>',
  redo: '<path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v3"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h5a3 3 0 1 1-3 3"/>',
  focus:
    '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/><circle cx="12" cy="12" r="3"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  orbit:
    '<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="3"/>',
  cube: '<path d="m12 3 9 5v9l-9 5-9-5V8Zm0 10 9-5M3 8l9 5v9m-5-17 10 6"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  sprout:
    '<path d="M12 22V12M12 13C3 14 3 8 3 6c7-1 9 3 9 7Zm0-3c0-7 5-8 9-8 1 7-3 9-9 8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
};
export function icon(name: string, className = ""): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.leaf}</svg>`;
}
export function plantIllustration(index: number): string {
  const color = ["#779277", "#b77654", "#d09aa7", "#6d8b78"][index % 4];
  if (index === 3)
    return `<svg viewBox="0 0 120 80" aria-hidden="true"><g stroke="${color}" stroke-linecap="round" fill="none"><path d="M59 74C48 53 52 32 61 12M58 68C38 58 29 40 28 25M59 68C75 52 87 36 85 19" stroke-width="2"/><path d="m54 54-12-7m11 0-11-9m12 0-9-9m12 1-9-9m11 0-4-8m-2 45 13-7m-13-1 15-9m-14 0 14-10m-12 2 12-11m-29 33-14-3m9-4-15-6m11-1-13-8m25 26-5-16m0 6-3-17m33 23 14-1m-9-6 15-3m-10-5 14-5m-21 19 1-16m7 5-1-18" stroke-width="3"/></g></svg>`;
  const circles = [
    [40, 35, 15],
    [57, 22, 17],
    [75, 30, 16],
    [85, 45, 13],
    [64, 43, 22],
    [38, 50, 14],
  ];
  return `<svg viewBox="0 0 120 80" aria-hidden="true"><path d="M61 72 59 34m1 21L43 39m17 17 17-19" stroke="#8b8069" stroke-width="3" fill="none" stroke-linecap="round"/><g fill="${color}" opacity=".85">${circles.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" opacity="${0.65 + i * 0.055}"/>`).join("")}</g><path d="M60 64V42m0 12-12-9m12 11 11-12" stroke="#66715a" opacity=".6" stroke-width="1.5" fill="none"/>${index === 2 ? '<g fill="#f6d8dc"><circle cx="48" cy="29" r="3"/><circle cx="76" cy="35" r="3"/><circle cx="58" cy="46" r="3"/><circle cx="39" cy="46" r="2"/></g>' : ""}</svg>`;
}
