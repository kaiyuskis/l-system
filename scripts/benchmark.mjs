import { builtinPresets, cloneParams } from "../web/src/studio-state.ts";
import {
  generateLSystemString,
  parseRules,
  createLSystemData,
} from "../web/tests/reference/l-system.ts";
import { setSeed } from "../web/tests/reference/rng.ts";
import { decodeGeometry } from "../web/src/geometry-client.ts";
const base = process.env.BENCH_URL || "http://127.0.0.1:3000";
const birch = { ...cloneParams(builtinPresets[0].params), generations: 6 };
const dense = {
  ...cloneParams(birch),
  premise: "F",
  rules: [{ expression: "F=F[+F][-F][&F]" }],
  generations: 7,
};
for (const [name, p] of [
  ["birch-6", birch],
  ["dense-7", dense],
]) {
  const rules = parseRules(p.rules);
  const work = () => {
    setSeed(p.seed);
    const s = generateLSystemString(p.premise, rules, p.generations);
    return createLSystemData(s, {
      initLen: p.maxLength,
      initWid: p.maxThickness,
      scale: p.scale,
      widthDecay: p.widthDecay,
      angle: p.angle,
      angleVariance: p.angleVariance,
      gravity: p.gravity,
      leafSize: p.leafSize,
      flowerSize: p.flowerSize,
      budSize: p.budSize,
    });
  };
  for (let i = 0; i < 5; i++) work();
  const start = performance.now();
  for (let i = 0; i < 30; i++) work();
  const tsMs = (performance.now() - start) / 30;
  const once = async (seed) => {
    const start = performance.now();
    const r = await fetch(`${base}/api/tree/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...p, seed }),
    });
    if (!r.ok) throw new Error(await r.text());
    const bytes = await r.arrayBuffer();
    const data = decodeGeometry(bytes);
    return {
      httpMs: performance.now() - start,
      backendMeshMs: data.meta.engineMs,
      bytes: bytes.byteLength,
      cache: r.headers.get("x-geometry-cache"),
      branches: data.meta.branches,
    };
  };
  const cold = await once(9284);
  const cached = await once(9284);
  console.log(
    JSON.stringify({
      case: name,
      typescriptCoreMs: tsMs,
      iterations: 30,
      cold,
      cached,
    }),
  );
}
