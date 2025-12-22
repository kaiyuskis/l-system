import type * as THREE from "three";

export interface LSystemRule { expression: string; }
export interface LeafGroupRule { expression: string; }

export type PerfTimings = {
  rewriteMs: number;
  interpretMs: number;
  meshMs: number;
  totalMs: number;
};

export type StructureMetrics = {
  generations: number;
  stringLength: number;

  branchSegments: number;
  branchCountF: number;

  bracketPushes: number;
  maxBranchDepth: number;

  leaves: number;
  flowers: number;
  buds: number;

  bboxHeight: number;
  bboxWidth: number;
  bboxDepth: number;
};

export type RenderMetrics = {
  drawCalls: number;
  triangles: number;
};

export type AppParams = {
  growthMode: boolean;

  initLength: number;
  maxLength: number;
  initThickness: number;
  maxThickness: number;

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
  leafSize: number;
  leafGroupName: string;
  budColor: string;
  budSize: number;

  premise: string;
  rules: LSystemRule[];

  resultInfo: string;
  resultText: string;

  debugBranches: boolean;
  debugLeaves: boolean;
};

export type UIState = {
  presetName: string;
  presetSelected: string;
  presetList: string[];
  leafGroupNameInput: string;
  leafGroupList: string[];
  leafGroupDraft: LeafGroupParams;
  __rebuildPresetSelect?: () => void;
  __rebuildLeafGroupSelect?: () => void;
};

export type PresetEntry = {
  savedAt: number;
  data: any;
};

export type PresetMap = Record<string, PresetEntry>;

export type LeafGroupParams = {
  generations: number;
  angle: number;
  angleVariance: number;
  scale: number;
  widthDecay: number;
  initLength: number;
  initThickness: number;
  flowerColor: string;
  flowerSize: number;
  leafColor: string;
  leafSize: number;
  budColor: string;
  budSize: number | null;

  flowerOutlineEnabled: boolean;
  flowerOutlineMirror: boolean;
  flowerOutlineGenerations: number;
  flowerOutlineAngle: number;
  flowerOutlineStep: number;
  flowerOutlinePremise: string;
  flowerOutlineRules: LeafGroupRule[];

  budOutlineEnabled: boolean;
  budOutlineMirror: boolean;
  budOutlineGenerations: number;
  budOutlineAngle: number;
  budOutlineStep: number;
  budOutlinePremise: string;
  budOutlineRules: LeafGroupRule[];

  outlineEnabled: boolean;
  outlineMirror: boolean;
  outlineGenerations: number;
  outlineAngle: number;
  outlineStep: number;
  outlinePremise: string;
  outlineRules: LeafGroupRule[];
  leafBend?: number;
  premise: string;
  rules: LeafGroupRule[];
};

export type LeafGroupEntry = {
  savedAt: number;
  data: LeafGroupParams;
};

export type LeafGroupMap = Record<string, LeafGroupEntry>;

export type InstancedPoint = {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: number;
  thickness: number;
};
