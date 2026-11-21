// The regions of the map. Each one is the same kind of place (a paved loop, a dirt trail across the middle, two garages,
// pickup spots along the roads, camps out in the wild, six races) built from its own ground, names and colours.
// Pure data (runs in node for tests).

export const REGIONS = {
  mountain: {
    name: 'Highline Mountains', short: 'the mountains', blurb: 'pine forest, snow on the peaks, a paved ring road and a dirt trail over the summit.', seed: 7, ground: 'mountain',
    ring: 'Ring Road', trail: 'Summit Trail',
    garages: ['Lowline Garage', 'Westgate Garage'],
    sites: ["Miller's Pull-Out", 'Cinder Gap', 'Larch Bend', 'Tollhouse Ruin', 'Kettle Bridge'],
    trailSites: ['Switchback Shed', 'Saddle Cairn'],
    camps: ['Old Quarry', 'Tarn Camp', 'Goat Ledge', 'Sawmill Flat'],
    trialVia: 'Cinder Gap', trialGates: [[-350, 280], [60, 280], [110, 600]],
    snow: true, trees: 'fir', treeCount: [5500, 7500],
    surfName: ['Asphalt', 'Dirt', 'Grass', 'Rock', 'Snow'],
  },
  desert: {
    name: 'Redrock Basin', short: 'the desert', blurb: 'red rock mesas, open sand and dunes, a fast paved loop and a dirt trail through a canyon.', seed: 23, ground: 'desert',
    ring: 'Basin Loop', trail: 'Canyon Trail', trailBow: -250,
    garages: ['Dry Wash Garage', 'Junction Garage'],
    sites: ['Ocotillo Stop', 'Rattler Bend', 'Dust Devil Diner', 'Old Mine Spur', 'Windmill Flats'],
    trailSites: ['Narrows Hut', 'Slickrock Cache'],
    camps: ['Bone Dry Well', 'Copper Camp', 'Hoodoo Ridge', 'Lost Wagon'],
    trialVia: 'Rattler Bend', trialGates: [[-350, 280], [60, 280], [110, 600]],
    snow: false, trees: 'cactus', treeCount: [2600, 3400],
    surfName: ['Asphalt', 'Dirt', 'Sand', 'Rock', 'Snow'],
  },
};
REGIONS.coast = {
  name: 'Saltcliff Coast', short: 'the coast', seed: 41, ground: 'coast', sea: 20,
  blurb: 'green headlands, sandy beaches and sea cliffs, a coast road and a dirt trail over the ridge. Keep out of the water.',
  ring: 'Coast Road', trail: 'Ridge Trail',
  garages: ['Harbour Garage', 'Lighthouse Garage'],
  sites: ['Fish Market', 'Gull Point', 'Driftwood Bay', 'Old Pier', 'Smugglers Cove'],
  trailSites: ['Shepherd Hut', 'Ridge Beacon'],
  camps: ['Wreck Beach', 'Sea Cave', 'Bracken Hollow', 'Signal Hill'],
  trialVia: 'Gull Point', trialGates: [[-350, 280], [60, 280], [110, 600]],
  // rivers, each from its mouth out in the sea up into the hills (x, z in metres); the roads cross them on bridges
  rivers: [{ name: 'Gullwater', pts: [[-800, -1120], [-648, -876], [-556, -624], [-488, -376], [-400, -250]] },
    { name: 'Saltburn', pts: [[1380, -340], [1064, -336], [824, -356], [584, -416], [384, -488]] }],
  snow: false, trees: 'fir', treeCount: [4000, 5500],
  surfName: ['Asphalt', 'Dirt', 'Grass', 'Rock', 'Snow'],
};
export const REGION_IDS = Object.keys(REGIONS);
