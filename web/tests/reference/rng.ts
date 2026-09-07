const MODULUS = 2_147_483_647;
const SEED_RANGE = MODULUS - 1;
let currentSeed = 1;

/** Normalize all finite seeds to the Park–Miller generator's nonzero state. */
export function setSeed(seed: number): void {
  if (!Number.isFinite(seed))
    throw new Error("シード値には有限の数を指定してください。");
  const integer = Math.trunc(seed);
  currentSeed = ((integer % MODULUS) + MODULUS) % MODULUS;
  if (currentSeed === 0) currentSeed = 1;
}

export function random(): number {
  currentSeed = (currentSeed * 16_807) % MODULUS;
  return (currentSeed - 1) / SEED_RANGE;
}
