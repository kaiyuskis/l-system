import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  builtinPresets,
  cloneParams,
  defaultParams,
  deleteSavedPreset,
  loadDraft,
  readSavedPresets,
  saveDraft,
  validateParams,
  writeSavedPreset,
} from "../src/studio-state.ts";
import {
  createLSystemData,
  generateLSystemString,
  parseRules,
} from "./reference/l-system.ts";
import { setSeed } from "./reference/rng.ts";

const PRESETS_KEY = "lsystem_presets_v1";
const DRAFT_KEY = "lsystem_studio_draft_v1";
let records;
let storageDescriptor;

beforeEach(() => {
  records = new Map();
  storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => (records.has(key) ? records.get(key) : null),
      setItem: (key, value) => records.set(key, String(value)),
    },
  });
});

afterEach(() => {
  if (storageDescriptor)
    Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  else delete globalThis.localStorage;
});

test("each built-in is independently editable and produces a complete finite specimen", () => {
  assert.equal(new Set(builtinPresets.map((preset) => preset.id)).size, 4);
  for (const preset of builtinPresets) {
    const params = validateParams(preset.params);
    const program = generateLSystemString(
      params.premise,
      parseRules(params.rules),
      params.generations,
    );
    setSeed(params.seed);
    const data = createLSystemData(program, {
      ...params,
      initLen: params.initLength,
      initWid: params.initThickness,
    });
    assert.ok(data.branches.length > 100, preset.id);
    assert.ok(data.leaves.length + data.flowers.length > 100, preset.id);
    for (const branch of data.branches) {
      assert.ok(branch.end.toArray().every(Number.isFinite), preset.id);
      assert.ok(branch.radiusBottom > 0 && branch.radiusTop > 0, preset.id);
    }
    params.rules[0].expression = "A=F";
    assert.notEqual(
      params.rules[0].expression,
      preset.params.rules[0].expression,
    );
  }
  const edited = cloneParams(defaultParams);
  edited.rules[0].expression = "A=FF";
  assert.notEqual(
    edited.rules[0].expression,
    defaultParams.rules[0].expression,
  );
  assert.notEqual(
    edited.rules[0].expression,
    builtinPresets[0].params.rules[0].expression,
  );
});

test("import validation rejects non-finite, out-of-range and wrong-type values", () => {
  for (const patch of [
    { generations: NaN },
    { generations: Infinity },
    { generations: -1 },
    { generations: 2.5 },
    { maxThickness: 0 },
    { maxLength: 6 },
    { scale: "0.8" },
    { widthDecay: 1.1 },
    { angle: -1 },
    { gravity: Infinity },
    { leafSize: -1 },
    { flowerSize: 6 },
    { seed: -1 },
    { seed: 2.5 },
    { seed: 4294967296 },
    { growthMode: "false" },
    { leafColor: "green" },
    { leafTextureKey: "../secret" },
    { premise: "" },
    { premise: " ".repeat(4) },
    { premise: "F".repeat(4097) },
  ])
    assert.throws(
      () => validateParams({ ...defaultParams, ...patch }),
      Error,
      JSON.stringify(patch),
    );
  for (const value of [null, [], "tree", {}])
    assert.throws(() => validateParams(value));
});

test("validation preserves legitimate zero-generation legacy settings and normalizes short colors", () => {
  const params = validateParams({
    ...defaultParams,
    growthMode: true,
    generations: 0,
    initLength: 0,
    initThickness: 0,
    leafColor: "#ABC",
  });
  assert.equal(params.initLength, 0);
  assert.equal(params.initThickness, 0);
  assert.equal(params.leafColor, "#aabbcc");
  assert.equal(
    validateParams({ ...defaultParams, initThickness: 0.0001 }).initThickness,
    0.0001,
  );
});

test("rule validation rejects malformed and duplicate productions but accepts legacy blank rows", () => {
  for (const rules of [
    null,
    ["A=F"],
    [{ expression: 5 }],
    [{ expression: "AA=F" }],
    [{ expression: "A=F" }, { expression: " A = FF" }],
    [{ expression: "A=" + "F".repeat(4096) }],
    Array.from({ length: 27 }, () => ({ expression: "" })),
  ])
    assert.throws(() => validateParams({ ...defaultParams, rules }));
  const rules = [
    { expression: " # comment" },
    { expression: " A = F" },
    { expression: "" },
  ];
  assert.deepEqual(validateParams({ ...defaultParams, rules }).rules, [
    { expression: "# comment" },
    { expression: "A = F" },
    { expression: "" },
  ]);
});

