import type * as THREE from "three";
import type { LeafGroupParams } from "./types";
import { createLSystemData, generateLSystemStringSync } from "./l-system";
import { buildLeafOutlineGeometry } from "./leaf-outline";

export type LeafCluster = {
  leaves: ReturnType<typeof createLSystemData>["leaves"];
  buds: ReturnType<typeof createLSystemData>["buds"];
  branches: ReturnType<typeof createLSystemData>["branches"];
  leafGeometry: THREE.BufferGeometry | null;
};

function buildRulesMap(rules: LeafGroupParams["rules"]) {
  const map: Record<string, string> = {};
  rules.forEach(rule => {
    const parts = rule.expression.split("=");
    if (parts.length >= 2) {
      map[parts[0].trim()] = parts.slice(1).join("=").trim();
    }
  });
  return map;
}

export function buildLeafCluster(params: LeafGroupParams): LeafCluster {
  const generations = Math.max(0, Math.floor(params.generations));
  const ruleMap = buildRulesMap(params.rules);
  const str = generateLSystemStringSync(params.premise, ruleMap, generations);

  const data = createLSystemData(str, {
    initLen: params.initLength,
    initWid: params.initThickness,
    scale: params.scale,
    widthDecay: params.widthDecay,
    angle: params.angle,
    angleVariance: params.angleVariance,
    flowerSize: 0,
    leafSize: params.leafSize,
    budSize: params.budSize ?? 0,
    gravity: 0,
  });

  const leafGeometry = buildLeafOutlineGeometry(params);
  return { leaves: data.leaves, buds: data.buds, branches: data.branches, leafGeometry };
}
