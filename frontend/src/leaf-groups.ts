import type { LeafGroupMap, LeafGroupParams } from "./types";

const LS_KEY = "lsystem_leaf_groups_v1";

const defaultLeafGroups: Record<string, LeafGroupParams> = {
  "カエデ": {
    generations: 5,
    angle: 24,
    angleVariance: 6,
    scale: 0.9,
    widthDecay: 0.9,
    initLength: 0.3,
    initThickness: 0.05,
    flowerColor: "#F7C6D0",
    flowerSize: 1.0,
    leafColor: "#2E8B57",
    leafSize: 1.0,
    budColor: "#9ACD32",
    budSize: 0.3,
    flowerOutlineEnabled: true,
    flowerOutlineMirror: true,
    flowerOutlineGenerations: 0,
    flowerOutlineAngle: 30,
    flowerOutlineStep: 0.2,
    flowerOutlinePremise: "F",
    flowerOutlineRules: [
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
    budOutlineEnabled: true,
    budOutlineMirror: true,
    budOutlineGenerations: 0,
    budOutlineAngle: 30,
    budOutlineStep: 0.2,
    budOutlinePremise: "F",
    budOutlineRules: [
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
    leafBend: 0.5,
    outlineEnabled: true,
    outlineMirror: true,
    outlineGenerations: 0,
    outlineAngle: 30,
    outlineStep: 0.25,
    outlinePremise: "F(0.5)+F(0.5)+F(0.5)-F(0.5)-F(0.5)-F(0.5)-F(0.5)+F(0.5)",
    outlineRules: [
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
    premise: "A",
    rules: [
      { expression: "A=F[&(60)LM]/(137.5)A" },
      { expression: "" },
      { expression: "" },
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
    flowerColor: "#F7C6D0",
    flowerSize: 0.5,
    leafColor: "#2E8B57",
    leafSize: 0.55,
    budColor: "#9ACD32",
    budSize: 0.25,
    flowerOutlineEnabled: false,
    flowerOutlineMirror: true,
    flowerOutlineGenerations: 0,
    flowerOutlineAngle: 30,
    flowerOutlineStep: 0.2,
    flowerOutlinePremise: "F",
    flowerOutlineRules: [
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
    budOutlineEnabled: false,
    budOutlineMirror: true,
    budOutlineGenerations: 0,
    budOutlineAngle: 30,
    budOutlineStep: 0.2,
    budOutlinePremise: "F",
    budOutlineRules: [
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
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
    flowerColor: params.flowerColor ?? "#F7C6D0",
    flowerSize: params.flowerSize ?? 0.8,
    leafColor: params.leafColor ?? "#2E8B57",
    leafSize: params.leafSize,
    budColor: params.budColor ?? "#9ACD32",
    budSize: params.budSize ?? 0,
    flowerOutlineEnabled: params.flowerOutlineEnabled ?? false,
    flowerOutlineMirror: params.flowerOutlineMirror ?? true,
    flowerOutlineGenerations: params.flowerOutlineGenerations ?? 0,
    flowerOutlineAngle: params.flowerOutlineAngle ?? 30,
    flowerOutlineStep: params.flowerOutlineStep ?? 0.2,
    flowerOutlinePremise: params.flowerOutlinePremise ?? "F",
    flowerOutlineRules: (params.flowerOutlineRules ?? []).map(rule => ({ expression: rule.expression })),
    budOutlineEnabled: params.budOutlineEnabled ?? false,
    budOutlineMirror: params.budOutlineMirror ?? true,
    budOutlineGenerations: params.budOutlineGenerations ?? 0,
    budOutlineAngle: params.budOutlineAngle ?? 30,
    budOutlineStep: params.budOutlineStep ?? 0.2,
    budOutlinePremise: params.budOutlinePremise ?? "F",
    budOutlineRules: (params.budOutlineRules ?? []).map(rule => ({ expression: rule.expression })),
    leafBend: params.leafBend ?? 0,
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
    generations: 5,
    angle: 25,
    angleVariance: 0,
    scale: 1.0,
    widthDecay: 0.9,
    initLength: 0.3,
    initThickness: 0.05,
    flowerColor: "#F7C6D0",
    flowerSize: 0.8,
    leafColor: "#2E8B57",
    leafSize: 1.0,
    budColor: "#9ACD32",
    budSize: 0.5,
    flowerOutlineEnabled: false,
    flowerOutlineMirror: true,
    flowerOutlineGenerations: 0,
    flowerOutlineAngle: 30,
    flowerOutlineStep: 0.2,
    flowerOutlinePremise: "F",
    flowerOutlineRules: [
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
    budOutlineEnabled: false,
    budOutlineMirror: true,
    budOutlineGenerations: 0,
    budOutlineAngle: 30,
    budOutlineStep: 0.2,
    budOutlinePremise: "F",
    budOutlineRules: [
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
      { expression: "" },
    ],
    leafBend: 0.5,
    outlineEnabled: true,
    outlineMirror: true,
    outlineGenerations: 0,
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
