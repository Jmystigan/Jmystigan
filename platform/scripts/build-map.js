// Generates web/us-states.json (SVG paths in a 975x610 Albers-USA frame, incl. AK/HI insets) from us-atlas.
// Run once (or after upgrading us-atlas): npm run build-map. The output is committed, so production needs no dev deps.
import fs from 'node:fs';
import { feature } from 'topojson-client';
const topo = JSON.parse(fs.readFileSync('node_modules/us-atlas/states-albers-10m.json', 'utf8'));
const ABBR = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
const r1 = (n) => Math.round(n * 10) / 10;
const out = [];
for (const f of feature(topo, topo.objects.states).features) {
  const name = f.properties.name, code = ABBR[name];
  if (!code) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = '', x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, best = null, bestArea = -1;
  for (const poly of polys) {
    poly.forEach((ring, ri) => {
      let last = '', seg = '';
      ring.forEach(([x, y], i) => {
        x = r1(x); y = r1(y); const k = `${x},${y}`;
        if (k === last) return; last = k;
        seg += `${seg ? 'L' : 'M'}${x} ${y}`;
        if (ri === 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      });
      d += seg + 'Z';
      if (ri === 0) { // biggest outer ring's bbox centre = label anchor
        const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
        const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        if (area > bestArea) { bestArea = area; best = [r1((Math.max(...xs) + Math.min(...xs)) / 2), r1((Math.max(...ys) + Math.min(...ys)) / 2)]; }
      }
    });
  }
  out.push({ code, name, d, bbox: [r1(x0), r1(y0), r1(x1), r1(y1)], label: best });
}
out.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync('web/us-states.json', JSON.stringify({ width: 975, height: 610, states: out }));
console.log(`wrote web/us-states.json: ${out.length} states, ${(fs.statSync('web/us-states.json').size / 1024).toFixed(0)} KB`);
