import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoAlbersUsa } from 'd3-geo';

// State outlines (same file the website draws), parsed into rings for point-in-polygon tests.
const mapFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'us-states.json');
const STATES = JSON.parse(fs.readFileSync(mapFile, 'utf8')).states.map((s) => ({
  code: s.code, bbox: s.bbox,
  rings: s.d.split('Z').filter(Boolean).map((r) => r.split(/[ML]/).filter(Boolean).map((p) => p.split(' ').map(Number))),
}));
const inRing = (x, y, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Which state is the map point (x, y) in? Allows ~4px (a few km) of slack for beaches/coast. null = not US land. */
export function stateAt(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const s of STATES) {
    const [x0, y0, x1, y1] = s.bbox;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (s.rings.some((r) => inRing(x, y, r))) return s.code;
  }
  let best = null, bd = 16; // 4px squared
  for (const s of STATES) {
    const [x0, y0, x1, y1] = s.bbox;
    if (x < x0 - 4 || x > x1 + 4 || y < y0 - 4 || y > y1 + 4) continue;
    for (const r of s.rings) for (const [px, py] of r) { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = s.code; } }
  }
  return best;
}

// Same projection us-atlas bakes into web/us-states.json, so pins land on the right state.
const proj = geoAlbersUsa().scale(1300).translate([487.5, 305]);

/** lat/lng -> [x, y] in the 975x610 map frame (Alaska/Hawaii use the map insets). Only a bounding-box check:
 *  use stateAt() on the result to confirm it's really on US land. */
export function project(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const p = proj([lng, lat]);
  return p ? [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10] : null;
}

/** Map click (x, y in the 975x610 frame) -> {lat, lng}, or null if the click isn't on US land/insets. */
export function unproject(x, y) {
  const p = Number.isFinite(x) && Number.isFinite(y) ? proj.invert([x, y]) : null;
  return p ? { lat: Math.round(p[1] * 1e5) / 1e5, lng: Math.round(p[0] * 1e5) / 1e5 } : null;
}

/** Great-circle distance in metres (for duplicate-spot detection). */
export function distanceM(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
}
