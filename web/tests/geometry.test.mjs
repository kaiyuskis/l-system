import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeGeometry, geometryKey } from "../src/geometry-client.ts";
import { defaultParams } from "../src/studio-state.ts";
function packet(meta, values = []) {
  const json = new TextEncoder().encode(
    JSON.stringify({
      version: 2,
      instances: 0,
      vertices: 0,
      indices: 0,
      branches: 0,
      leaves: 0,
      flowers: 0,
      buds: 0,
      symbolCount: 0,
      preview: "",
      generationLimit: 10,
      engineMs: 0,
      ...meta,
    }),
  );
  const padded = Math.ceil(json.length / 4) * 4;
  const buffer = new ArrayBuffer(8 + padded + values.length * 4);
  new Uint8Array(buffer).set([75, 77, 82, 50]);
  new DataView(buffer).setUint32(4, padded, true);
  new Uint8Array(buffer, 8, padded).fill(32);
  new Uint8Array(buffer, 8, json.length).set(json);
  new Float32Array(buffer, 8 + padded).set(values);
  return buffer;
}
test("native protocol decodes zero-copy instanced matrices", () => {
  const values = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1, 0.2];
  const buffer = packet({ leaves: 1 }, values);
  const data = decodeGeometry(buffer);
  assert.equal(data.leaves.count, 1);
  assert.equal(data.leaves.matrices[12], 2);
  assert.equal(data.leaves.matrices.buffer, buffer);
});
test("native protocol rejects truncated, wrong-version and oversized data", () => {
  for (const buffer of [
    new ArrayBuffer(0),
    packet({ version: 99 }),
    packet({ leaves: 1 }),
    packet({ branches: 20001 }),
    packet({ vertices: NaN }),
    packet({ indices: -1 }),
  ])
    assert.throws(() => decodeGeometry(buffer));
});
test("appearance changes reuse geometry but shape changes do not", () => {
  assert.equal(
    geometryKey(defaultParams),
    geometryKey({ ...defaultParams, leafColor: "#ff0000" }),
  );
  assert.notEqual(
    geometryKey(defaultParams),
    geometryKey({ ...defaultParams, angle: 45 }),
  );
});
test("stable IDs distinguish rendered branches from filtered tiny branches", () => {
  const identities = {axes:[],branches:['tiny','visible'],instances:['visible'],leaves:[],flowers:[],buds:[]};
  const data = decodeGeometry(packet({branches:2,instances:1,identities},Array(19).fill(0)));
  assert.deepEqual(data.branchInstances.ids,['visible']);
  assert.throws(()=>decodeGeometry(packet({branches:2,instances:1,identities:{...identities,instances:['tiny','visible']}},Array(19).fill(0))));
  assert.throws(()=>decodeGeometry(packet({branches:2,instances:1,identities:{...identities,branches:['same','same']}},Array(19).fill(0))));
});
