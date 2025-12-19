import type { LeafGroupMap, LeafGroupParams } from "./types";

const LS_KEY = "lsystem_leaf_groups_v1";

const defaultLeafGroups: Record<string, LeafGroupParams> = {
  "カエデ": {
    generations: 3,
    angle: 24,
    angleVariance: 6,
    scale: 0.9,
    widthDecay: 0.9,
    initLength: 0.35,
    initThickness: 0.03,
    leafSize: 0.8,
    budSize: 0.2,
    outlineEnabled: true,
    outlineMirror: true,
    outlineGenerations: 3,
    outlineAngle: 22,
    outlineStep: 0.25,
    outlinePremise: "F",
    outlineRules: [
      { expression: "F=F+F-F-F+F" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
    premise: "A",
    rules: [
      { expression: "A=F(0.9)[+(24)L][-(24)L]F(0.7)M" },
      { expression: "F=F(0.8)F(0.8)" },
      { expression: "L=L" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
  },
  "スギ": {
    generations: 3,
    angle: 18,
    angleVariance: 6,
    scale: 0.85,
    widthDecay: 0.92,
    initLength: 0.5,
    initThickness: 0.15,
    leafSize: 0.55,
    budSize: 0.25,
    outlineEnabled: false,
    outlineMirror: true,
    outlineGenerations: 2,
    outlineAngle: 20,
    outlineStep: 0.2,
    outlinePremise: "F",
    outlineRules: [
      { expression: "F=F+F-F" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
    premise: "A",
    rules: [
      { expression: "A=F[+L]F[-L]FA" },
      { expression: "L=L" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
  },
};

function cloneLeafGroupParams(params: LeafGroupParams): LeafGroupParams {
  return {
    generations: params.generations,
    angle: params.angle,
    angleVariance: params.angleVariance,
    scale: params.scale,
    widthDecay: params.widthDecay,
    initLength: params.initLength,
    initThickness: params.initThickness,
    leafSize: params.leafSize,
    budSize: params.budSize ?? 0,
    outlineEnabled: params.outlineEnabled ?? false,
    outlineMirror: params.outlineMirror ?? true,
    outlineGenerations: params.outlineGenerations ?? 2,
    outlineAngle: params.outlineAngle ?? 20,
    outlineStep: params.outlineStep ?? 0.2,
    outlinePremise: params.outlinePremise ?? "F",
    outlineRules: (params.outlineRules ?? []).map(rule => ({ expression: rule.expression })),
    premise: params.premise,
    rules: params.rules.map(rule => ({ expression: rule.expression })),
  };
}

function loadLeafGroupMap(): LeafGroupMap {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveLeafGroupMap(map: LeafGroupMap) {
  localStorage.setItem(LS_KEY, JSON.stringify(map));
}

export function ensureDefaultLeafGroups() {
  const map = loadLeafGroupMap();
  if (Object.keys(map).length > 0) return;

  const now = Date.now();
  for (const [name, params] of Object.entries(defaultLeafGroups)) {
    map[name] = { savedAt: now, data: cloneLeafGroupParams(params) };
  }
  saveLeafGroupMap(map);
}

export function createDefaultLeafGroupDraft(): LeafGroupParams {
  const first = defaultLeafGroups["カエデ"] || Object.values(defaultLeafGroups)[0];
  return first ? cloneLeafGroupParams(first) : {
    generations: 1,
    angle: 25,
    angleVariance: 0,
    scale: 1.0,
    widthDecay: 0.9,
    initLength: 0.5,
    initThickness: 0.1,
    leafSize: 0.6,
    budSize: 0.3,
    outlineEnabled: true,
    outlineMirror: true,
    outlineGenerations: 2,
    outlineAngle: 18,
    outlineStep: 0.2,
    outlinePremise: "F",
    outlineRules: [
      { expression: "F=F+F-F" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
    premise: "A",
    rules: [
      { expression: "A=LM" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
  };
}

export function listLeafGroupNames(): string[] {
  return Object.keys(loadLeafGroupMap()).sort((a, b) => a.localeCompare(b, "ja"));
}

export function saveLeafGroupToLocal(name: string, params: LeafGroupParams) {
  const map = loadLeafGroupMap();
  map[name] = { savedAt: Date.now(), data: cloneLeafGroupParams(params) };
  saveLeafGroupMap(map);
}

export function loadLeafGroupFromLocal(name: string): LeafGroupParams | null {
  const map = loadLeafGroupMap();
  const entry = map[name];
  if (!entry) return null;
  return cloneLeafGroupParams(entry.data);
}

export function deleteLeafGroupFromLocal(name: string) {
  const map = loadLeafGroupMap();
  delete map[name];
  saveLeafGroupMap(map);
}
