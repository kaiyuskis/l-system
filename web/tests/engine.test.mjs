import assert from "node:assert/strict";
import test from "node:test";
import {
  createLSystemData,
  generateLSystemString,
  LSYSTEM_LIMITS,
  parseRules,
  validateLSystemString,
} from "./reference/l-system.ts";
import { random, setSeed } from "./reference/rng.ts";

const params = {
  initLen: 1,
  initWid: 0.1,
  scale: 0.5,
  widthDecay: 0.9,
  angle: 90,
  angleVariance: 0,
  flowerSize: 1,
  leafSize: 1,
  budSize: 1,
  gravity: 0,
};
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test("simultaneous rewriting supports zero generations, identity and empty productions", () => {
  const rules = parseRules("A=AB\nB=A");
  assert.equal(generateLSystemString("A", rules, 0), "A");
  assert.equal(generateLSystemString("A", rules, 4), "ABAABABA");
  assert.equal(generateLSystemString("F", parseRules("F=F"), 16), "F");
  assert.equal(generateLSystemString("A", parseRules("A="), 5), "");
  assert.equal(generateLSystemString("F(2)", parseRules("F="), 1), "");
});

test("rule parser accepts supported input forms and ignores blank/comment lines", () => {
  assert.equal(parseRules("# tree\n\nA = F[+A][-A]L").A, "F[+A][-A]L");
  assert.equal(parseRules([{ expression: "A=F" }, { expression: "" }]).A, "F");
  assert.equal(parseRules(["A=F"]).A, "F");
  assert.equal(Object.getPrototypeOf(parseRules("A=F")), null);
});

test("invalid, duplicate, and ambiguous productions are rejected", () => {
  for (const source of [
    "AA=F",
    "A F",
    "A=F\nA=L",
    "__proto__=F",
    "A=F=F",
    "A=[F",
  ]) {
    assert.throws(() => parseRules(source), Error, source);
  }
});

test("rewriting ignores inherited properties and keeps exponent notation intact", () => {
  const rules = Object.create({ A: "FFF" });
  assert.equal(generateLSystemString("A", rules, 1), "A");
  assert.equal(generateLSystemString("F(1e2)", { e: "FF" }, 2), "F(1e2)");
});

test("exponential rules and invalid generations fail before oversized allocation", () => {
  assert.throws(
    () => generateLSystemString("F", { F: "FFFFFFFFFF" }, 16),
    /文字を超えます/,
  );
  for (const generations of [-1, 0.5, NaN, Infinity, 17]) {
    assert.throws(() => generateLSystemString("F", {}, generations));
  }
  assert.throws(() =>
    generateLSystemString("F".repeat(LSYSTEM_LIMITS.maxSymbols + 1), {}, 0),
  );
});

test("balanced branches and depth are checked even with zero generations", () => {
  for (const str of ["[F", "F]", "][", "F(2", "F)"]) {
    assert.throws(() => createLSystemData(str, params), Error, str);
  }
  assert.throws(() => generateLSystemString("]", {}, 0));
  assert.throws(
    () => validateLSystemString("[".repeat(513) + "F" + "]".repeat(513)),
    /入れ子/,
  );
});

test("arithmetic arguments have precedence, nested parentheses and scientific notation", () => {
  const { branches } = createLSystemData(
    "F((1 + 2) * 3 / 2)F(1e-2)F(+.5)",
    params,
  );
  near(branches[0].end.y, 4.5);
  near(branches[1].end.y, 4.51);
  near(branches[2].end.y, 5.01);
});

test("command arguments never execute code and reject non-finite/negative geometry", () => {
  globalThis.__lsystem_test_executed = false;
  for (const str of [
    "F(globalThis.__lsystem_test_executed=true)",
    "F(Math.random())",
    "F(1/0)",
    "F(NaN)",
    "F(Infinity)",
    "F(1e309)",
    "F(-2)",
    "!(1e100)",
    "L(-1)",
    "F()",
    "F(2**3)",
  ])
    assert.throws(() => createLSystemData(str, params), Error, str);
  assert.equal(globalThis.__lsystem_test_executed, false);
  delete globalThis.__lsystem_test_executed;
});

