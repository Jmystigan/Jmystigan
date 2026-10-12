// Demo parks so the UI has something to show. Replace with real ones via the admin panel.
import { db } from '../server/db.js';
const demo = [
  ['demo-downtown-plaza', 'Downtown Plaza (demo)', 'Sampleville', 'CA', 34.05, -118.24, 'in_game', null, 'Demo park: ledges, a rail, and a bowl.'],
  ['demo-riverside-bowl', 'Riverside Bowl (demo)', 'Exampleton', 'TX', 30.27, -97.74, 'scheduled', '2026-12-05', 'Demo: developer visit scheduled.'],
  ['demo-lakeside-flow', 'Lakeside Flow Park (demo)', 'Testburg', 'FL', 28.54, -81.38, 'planned', null, 'Demo: planned stop on the tour.'],
];
const ins = db.prepare('INSERT OR IGNORE INTO parks (slug,name,city,state,lat,lng,status,visit_date,description) VALUES (?,?,?,?,?,?,?,?,?)');
for (const p of demo) ins.run(...p);
console.log('Seeded demo parks');
