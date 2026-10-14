// Copies the campus map data the apps share into the site.
//
//   node scripts/sync-campus-map.mjs [path/to/niu-app-android]
//
// The Android repo's app-content/campus-map is the source (map data ©
// OpenStreetMap contributors, ODbL; floor plans drawn from each building's
// evacuation signs). Run it after the map changes, then commit the copies.
import { copyFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '../niu-app-android');
const from = join(repo, 'app-content/campus-map');
const to = resolve('src/data/campus-map');
for (const name of readdirSync(from).filter((n) => n.endsWith('.json'))) {
  copyFileSync(join(from, name), join(to, name));
  console.log(name);
}
