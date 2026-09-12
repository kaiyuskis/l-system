import { test } from "node:test";
import assert from "node:assert/strict";
import { needleShoot, NEEDLES_PER_SHOOT, NEEDLE_STEM_LENGTH } from "../src/pine-needles.ts";
import { validateParams, builtinPresets, cloneParams } from "../src/studio-state.ts";

test("paired needles have a closed cross-section, finite normals and no alpha-card texture", () => {
  const geometry=needleShoot();
  assert.equal(NEEDLES_PER_SHOOT,64);
  assert.equal(geometry.getAttribute("uv").count, geometry.getAttribute("position").count);
  assert.ok([...geometry.getAttribute("uv").array].every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  for(const key of ["position","normal","color"]) assert.ok([...geometry.getAttribute(key).array].every(Number.isFinite),key);
  assert.ok(geometry.boundingBox.max.x-geometry.boundingBox.min.x>0.2);
  assert.ok(geometry.boundingBox.max.z-geometry.boundingBox.min.z>0.2);
  assert.ok(geometry.getIndex().array.every(i=>i<geometry.getAttribute("position").count));
  const long=needleShoot(2);assert.ok(long.boundingBox.max.x>geometry.boundingBox.max.x*1.8);
  geometry.dispose();long.dispose();
});
test("pine needles form slender stiff pairs with shared fascicle bases and bounded reusable geometry", () => {
  const geometry = needleShoot(), positions = geometry.getAttribute("position");
  const center = (offset) => [0, 1, 2].map(axis =>
    [0, 1, 2].reduce((sum, vertex) => sum + positions.array[(offset + vertex) * 3 + axis], 0) / 3);
  const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
  for (let pair = 0; pair < NEEDLES_PER_SHOOT / 2; pair++) {
    const a = pair * 30, b = a + 15, root = center(a), tipA = center(a + 12), tipB = center(b + 12);
    assert.ok(distance(root, center(b)) < 1e-7, "both needles must share one fascicle root");
    assert.ok(Math.hypot(root[0], root[2]) < 1e-7 && root[1] <= NEEDLE_STEM_LENGTH, "roots stay inside the twig");
    assert.ok(distance(root, tipA) > .15 && distance(root, tipA) < .26, "long pine needle");
    assert.ok(distance(tipA, tipB) > .005 && distance(tipA, tipB) < .08, "paired blades splay slightly");
    const middle = center(a + 6), halfway = root.map((n, i) => (n + tipA[i]) / 2);
    assert.ok(distance(middle, halfway) < .007, "nearly straight, stiff shaft");
  }
  assert.ok(positions.count <= 1000, "one shared geometry remains lightweight");
  assert.ok(geometry.getIndex().count / 3 < 1800);
  geometry.dispose();
});
test("pine settings survive JSON round trips; invalid dimensions are rejected", () => {
  const p=cloneParams(builtinPresets.find(p=>p.id==="pine").params);
  assert.deepEqual(validateParams(JSON.parse(JSON.stringify(p))),p);
  for(const patch of [{crownSpread:NaN},{branchTwist:3},{needleLength:0},{foliageDensity:-1},{growthModel:"unknown"}])
    assert.throws(()=>validateParams({...p,...patch}));
});
test("old saved trees receive compatible defaults without changing their grammar", () => {
  const p=cloneParams(builtinPresets[0].params);
  for(const key of ["growthModel","crownSpread","branchTwist","foliageDensity","needleLength"])delete p[key];
  const migrated=validateParams(p);
  assert.equal(migrated.growthModel,"lsystem");assert.deepEqual(migrated.rules,p.rules);
});
