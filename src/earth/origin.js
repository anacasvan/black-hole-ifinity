// Floating origin: everything is simulated in absolute world metres (float64)
// but rendered relative to ORIGIN, which is moved in large steps as the player
// travels, so GPU float32 precision never degrades far from the start.
export const ORIGIN = { x: 0, z: 0, version: 0 };
export const REBASE_STEP = 1024;
export const REBASE_DIST = 1536;

export function needsRebase(x, z) {
  return Math.abs(x - ORIGIN.x) > REBASE_DIST || Math.abs(z - ORIGIN.z) > REBASE_DIST;
}

export function rebase(x, z) {
  ORIGIN.x = Math.round(x / REBASE_STEP) * REBASE_STEP;
  ORIGIN.z = Math.round(z / REBASE_STEP) * REBASE_STEP;
  ORIGIN.version++;
}
