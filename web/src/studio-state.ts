import presetData from "../../shared/presets.json" with { type: "json" };
/** Portable plant settings. Camera position and generated geometry stay out of presets. */
export interface PlantParams {
  growthModel: "lsystem" | "pine" | "birch" | "maple" | "sakura" | "fern" | "oak" | "willow" | "spruce" | "ginkgo";
  crownSpread: number;
  branchTwist: number;
  foliageDensity: number;
  needleLength: number;
  growthMode: boolean;
  maxLength: number;
  maxThickness: number;
  initLength: number;
  initThickness: number;
  generations: number;
  angle: number;
  angleVariance: number;
  seed: number;
  gravity: number;
  branchColor: string;
  scale: number;
  widthDecay: number;
  flowerColor: string;
  flowerSize: number;
  leafColor: string;
  leafTextureKey: "leaf_default" | "leaf_maple" | "pine_needles" | "leaf_birch" | "leaf_cherry" | "fern_pinnule" | "leaf_oak" | "leaf_willow" | "spruce_needles" | "leaf_ginkgo";
  leafSize: number;
  budColor: string;
  budSize: number;
  premise: string;
  rules: { expression: string }[];
}

export interface BuiltinPreset {
  id: string;
  name: string;
  latinName: string;
  description: string;
  tag: string;
  params: PlantParams;
}

export interface SavedPreset {
  name: string;
  savedAt: number;
  data: PlantParams;
}

export function cloneParams(params: PlantParams): PlantParams {
  return { ...params, rules: params.rules.map((rule) => ({ ...rule })) };
}
export const builtinPresets: BuiltinPreset[] = presetData as BuiltinPreset[];
export const defaultParams = cloneParams(builtinPresets[0].params);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberField(
  value: unknown,
  label: string,
  min: number,
  max: number,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `${label}は ${min}〜${max} の${integer ? "整数" : "数値"}にしてください。`,
    );
  }
  return value;
}

function colorField(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
  ) {
    throw new Error(`${label}は #779747 のような色コードにしてください。`);
  }
  const color = value.toLowerCase();
  return color.length === 4
    ? `#${[...color.slice(1)].map((part) => part + part).join("")}`
    : color;
}

/** Reject invalid imported or stored values before they reach the renderer. */
export function validateParams(value: unknown): PlantParams {
  if (!isRecord(value))
    throw new Error("植物の設定が正しい JSON オブジェクトではありません。");
  if (typeof value.growthMode !== "boolean")
    throw new Error("成長連動の設定は true または false にしてください。");
  if (value.growthModel !== undefined && !["lsystem", "pine", "birch", "maple", "sakura", "fern", "oak", "willow", "spruce", "ginkgo"].includes(value.growthModel as string))
    throw new Error("生成方式が不正です。");
  if (
    value.leafTextureKey !== "leaf_default" &&
    value.leafTextureKey !== "leaf_maple" &&
    value.leafTextureKey !== "pine_needles" && value.leafTextureKey !== "leaf_birch" && value.leafTextureKey !== "leaf_cherry" && value.leafTextureKey !== "fern_pinnule" && value.leafTextureKey !== "leaf_oak" && value.leafTextureKey !== "leaf_willow" && value.leafTextureKey !== "spruce_needles" && value.leafTextureKey !== "leaf_ginkgo"
  ) {
    throw new Error(
      "葉のかたちが不正です。用意された葉のかたちを選んでください。",
    );
  }
  if (
    typeof value.premise !== "string" ||
    !value.premise.trim() ||
    value.premise.length > 4096
  ) {
    throw new Error("初期状態は 1〜4,096 文字で入力してください。");
  }
  if (!Array.isArray(value.rules) || value.rules.length > 26) {
    throw new Error("生成ルールは 26 個以内の配列にしてください。");
  }
  const symbols = new Set<string>();
  const rules = value.rules.map((rule: unknown, index: number) => {
    if (
      !isRecord(rule) ||
      typeof rule.expression !== "string" ||
      rule.expression.length > 4096
    ) {
      throw new Error(
        `ルール ${index + 1} は 4,096 文字以内の文字列にしてください。`,
      );
    }
    const expression = rule.expression.trim();
    if (expression && !expression.startsWith("#")) {
      const match = /^([A-Za-z])\s*=([\s\S]*)$/.exec(expression);
      if (!match)
        throw new Error(
          `ルール ${index + 1} は A=F[+A] の形式にしてください。`,
        );
      if (symbols.has(match[1]))
        throw new Error(`記号 ${match[1]} のルールが重複しています。`);
      symbols.add(match[1]);
    }
    return { expression };
  });

  return {
    growthModel: (value.growthModel ?? "lsystem") as PlantParams["growthModel"],
    crownSpread: numberField(value.crownSpread ?? 1, "樹冠の広がり", 0.3, 2),
    branchTwist: numberField(value.branchTwist ?? 1, "枝の曲がり", 0, 2),
    foliageDensity: numberField(value.foliageDensity ?? 1, "葉・花の密度", 0, 2),
    needleLength: numberField(value.needleLength ?? 1, "針葉の長さ", 0.3, 2),
    growthMode: value.growthMode,
    maxLength: numberField(value.maxLength, "枝の長さ", 0.01, 5),
    initLength: numberField(value.initLength, "現在の枝の長さ", 0, 5),
    maxThickness: numberField(value.maxThickness, "幹の太さ", 0.005, 2),
    initThickness: numberField(value.initThickness, "現在の幹の太さ", 0, 2),
    generations: numberField(value.generations, "世代", 0, value.growthModel && value.growthModel !== "lsystem" ? 16 : 12, true),
    angle: numberField(value.angle, "枝分かれの角度", 0, 180),
    angleVariance: numberField(value.angleVariance, "角度のゆらぎ", 0, 45),
    seed: numberField(value.seed, "シード", 0, 4294967295, true),
    gravity: numberField(value.gravity, "重力", -10, 10),
    branchColor: colorField(value.branchColor, "枝の色"),
    scale: numberField(value.scale, "長さの減衰率", 0, 2),
    widthDecay: numberField(value.widthDecay, "太さの減衰率", 0, 1),
    flowerColor: colorField(value.flowerColor, "花の色"),
    flowerSize: numberField(value.flowerSize, "花の大きさ", 0, 5),
    leafColor: colorField(value.leafColor, "葉の色"),
    leafTextureKey: value.leafTextureKey,
    leafSize: numberField(value.leafSize, "葉の大きさ", 0, 5),
    budColor: colorField(value.budColor, "つぼみの色"),
    budSize: numberField(value.budSize, "つぼみの大きさ", 0, 5),
    premise: value.premise.trim(),
    rules,
  };
}

