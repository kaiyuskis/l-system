import "./style.css";
import * as THREE from "three";
import { Pane } from "tweakpane";
import { scene } from "./three-setup.ts";
import { generateLSystemString, createLSystem3D } from "./l-system.ts";

let currentPlant: THREE.Group | null = null;

interface LSystemRule {
  expression: string;
}

const params = {
  premise: "FFFA",
  generations: 7,

  initLength: 1.0,
  initThickness: 0.1,

  angle: 28.0,
  scale: 1.0,

  branchColor: "#8B4113",

  rules: [
    { expression: 'A=!"[B]////[B]////[B]' },
    { expression: "B=&FFFA" },
    { expression: "" },
    { expression: "" },
    { expression: "" },
  ] as LSystemRule[],
};

function regenerate() {
  if (currentPlant) scene.remove(currentPlant);

  // 1. ルール辞書作成
  const rules: { [key: string]: string } = {};

  params.rules.forEach((r) => {
    const expr = r.expression.trim();
    if (!expr) return; // 空ならスキップ

    // "=" で分割する
    const parts = expr.split("=");
    if (parts.length >= 2) {
      const char = parts[0].trim(); // 左辺 (A)
      // 右辺 (ルール) は、= が複数ある場合も考慮して残りを結合
      const ruleBody = parts.slice(1).join("=").trim();

      if (char && ruleBody) {
        rules[char] = ruleBody;
      }
    }
  });

  // 2. 文字列生成
  const str = generateLSystemString(
    params.premise,
    rules,
    Math.floor(params.generations)
  );

  // 3. 3D生成 (パラメータを渡す)
  const leafMats: THREE.Matrix4[] = [];
  currentPlant = createLSystem3D(
    str,
    {
      initLen: params.initLength,
      initWid: params.initThickness,
      angle: params.angle,
      turn: 0, // 今回は angle で統一
      scale: params.scale,
    },
    params.branchColor,
    leafMats
  );
  scene.add(currentPlant);
}

// --- UI ---
const pane = new Pane({ title: "L-System" });
pane.addButton({ title: "生成" }).on("click", regenerate);

const tab = pane.addTab({ pages: [{ title: "基本" }, { title: "ルール" }] });
const p1 = tab.pages[0];
p1.addBinding(params, "premise").on("change", regenerate);
p1.addBinding(params, "generations", { min: 1, max: 12, step: 1 }).on(
  "change",
  regenerate
);
p1.addBinding(params, "initLength", { min: 0.1, max: 5 }).on(
  "change",
  regenerate
);
p1.addBinding(params, "initThickness", { min: 0.01, max: 1 }).on(
  "change",
  regenerate
);
p1.addBinding(params, "angle", { min: 0, max: 180 }).on("change", regenerate);
p1.addBinding(params, "scale", { min: 0.1, max: 2 }).on("change", regenerate);
p1.addBinding(params, "branchColor").on("change", regenerate);

const p2 = tab.pages[1];
params.rules.forEach((r, i) => {
  p2.addBinding(r, "expression", {
    label: `Rule ${i + 1}`,
  });
});

regenerate();