test("too-long and too-deep expressions are rejected", () => {
  assert.throws(() => createLSystemData(`F(${"1+".repeat(100)}1)`, params));
  assert.throws(() =>
    createLSystemData(`F(${"(".repeat(40)}1${")".repeat(40)})`, params),
  );
});

test("branch stack restores position, rotation, length and thickness", () => {
  const { branches } = createLSystemData('F[+(90)"(0.5)!(0.5)F]F', params);
  assert.equal(branches.length, 3);
  near(branches[1].start.y, 1);
  near(branches[1].end.x, 0.5);
  near(branches[1].radiusBottom, 0.045);
  near(branches[2].start.y, 1);
  near(branches[2].end.y, 2);
  near(branches[2].end.x, 0);
  near(branches[2].radiusBottom, 0.09);
});

test("all three rotation axes and full turns produce finite normalized geometry", () => {
  const { branches } = createLSystemData("F+F-F&F^F\\F/F|F", params);
  assert.equal(branches.length, 8);
  for (const branch of branches) {
    near(branch.rotation.length(), 1);
    assert.ok(branch.end.toArray().every(Number.isFinite));
  }
});

test("f moves without drawing or thinning, and organ scales are independent", () => {
  const data = createLSystemData("f(2)F K(2)L(.5)M(3)", params);
  assert.equal(data.branches.length, 1);
  near(data.branches[0].start.y, 2);
  near(data.branches[0].end.y, 3);
  near(data.branches[0].radiusBottom, 0.1);
  assert.equal(data.flowers[0].scale, 2);
  assert.equal(data.leaves[0].scale, 0.5);
  assert.equal(data.buds[0].scale, 3);
  for (const organ of [...data.flowers, ...data.leaves, ...data.buds])
    near(organ.position.y, 3);
});

test("zero-size geometry is omitted and cannot create degenerate meshes", () => {
  assert.equal(
    createLSystemData("F(0)K(0)L(0)M(0)", params).branches.length,
    0,
  );
  const data = createLSystemData("F K(0)L(0)M(0)", { ...params, initWid: 0 });
  assert.equal(
    data.branches.length +
      data.flowers.length +
      data.leaves.length +
      data.buds.length,
    0,
  );
});

test("geometry count, coordinate and multiplication bounds prevent huge models", () => {
  assert.throws(
    () =>
      createLSystemData("F".repeat(LSYSTEM_LIMITS.maxBranches + 1), {
        ...params,
        widthDecay: 1,
      }),
    /枝が/,
  );
  assert.throws(
    () => createLSystemData("L".repeat(LSYSTEM_LIMITS.maxOrgans + 1), params),
    /花・葉・つぼみが/,
  );
  assert.throws(() => createLSystemData("F(100000)F", params), /座標/);
  assert.throws(() => createLSystemData("!(100000)!(100000)F", params), /太さ/);
  assert.throws(
    () => createLSystemData('"(100000)"(100000)F', params),
    /長さ倍率/,
  );
});

test("invalid or missing global geometry parameters are rejected", () => {
  for (const invalid of [
    { initLen: NaN },
    { gravity: Infinity },
    { leafSize: -1 },
    { scale: undefined },
  ]) {
    assert.throws(() => createLSystemData("F", { ...params, ...invalid }));
  }
});

test("all finite seeds produce repeatable values in [0,1)", () => {
  for (const seed of [0, 1, -1, 1234, -999.5, 2147483647, Number.MAX_VALUE]) {
    setSeed(seed);
    const first = Array.from({ length: 100 }, random);
    assert.ok(first.every((value) => value >= 0 && value < 1));
    assert.ok(new Set(first).size > 1);
    setSeed(seed);
    assert.deepEqual(Array.from({ length: 100 }, random), first);
  }
  for (const seed of [NaN, Infinity, -Infinity])
    assert.throws(() => setSeed(seed));
});

test("same seed exactly reproduces geometry; a different seed changes it", () => {
  const program = "F[+F[&F]\\FL][-F^F]F";
  const varied = { ...params, angleVariance: 10, gravity: 1 };
  setSeed(42);
  const first = createLSystemData(program, varied);
  setSeed(42);
  assert.deepEqual(createLSystemData(program, varied), first);
  setSeed(43);
  assert.notDeepEqual(createLSystemData(program, varied), first);
});

