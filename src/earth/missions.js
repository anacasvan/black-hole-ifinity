// Optional goals that give direction without pressure (no timers, no failure).
// Pure JS (testable in Node).
import { KINDS, massForRadius, progressInfo } from './config.js';

const CARS = ['car_city', 'car_sedan', 'car_suv'];
const TREES = ['tree', 'tree_small', 'tree_pine', 'tree_cypress', 'tree_birch'];

export const MISSIONS = [
  { id: 'leaf15', text: 'Inghiotti 15 foglie', kinds: ['leaf'], n: 15, tier: 1 },
  { id: 'litter10', text: 'Ripulisci il parco: 10 rifiuti', kinds: ['litter'], n: 10, tier: 1 },
  { id: 'cone3', text: 'Inghiotti 3 coni stradali', kinds: ['cone'], n: 3, tier: 2 },
  { id: 'bin5', text: 'Inghiotti 5 cestini', kinds: ['bin'], n: 5, tier: 2 },
  { id: 'pot4', text: 'Inghiotti 4 vasi di fiori', kinds: ['flowerpot'], n: 4, tier: 2 },
  { id: 'bench4', text: 'Inghiotti 4 panchine', kinds: ['bench'], n: 4, tier: 3 },
  { id: 'bike5', text: 'Inghiotti 5 biciclette', kinds: ['bicycle'], n: 5, tier: 3 },
  { id: 'ped10', text: 'Fai sparire 10 passanti', kinds: ['ped'], n: 10, tier: 3 },
  { id: 'lamp6', text: 'Inghiotti 6 lampioni', kinds: ['lamp'], n: 6, tier: 4 },
  { id: 'tl4', text: 'Inghiotti 4 semafori', kinds: ['tlight'], n: 4, tier: 4 },
  { id: 'moto5', text: 'Inghiotti 5 scooter o moto', kinds: ['scooter', 'motorbike'], n: 5, tier: 4 },
  { id: 'car10', text: 'Inghiotti 10 automobili', kinds: CARS, n: 10, tier: 5 },
  { id: 'van3', text: 'Inghiotti 3 furgoni', kinds: ['van'], n: 3, tier: 6 },
  { id: 'tree15', text: 'Inghiotti 15 alberi', kinds: TREES, n: 15, tier: 6 },
  { id: 'kiosk2', text: 'Inghiotti 2 chioschi o edicole', kinds: ['kiosk', 'foodkiosk'], n: 2, tier: 7 },
  { id: 'fountain1', text: 'Inghiotti una fontana', kinds: ['fountain'], n: 1, tier: 7 },
  { id: 'bus1', text: 'Inghiotti un autobus', kinds: ['bus'], n: 1, tier: 8 },
  { id: 'house3', text: 'Fai crollare 3 case', kinds: ['house', 'villa'], n: 3, tier: 8 },
  { id: 'palazzo5', text: 'Fai crollare 5 palazzi', kinds: ['palazzina', 'palazzo', 'shop'], n: 5, tier: 9 },
  { id: 'market1', text: 'Fai crollare un supermercato o un magazzino', kinds: ['supermarket', 'warehouse'], n: 1, tier: 10 },
  { id: 'tower3', text: 'Fai crollare 3 grattacieli', kinds: ['tower'], n: 3, tier: 10 },
  { id: 'car200', text: 'Inghiotti 200 automobili', kinds: CARS, n: 200, tier: 10 },
  { id: 'bld100', text: 'Fai sparire 100 edifici', cat: 'building', n: 100, tier: 11 },
];

export function missionCount(m, byKind) {
  if (m.cat) {
    let n = 0;
    for (const [k, v] of Object.entries(byKind)) if (KINDS[k]?.cat === m.cat) n += v;
    return n;
  }
  return m.kinds.reduce((s, k) => s + (byKind[k] || 0), 0);
}

// The (up to) `max` missions currently proposed: the first unfinished ones the
// hole can already work on (tier reached or about to be reached).
export function activeMissions(done, byKind, mass, max = 3) {
  const tier = progressInfo(mass).current.index;
  const out = [];
  for (const m of MISSIONS) {
    if (done.includes(m.id) || m.tier > tier + 1) continue;
    out.push({ ...m, have: Math.min(m.n, missionCount(m, byKind)) });
    if (out.length >= max) break;
  }
  return out;
}

// Reward: a small push toward the next tier (8% of the mass the tier needs).
export function missionReward(mass) {
  const p = progressInfo(mass);
  const span = massForRadius(p.next.r) - (p.current.index === 1 ? 0 : massForRadius(p.current.r));
  return Math.max(0.05, span * 0.08);
}

// Early boost: the first minutes are faster, then the normal slow pace.
export function earlyBoost(r) {
  return 1 + 1.6 * Math.min(1, Math.max(0, (0.8 - r) / 0.5));
}
