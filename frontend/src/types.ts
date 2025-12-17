import type * as THREE from "three";

export interface LSystemRule { expression: string; }

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
  leafTextureKey: string;
  leafSize: number;
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
  __rebuildPresetSelect?: () => void;
};

export type PresetEntry = {
  savedAt: number;
  data: any;
};

export type PresetMap = Record<string, PresetEntry>;

export type InstancedPoint = {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: number;
  thickness: number;
};
