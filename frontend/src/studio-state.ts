/** Portable plant settings. Camera position and generated geometry stay out of presets. */
export interface PlantParams {
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
  leafTextureKey: "leaf_default" | "leaf_maple";
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

const baseParams: PlantParams = {
  growthMode: false,
  maxLength: 0.9,
  maxThickness: 0.15,
  initLength: 0.9,
  initThickness: 0.15,
  generations: 5,
  angle: 31,
  angleVariance: 7,
  seed: 42,
  gravity: 0.15,
  branchColor: "#766451",
  scale: 0.76,
  widthDecay: 0.87,
  flowerColor: "#f5bfd1",
  flowerSize: 0.35,
  leafColor: "#779747",
  leafTextureKey: "leaf_default",
  leafSize: 0.62,
  budColor: "#adc76d",
  budSize: 0.12,
  premise: "FFA",
  rules: [
    {
      expression:
        'A=F[&(55)L][/(120)&(55)L]F[!"+A]/(120)[!"&A]/(120)[!"-A]/(120)[!"^A]',
    },
  ],
};

export function cloneParams(params: PlantParams): PlantParams {
  return { ...params, rules: params.rules.map((rule) => ({ ...rule })) };
}

/** These are botanical studies, not exact biological growth simulations. */
export const builtinPresets: BuiltinPreset[] = [
  {
    id: "birch",
    name: "シラカバ",
    latinName: "Betula platyphylla",
    description: "光を受けて広がる、軽やかな緑の樹冠。はじめての植物づくりに。",
    tag: "広葉樹",
    params: cloneParams(baseParams),
  },
  {
    id: "maple",
    name: "イロハモミジ",
    latinName: "Acer palmatum",
    description:
      "横へ伸びる枝と深い紅葉。角度を変えると、樹形の表情も変わります。",
    tag: "紅葉",
    params: {
      ...cloneParams(baseParams),
      angle: 39,
      angleVariance: 9,
      seed: 1729,
      maxLength: 0.82,
      initLength: 0.82,
      maxThickness: 0.17,
      initThickness: 0.17,
      scale: 0.79,
      gravity: 0.25,
      branchColor: "#685248",
      leafColor: "#bc4c3e",
      leafTextureKey: "leaf_maple",
      leafSize: 0.69,
      premise: "FFA",
      rules: [
        {
          expression:
            'A=F[+(65)L][-(65)L]F[!"+A]/(110)[!"&A]/(125)[!"-A]/(125)[!"^A]',
        },
      ],
    },
  },
  {
    id: "sakura",
    name: "サクラ",
    latinName: "Prunus serrulata",
    description:
      "淡い桜色の花が枝先を包む春の木。花の大きさで咲き方を調整できます。",
    tag: "花木",
    params: {
      ...cloneParams(baseParams),
      angle: 34,
      angleVariance: 8,
      seed: 31415,
      scale: 0.78,
      maxThickness: 0.17,
      initThickness: 0.17,
      branchColor: "#71574e",
      leafColor: "#a1ad63",
      leafSize: 0.19,
      flowerColor: "#f7c2d2",
      flowerSize: 0.65,
      budColor: "#de8eae",
      budSize: 0.16,
      premise: "FFA",
      rules: [
        {
          expression:
            'A=F[&(65)K][^(50)K][/(90)+(50)K]F[!"+A]/(120)[!"&A]/(120)[!"-A]/(120)[!"^A]M',
        },
      ],
    },
  },
  {
    id: "fern",
    name: "シダ",
    latinName: "Dryopteris erythrosora",
    description:
      "繰り返す枝分かれが描く繊細な葉。規則から生まれる自然の形を観察します。",
    tag: "草本",
    params: {
      ...cloneParams(baseParams),
      generations: 6,
      maxLength: 0.5,
      initLength: 0.5,
      maxThickness: 0.045,
      initThickness: 0.045,
      angle: 54,
      angleVariance: 3,
      seed: 2718,
      scale: 0.73,
      widthDecay: 0.9,
      gravity: 0.1,
      branchColor: "#678343",
      leafColor: "#507b43",
      leafSize: 0.32,
      budSize: 0.06,
      premise: "[&(24)A]/(72)[&(24)A]/(72)[&(24)A]/(72)[&(24)A]/(72)[&(24)A]",
      rules: [
        { expression: 'A=F[!"+B][!"-B]"^(4)A' },
        { expression: 'B=F[+(35)L][-(35)L]"B' },
      ],
    },
  },
];

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
  if (
    value.leafTextureKey !== "leaf_default" &&
    value.leafTextureKey !== "leaf_maple"
  ) {
    throw new Error(
      "葉の形は leaf_default または leaf_maple を指定してください。",
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
    growthMode: value.growthMode,
    maxLength: numberField(value.maxLength, "枝の長さ", 0.01, 5),
    initLength: numberField(value.initLength, "現在の枝の長さ", 0, 5),
    maxThickness: numberField(value.maxThickness, "幹の太さ", 0.005, 2),
    initThickness: numberField(value.initThickness, "現在の幹の太さ", 0, 2),
    generations: numberField(value.generations, "世代", 0, 12, true),
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
