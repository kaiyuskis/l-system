// Intentional frozen TypeScript reference: never imported by the production app.
import { writeFileSync } from "node:fs";
import { builtinPresets, cloneParams } from "../web/src/studio-state.ts";
import {
  generateLSystemString,
  parseRules,
  createLSystemData,
} from "../web/tests/reference/l-system.ts";
import { setSeed } from "../web/tests/reference/rng.ts";
const cases = builtinPresets.map((p) => ({
  name: p.id,
  params: { ...cloneParams(p.params), generations: 4 },
}));
cases.push({
  name: "arithmetic-gravity-stack",
  params: {
    ...cloneParams(builtinPresets[0].params),
    premise:
      "F(1e0)[+(35)!(0.7)F(2*(1+0.5))L]f(0.3)&(15)F^/(27)F[-F]K|F\\(12)M",
    rules: [],
    generations: 0,
  },
});
cases.push({
  name: "zero-growth",
  params: {
    ...cloneParams(builtinPresets[0].params),
    generations: 0,
    growthMode: true,
  },
});
for (const item of cases) {
  const p = item.params;
  setSeed(p.seed);
  const ratio = p.growthMode ? Math.min(p.generations / 10, 1) : 1;
  item.expanded = generateLSystemString(
    p.premise,
    parseRules(p.rules),
    p.generations,
  );
  const d = createLSystemData(item.expanded, {
    initLen: p.maxLength * ratio,
    initWid: p.maxThickness * ratio * ratio,
    scale: p.scale,
    widthDecay: p.widthDecay,
    angle: p.angle,
    angleVariance: p.angleVariance,
    gravity: p.gravity,
    leafSize: p.leafSize,
    flowerSize: p.flowerSize,
    budSize: p.budSize,
  });
  item.geometry = {
    branches: d.branches.map((b) => ({
      ...b,
      start: b.start.toArray(),
      end: b.end.toArray(),
      rotation: b.rotation.toArray(),
    })),
    ...Object.fromEntries(
      ["leaves", "flowers", "buds"].map((k) => [
        k,
        d[k].map((o) => ({
          ...o,
          position: o.position.toArray(),
          rotation: o.rotation.toArray(),
        })),
      ]),
    ),
  };
}
writeFileSync(
  new URL("../backend/tests/reference.json", import.meta.url),
  JSON.stringify(cases),
);
console.log(`Wrote ${cases.length} compatibility fixtures.`);
