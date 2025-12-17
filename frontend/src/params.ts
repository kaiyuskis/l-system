import type { AppParams, LSystemRule, UIState } from "./types";

export function createDefaultParams(): AppParams {
  return {
    growthMode: true,

    initLength: 1.0,
    maxLength: 1.0,
    initThickness: 1.0,
    maxThickness: 1.0,

    generations: 7,
    angle: 28.0,
    angleVariance: 5.0,
    seed: 0,
    gravity: 1.0,
    branchColor: "#ffffff",

    scale: 0.95,
    widthDecay: 0.90,

    flowerColor: "#fef4f4",
    flowerSize: 1.0,
    leafColor: "#ffffff",
    leafTextureKey: "leaf_default",
    leafSize: 0.7,
    budColor: "#ADFF2F",
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
  };
}
