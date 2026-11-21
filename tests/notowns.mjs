// Runs another test with the towns taken off the map, to show a driving change is only the buildings in the way.
// usage: TEST=tests/cars.mjs node tests/notowns.mjs [that test's own arguments]
import { REGIONS } from '../src/regions.js';
import { pathToFileURL } from 'url';
for (const r of Object.values(REGIONS)) delete r.towns;
await import(pathToFileURL(process.env.TEST).href);
