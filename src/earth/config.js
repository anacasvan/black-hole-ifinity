// Gameplay tuning: absorbable kinds, growth curve and progression tiers.
// Pure JS (testable in Node).

// Radius grows with the cube root of the absorbed mass: continuous, monotone
// and with no upper bound. Every doubling of the radius needs 8x the mass.
export const R0 = 0.3;
export const radiusForMass = m => R0 * Math.cbrt(1 + Math.max(0, m));
export const massForRadius = r => Math.max(0, (r / R0) ** 3 - 1);

// Mass of an object scales with the cube of the hole radius it requires, so
// the pace stays self-similar at every scale (roughly 120-200 objects of the
// current size class to double the radius).
const MASS_K = 4;

// needR: minimum hole radius able to swallow the object.
// anchor: pull acceleration (m/s^2) the object resists before it starts to give way.
// dims: [width, height, length] in metres, used by the physics box.
const defs = {
  leaf:        { label: 'Foglie', tier: 1, needR: 0.2, anchor: 0, dims: [0.16, 0.03, 0.12], cat: 'tiny' },
  litter:      { label: 'Rifiuti', tier: 1, needR: 0.23, anchor: 0, dims: [0.12, 0.14, 0.12], cat: 'tiny' },

  cone:        { label: 'Coni', tier: 2, needR: 0.42, anchor: 1.2, dims: [0.36, 0.7, 0.36], cat: 'prop' },
  flowerpot:   { label: 'Vasi', tier: 2, needR: 0.45, anchor: 2, dims: [0.5, 0.75, 0.5], cat: 'prop' },
  bin:         { label: 'Cestini', tier: 2, needR: 0.52, anchor: 2.2, dims: [0.52, 1.0, 0.52], cat: 'prop' },
  hydrant:     { label: 'Idranti', tier: 2, needR: 0.5, anchor: 6, dims: [0.42, 0.8, 0.42], cat: 'prop' },
  bollard:     { label: 'Paletti', tier: 2, needR: 0.46, anchor: 6, dims: [0.24, 0.95, 0.24], cat: 'prop', tall: true },
  sign:        { label: 'Cartelli', tier: 2, needR: 0.6, anchor: 5, dims: [0.62, 2.6, 0.12], cat: 'prop', tall: true },

  bench:       { label: 'Panchine', tier: 3, needR: 1.0, anchor: 4, dims: [1.8, 0.85, 0.62], cat: 'prop' },
  bicycle:     { label: 'Biciclette', tier: 3, needR: 0.95, anchor: 1.4, dims: [0.56, 1.05, 1.75], cat: 'vehicle' },
  ped:         { label: 'Pedoni', tier: 3, needR: 0.78, anchor: 3.0, dims: [0.48, 1.75, 0.3], cat: 'ped' },
  bush:        { label: 'Cespugli', tier: 3, needR: 0.9, anchor: 4.5, dims: [1.4, 1.0, 1.4], cat: 'prop', dens: 0.5 },
  fence:       { label: 'Recinzioni', tier: 3, needR: 1.05, anchor: 3.5, dims: [2.0, 1.0, 0.1], cat: 'prop', dens: 0.4 },
  cafe:        { label: 'Tavolini', tier: 3, needR: 1.1, anchor: 2.4, dims: [1.8, 2.3, 1.8], cat: 'prop', dens: 0.45 },
  cart:        { label: 'Carrelli', tier: 3, needR: 0.8, anchor: 1, dims: [0.6, 1.0, 0.95], cat: 'prop', dens: 0.5 },

  scooter:     { label: 'Scooter', tier: 4, needR: 1.15, anchor: 3, dims: [0.7, 1.15, 1.8], cat: 'vehicle' },
  motorbike:   { label: 'Motociclette', tier: 4, needR: 1.3, anchor: 3, dims: [0.8, 1.2, 2.1], cat: 'vehicle' },
  lamp:        { label: 'Lampioni', tier: 4, needR: 1.2, anchor: 6.5, dims: [0.36, 6.2, 0.36], cat: 'prop', tall: true, dens: 0.6 },
  tlight:      { label: 'Semafori', tier: 4, needR: 1.4, anchor: 7, dims: [0.4, 4.4, 0.4], cat: 'prop', tall: true, dens: 0.6 },
  hedge:       { label: 'Siepi', tier: 4, needR: 1.25, anchor: 5, dims: [2.0, 1.3, 0.85], cat: 'prop', dens: 0.5 },
  dumpster:    { label: 'Cassonetti', tier: 4, needR: 1.35, anchor: 4, dims: [1.9, 1.35, 1.1], cat: 'prop' },

  car_city:    { label: 'Utilitarie', tier: 5, needR: 1.95, anchor: 4.5, dims: [1.68, 1.5, 3.65], cat: 'vehicle' },
  car_sedan:   { label: 'Berline', tier: 5, needR: 2.25, anchor: 4.5, dims: [1.82, 1.45, 4.65], cat: 'vehicle' },
  car_suv:     { label: 'SUV', tier: 5, needR: 2.4, anchor: 5, dims: [1.92, 1.75, 4.75], cat: 'vehicle' },

  van:         { label: 'Furgoni', tier: 6, needR: 2.85, anchor: 5.5, dims: [2.0, 2.45, 5.3], cat: 'vehicle' },
  tree_small:  { label: 'Alberelli', tier: 6, needR: 2.75, anchor: 6, dims: [2.2, 4.8, 2.2], cat: 'tree', tall: true, dens: 0.4 },
  tree:        { label: 'Alberi', tier: 6, needR: 3.1, anchor: 7, dims: [4.4, 7.5, 4.4], cat: 'tree', tall: true, dens: 0.4 },
  tree_pine:   { label: 'Pini', tier: 6, needR: 3.2, anchor: 7, dims: [3.4, 9.5, 3.4], cat: 'tree', tall: true, dens: 0.4 },
  tree_cypress:{ label: 'Cipressi', tier: 6, needR: 2.8, anchor: 6.5, dims: [1.5, 9, 1.5], cat: 'tree', tall: true, dens: 0.4 },
  tree_birch:  { label: 'Betulle', tier: 6, needR: 2.9, anchor: 6.5, dims: [3, 8, 3], cat: 'tree', tall: true, dens: 0.4 },
  busstop:     { label: 'Pensiline', tier: 6, needR: 3.0, anchor: 7, dims: [3.6, 2.6, 1.6], cat: 'prop', dens: 0.5 },

  kiosk:       { label: 'Edicole', tier: 7, needR: 3.6, anchor: 8, dims: [3.0, 3.2, 3.0], cat: 'prop' },
  foodkiosk:   { label: 'Chioschi', tier: 7, needR: 3.7, anchor: 8, dims: [3.2, 3.1, 3.2], cat: 'prop' },
  fountain:    { label: 'Fontane', tier: 7, needR: 4.4, anchor: 9, dims: [6, 2.6, 6], cat: 'prop', dens: 0.6 },

  bus:         { label: 'Autobus', tier: 8, needR: 5.8, anchor: 6, dims: [2.55, 3.1, 12], cat: 'vehicle' },

  house:       { label: 'Case', tier: 8, building: true, cat: 'building' },
  villa:       { label: 'Villette', tier: 8, building: true, cat: 'building' },
  shop:        { label: 'Negozi', tier: 8, building: true, cat: 'building' },
  palazzina:   { label: 'Palazzine', tier: 9, building: true, cat: 'building' },
  palazzo:     { label: 'Palazzi', tier: 9, building: true, cat: 'building' },
  warehouse:   { label: 'Magazzini', tier: 10, building: true, cat: 'building' },
  supermarket: { label: 'Supermercati', tier: 10, building: true, cat: 'building' },
  tower:       { label: 'Grattacieli', tier: 10, building: true, cat: 'building' },
};

