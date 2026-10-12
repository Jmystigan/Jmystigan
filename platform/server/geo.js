import { geoAlbersUsa } from 'd3-geo';

// Same projection us-atlas bakes into web/us-states.json, so pins land on the right state.
const proj = geoAlbersUsa().scale(1300).translate([487.5, 305]);

/** lat/lng -> [x, y] in the 975x610 map frame, or null outside the US (Alaska/Hawaii use the map insets). */
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
