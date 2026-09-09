import { test } from "node:test";
import assert from "node:assert/strict";
import { needleShoot, NEEDLES_PER_SHOOT } from "../src/pine-needles.ts";
import { validateParams, builtinPresets, cloneParams } from "../src/studio-state.ts";

test("paired needles have a closed cross-section, finite normals and no alpha-card texture", () => {
  const geometry=needleShoot();
  assert.equal(NEEDLES_PER_SHOOT,80);
  assert.equal(geometry.getAttribute("uv").count, geometry.getAttribute("position").count);
  assert.ok([...geometry.getAttribute("uv").array].every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  for(const key of ["position","normal","color"]) assert.ok([...geometry.getAttribute(key).array].every(Number.isFinite),key);
  assert.ok(geometry.boundingBox.max.x-geometry.boundingBox.min.x>0.2);
  assert.ok(geometry.boundingBox.max.z-geometry.boundingBox.min.z>0.2);
  assert.ok(geometry.getIndex().array.every(i=>i<geometry.getAttribute("position").count));
  const long=needleShoot(2);assert.ok(long.boundingBox.max.x>geometry.boundingBox.max.x*1.8);
  geometry.dispose();long.dispose();
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