for (const [key, d] of Object.entries(defs)) {
  d.key = key;
  if (!d.building) d.mass = MASS_K * d.needR ** 3 * (d.dens ?? 1);
}
export const KINDS = defs;

export const BUILDING_TIER_R = { 8: 6.0, 9: 9.0, 10: 15.0 };
export const BUILDING_ANCHOR = 6;

export function buildingNeedR(kind, w, d) {
  const base = 0.8 * Math.hypot(w, d) / 2 + 0.5;
  return Math.max(BUILDING_TIER_R[KINDS[kind].tier], base);
}
export const buildingMass = needR => MASS_K * needR ** 3 * 0.9;

const TIER_NAMES = [
  'Foglie e piccoli rifiuti',
  'Coni, cestini e piccoli arredi',
  'Panchine, biciclette e pedoni',
  'Scooter, moto e lampioni',
  'Automobili',
  'Furgoni e alberi',
  'Chioschi e fontane',
  'Case e autobus',
  'Palazzine e palazzi',
  'Grattacieli',
  'Isolati interi',
  'Quartieri',
  'Distretti',
  'CittÃ  intera',
  'Area metropolitana',
];

function tierRadius(t) {
  if (BUILDING_TIER_R[t]) return BUILDING_TIER_R[t];
  if (t >= 11) return 30 * 2 ** (t - 11);
  let r = Infinity;
  for (const d of Object.values(defs)) if (d.tier === t && !d.building) r = Math.min(r, d.needR);
  return r;
}

export function tier(n) {
  return { index: n, r: tierRadius(n), name: TIER_NAMES[n - 1] ?? `Scala ${n}` };
}

// Current tier = highest tier whose radius has been reached.
export function progressInfo(mass) {
  const r = radiusForMass(mass);
  let n = 1;
  while (tierRadius(n + 1) <= r) n++;
  const next = tier(n + 1);
  const m0 = n === 1 ? 0 : massForRadius(tierRadius(n));
  const m1 = massForRadius(next.r);
  const progress = Math.min(1, Math.max(0, (mass - m0) / (m1 - m0)));
  return { r, current: tier(n), next, progress };
}
