import "./style.css";
import * as THREE from "three";
import { Pane } from "tweakpane";
import { scene } from "./three-setup.ts";
import { generateLSystemString, createLSystem3D } from "./l-system.ts";

let currentPlant: THREE.Group | null = null;

// 型定義
interface LSystemRule {
  expression: string;
}

// パラメータ
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

// 植物再生成
function regenerate() {
  if (currentPlant) scene.remove(currentPlant);

  // ルール辞書作成
  const rules: { [key: string]: string } = {};

  params.rules.forEach((r) => {
    const expr = r.expression.trim();
    if (!expr) return;

    // "=" で分割する
    const parts = expr.split("=");
    if (parts.length >= 2) {
      const char = parts[0].trim();
      const ruleBody = parts.slice(1).join("=").trim();

      if (char && ruleBody) {
        rules[char] = ruleBody;
      }
    }
  });

  // 文字列生成
  const str = generateLSystemString(
    params.premise,
    rules,
    Math.floor(params.generations)
  );

  // 3Dモデル生成
  const leafMats: THREE.Matrix4[] = [];
  currentPlant = createLSystem3D(
    str,
    {
      initLen: params.initLength,
      initWid: params.initThickness,
      angle: params.angle,
      turn: 0,
      scale: params.scale,
    },
    params.branchColor,
    leafMats
  );
  scene.add(currentPlant);
}

// UI
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