// Keep the original key and map format so previous collections remain available.
const PRESETS_KEY = "lsystem_presets_v1";
const DRAFT_KEY = "lsystem_studio_draft_v1";
type RawPresetMap = Record<string, { savedAt: number; data: unknown }>;

function storage(): Storage {
  try {
    return globalThis.localStorage;
  } catch {
    throw new Error(
      "ブラウザーの保存領域を利用できません。プライバシー設定を確認してください。",
    );
  }
}

function readStorage(key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    throw new Error(
      "ブラウザーに保存した設定を読み込めませんでした。保存領域の利用が許可されているか確認してください。",
    );
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    throw new Error(
      "ブラウザーに保存できませんでした。保存領域の空き容量やプライバシー設定を確認してください。",
    );
  }
}

function parseStoredJSON(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      `${label}の保存データが壊れています。元のデータは変更していません。`,
    );
  }
}

function readPresetMap(): RawPresetMap {
  const raw = readStorage(PRESETS_KEY);
  if (raw === null) return Object.create(null) as RawPresetMap;
  const parsed = parseStoredJSON(raw, "コレクション");
  if (!isRecord(parsed))
    throw new Error(
      "コレクションの保存形式が不正です。元のデータは変更していません。",
    );
  for (const [name, entry] of Object.entries(parsed)) {
    if (
      !isRecord(entry) ||
      typeof entry.savedAt !== "number" ||
      !Number.isFinite(entry.savedAt) ||
      entry.savedAt < 0
    ) {
      throw new Error(
        `「${name}」の保存データが不正です。元のデータは変更していません。`,
      );
    }
    try {
      validateParams(entry.data);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "設定を確認してください。";
      throw new Error(
        `「${name}」を読み込めません。${reason} 元のデータは変更していません。`,
      );
    }
  }
  return parsed as RawPresetMap;
}

export function readSavedPresets(): SavedPreset[] {
  return Object.entries(readPresetMap())
    .map(([name, entry]) => ({
      name,
      savedAt: entry.savedAt,
      data: validateParams(entry.data),
    }))
    .sort(
      (a, b) => b.savedAt - a.savedAt || a.name.localeCompare(b.name, "ja"),
    );
}

export function writeSavedPreset(
  name: string,
  params: PlantParams,
): SavedPreset {
  const normalizedName = name.trim();
  if (
    !normalizedName ||
    normalizedName.length > 80 ||
    /[\u0000-\u001f]/.test(normalizedName)
  ) {
    throw new Error("保存名は改行を含まない 1〜80 文字で入力してください。");
  }
  const data = validateParams(params);
  const map = readPresetMap();
  const savedAt = Date.now();
  // Defining an own property also handles names such as "__proto__" safely.
  Object.defineProperty(map, normalizedName, {
    value: { savedAt, data },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  writeStorage(PRESETS_KEY, map);
  return { name: normalizedName, savedAt, data: cloneParams(data) };
}

export function deleteSavedPreset(name: string): void {
  const map = readPresetMap();
  if (!Object.hasOwn(map, name)) return;
  delete map[name];
  writeStorage(PRESETS_KEY, map);
}

function readDraftValue(): PlantParams | null {
  const raw = readStorage(DRAFT_KEY);
  if (raw === null) return null;
  const parsed = parseStoredJSON(raw, "作業中の設定");
  if (!isRecord(parsed) || parsed.version !== 1) {
    throw new Error(
      "作業中の設定の保存形式を読み込めません。元のデータは変更していません。",
    );
  }
  try {
    return validateParams(parsed.data);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "設定を確認してください。";
    throw new Error(
      `作業中の設定を読み込めません。${reason} 元のデータは変更していません。`,
    );
  }
}

export function loadDraft(): PlantParams | null {
  return readDraftValue();
}

export function saveDraft(params: PlantParams): void {
  const data = validateParams(params);
  // A malformed existing draft must never disappear behind an automatic save.
  readDraftValue();
  writeStorage(DRAFT_KEY, { version: 1, savedAt: Date.now(), data });
}
