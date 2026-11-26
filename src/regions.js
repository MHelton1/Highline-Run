// The regions of the map. Each one is the same kind of place (a paved loop, a dirt trail across the middle, two garages,
// pickup spots along the roads, camps out in the wild, six races, a town round each garage) built from its own ground, names and colours.
// Pure data (runs in node for tests).

export const REGIONS = {
  mountain: {
    name: 'Highline Mountains', short: 'the mountains', blurb: 'pine forest, snow on the peaks, a paved ring road and a dirt trail over the summit.', seed: 7, ground: 'mountain',
    ring: 'Ring Road', trail: 'Summit Trail',
    garages: ['Lowline Garage', 'Westgate Garage'], towns: ['Pinecrest', 'Cold Spring', 'Elkhorn'],
    outer: { name: 'Timberline Loop', spokes: [[0.22, 'North Pass Road'], [0.74, 'Old Mill Road', true], [0.92, 'Ridgeback Road']], sites: ['Ranger Lookout', 'Avalanche Shed', 'Fir Hollow Depot'] },
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
    garages: ['Dry Wash Garage', 'Junction Garage'], towns: ['Dry Wash', 'Copper Junction', 'Sandstone'],
    outer: { name: 'Frontier Loop', spokes: [[0.22, 'Arroyo Road'], [0.74, 'Gypsum Road', true], [0.92, 'Sunset Cutoff']], sites: ['Saltpan Depot', 'Coyote Tank', 'Railhead Yard'] },
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
  garages: ['Harbour Garage', 'Lighthouse Garage'], towns: ['Port Saltcliff', 'Kestrel Bay', 'Harrow Isle'],
  outer: { name: 'Island Loop', spokes: [[0.22, 'Causeway Road'], [0.74, 'Ferry Road', true], [0.88, 'Breakwater Road']], sites: ['Ferry Slip', 'Seal Rock', 'Net Shed'] },
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
// The bonus map (build 38): opens, with the hypercar, once every goal of the three regions above is done. It is laid
// out by hand (see `layout` in terrain.js): a banked 1.5 mile oval with a pit lane and a tunnel out to a town, and a
// 20 mile interstate east off the map to a second town. Inspired by big American speedways, copying none of them.
REGIONS.speedway = {
  name: 'Ironhorse Speedway', short: 'the speedway', seed: 59, ground: 'plains', layout: 'speedway', bonus: true,
  blurb: 'flat prairie round a banked 1.5 mile oval. Out through the pit tunnel to Trackside, then 20 miles of interstate east to Sundown Flats.',
  ring: 'Ironhorse Oval', trail: 'Ranch Road', pit: 'Pit Lane', access: 'Speedway Boulevard', interstate: 'Interstate 300', farTown: 'Sundown Flats',
  garages: ['Trackside Garage', 'Infield Garage'], towns: ['Trackside'],
  sites: ['Feed Store', 'Grain Elevator', 'Truck Stop', 'Cattle Pens', 'Water Tower'],
  trailSites: ['Windmill', 'Line Shack'],
  camps: ['Dry Tank', 'Mesquite Draw', 'Caliche Pit', 'Old Corral'],
  trialVia: 'Cattle Pens', trialGates: [[-300, 650], [-800, 300], [-1300, 600]],
  snow: false, trees: 'fir', treeCount: [700, 1000],
  surfName: ['Asphalt', 'Dirt', 'Grass', 'Rock', 'Snow'],
};
// the regions of the main game (goals, cups and "drive in every region" count these); BONUS_IDS open later
export const REGION_IDS = Object.keys(REGIONS).filter((r) => !REGIONS[r].bonus);
export const BONUS_IDS = Object.keys(REGIONS).filter((r) => REGIONS[r].bonus);
