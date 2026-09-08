import type { PlantParams } from "./studio-state.ts";

/** Broad initial estimate for native derivation, transfer and mesh construction. */
export function generationEstimate(p: PlantParams): string {
  if (p.growthModel === "lsystem") return "処理目安：ルールの展開量により変わります";
  const depth = Math.max(0, [1, 2, 4, 6, 9, 13].filter(g => g <= p.generations).length - 1);
  const mature = p.growthModel === "birch" ? 0.8 : p.growthModel === "pine" ? 1.2 : 0.5;
  const seconds = p.growthModel === "fern"
    ? 0.08 + (2 + p.generations) * (4 + p.generations) * 0.001
    : 0.06 + mature * Math.pow(3.1, depth - 4) * (0.55 + p.foliageDensity * 0.45);
  const low = Math.max(0.1, seconds * 0.5).toFixed(1);
  const high = Math.max(0.3, seconds * 2.5).toFixed(1);
  return `処理目安：約${low}〜${high}秒（概算・PCの性能や負荷で変動）`;
}
