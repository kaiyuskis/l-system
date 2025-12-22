import type { AppParams, LSystemRule, UIState } from "./types";
import { createDefaultLeafGroupDraft } from "./leaf-groups";

export function createDefaultParams(): AppParams {
  return {
    growthMode: true,

    initLength: 1.0,
    maxLength: 1.0,
    initThickness: 1.0,
    maxThickness: 1.0,

    generations: 7,
    angle: 28.0,
    angleVariance: 0.0,
    seed: 0,
    gravity: 0.0,
    branchColor: "#8B5A2B",

    scale: 0.95,
    widthDecay: 0.90,

    flowerColor: "#F7C6D0",
    flowerSize: 1.0,
    leafColor: "#2E8B57",
    leafSize: 1.0,
    leafGroupName: "カエデ",
    budColor: "#9ACD32",
    budSize: 1.0,

    premise: "A",

    rules: [
      { expression: 'A=FFFB' },
      { expression: 'B=FFF"![C]////[C]////[C]////[&D]' },
      { expression: 'C=&F+(15)F-(15)F^(15)F+BL' },
      { expression: 'D="(0.7)!(0.5)FFBL' },
      { expression: '' },
      { expression: '' },
      { expression: '' },
      { expression: '' },
      { expression: '' },
      { expression: '' },
    ] as LSystemRule[],

    resultInfo: '0',
    resultText: '',

    debugBranches: false,
    debugLeaves: false,
  };
}

export function createInitialUIState(): UIState {
  return {
    presetName: "myPreset",
    presetSelected: "",
    presetList: [],
    leafGroupNameInput: "新しい葉グループ",
    leafGroupList: [],
    leafGroupDraft: createDefaultLeafGroupDraft(),
  };
}