test("legacy collections remain readable and keep every original record when another is saved", () => {
  const legacy = {
    savedAt: 100,
    data: {
      ...defaultParams,
      resultInfo: "legacy metadata",
      resultText: "FFF",
    },
  };
  records.set(PRESETS_KEY, JSON.stringify({ 以前の木: legacy }));
  assert.equal(readSavedPresets()[0].name, "以前の木");
  const saved = writeSavedPreset("  新しい木  ", builtinPresets[1].params);
  assert.equal(saved.name, "新しい木");
  assert.deepEqual(JSON.parse(records.get(PRESETS_KEY))["以前の木"], legacy);
  assert.deepEqual(
    readSavedPresets().map((preset) => preset.name),
    ["新しい木", "以前の木"],
  );
  saved.data.rules[0].expression = "A=F";
  assert.notEqual(readSavedPresets()[0].data.rules[0].expression, "A=F");
  deleteSavedPreset("新しい木");
  assert.deepEqual(
    readSavedPresets().map((preset) => preset.name),
    ["以前の木"],
  );
});

test("prototype-property names are saved and removed as ordinary collection names", () => {
  for (const name of ["__proto__", "constructor", "toString"])
    writeSavedPreset(name, defaultParams);
  assert.equal(readSavedPresets().length, 3);
  const stored = JSON.parse(records.get(PRESETS_KEY));
  assert.ok(Object.hasOwn(stored, "__proto__"));
  assert.equal(Object.getPrototypeOf(stored), Object.prototype);
  for (const name of ["__proto__", "constructor", "toString"])
    deleteSavedPreset(name);
  assert.deepEqual(readSavedPresets(), []);
});

test("invalid names or settings never alter an existing collection", () => {
  writeSavedPreset("木", defaultParams);
  const before = records.get(PRESETS_KEY);
  for (const name of ["", "   ", "a".repeat(81), "a\nb"])
    assert.throws(() => writeSavedPreset(name, defaultParams));
  assert.throws(() =>
    writeSavedPreset("bad", { ...defaultParams, angle: NaN }),
  );
  assert.equal(records.get(PRESETS_KEY), before);
  deleteSavedPreset("存在しない名前");
  assert.equal(records.get(PRESETS_KEY), before);
});

test("malformed collections cannot be silently replaced by saving or deleting", () => {
  for (const raw of [
    "{broken",
    "[]",
    "null",
    JSON.stringify({ old: { savedAt: -1, data: defaultParams } }),
    JSON.stringify({
      old: { savedAt: 100, data: { ...defaultParams, generations: "bad" } },
    }),
  ]) {
    records.set(PRESETS_KEY, raw);
    assert.throws(readSavedPresets, /元のデータは変更していません/);
    assert.throws(
      () => writeSavedPreset("new", defaultParams),
      /元のデータは変更していません/,
    );
    assert.throws(
      () => deleteSavedPreset("old"),
      /元のデータは変更していません/,
    );
    assert.equal(records.get(PRESETS_KEY), raw);
  }
});

test("draft roundtrips are isolated from presets and from caller mutations", () => {
  assert.equal(loadDraft(), null);
  saveDraft(defaultParams);
  assert.deepEqual(loadDraft(), defaultParams);
  const loaded = loadDraft();
  loaded.rules[0].expression = "A=F";
  assert.notEqual(loadDraft().rules[0].expression, "A=F");
  saveDraft(builtinPresets[2].params);
  assert.deepEqual(loadDraft(), builtinPresets[2].params);
  assert.deepEqual(readSavedPresets(), []);
});

test("malformed or newer-version drafts survive automatic-save attempts unchanged", () => {
  for (const raw of [
    "{broken",
    "[]",
    JSON.stringify({ version: 2, data: defaultParams }),
    JSON.stringify({
      version: 1,
      data: { ...defaultParams, leafColor: "bad" },
    }),
  ]) {
    records.set(DRAFT_KEY, raw);
    assert.throws(loadDraft, /元のデータは変更していません/);
    assert.throws(
      () => saveDraft(defaultParams),
      /元のデータは変更していません/,
    );
    assert.equal(records.get(DRAFT_KEY), raw);
  }
});

test("storage permission and quota failures produce actionable errors without deleting data", () => {
  writeSavedPreset("木", defaultParams);
  const before = records.get(PRESETS_KEY);
  globalThis.localStorage.setItem = () => {
    throw new DOMException("quota", "QuotaExceededError");
  };
  assert.throws(() => writeSavedPreset("new", defaultParams), /空き容量/);
  assert.equal(records.get(PRESETS_KEY), before);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("blocked", "SecurityError");
    },
  });
  assert.throws(readSavedPresets, /保存領域/);
  assert.throws(loadDraft, /保存領域/);
});

