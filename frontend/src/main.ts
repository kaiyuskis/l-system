import "./style.css";
import * as THREE from "three";
import { Pane } from "tweakpane";
import { scene } from "./three-setup.ts";
import { generateLSystemString, createLSystem3D } from "./l-system.ts";

let currentPlant: THREE.Group | null = null;
let leafMesh: THREE.InstancedMesh | null = null;

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
  angleVariance: 10.0,

  scale: 0.7,
  leafSize: 0.7,

  branchColor: "#8B4113",
  leafColor: "#228B22",

  rules: [
    { expression: 'A=!"[B]////[B]////[B]' },
    { expression: "B=&FFFA" },
    { expression: "" },
    { expression: "" },
    { expression: "" },
  ] as LSystemRule[],
};

// 葉のテクスチャとジオメトリ/マテリアル
const textureLoader = new THREE.TextureLoader();
const leafTexture = textureLoader.load('leaf.png'); 

const leafPrototypeGeo = new THREE.PlaneGeometry(1, 1);
const leafPrototypeMat = new THREE.MeshStandardMaterial({
  map: leafTexture,
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5,
});

// 再生成
function regenerate() {
  if (currentPlant) {
    scene.remove(currentPlant);
    currentPlant.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
  if (leafMesh) {
    scene.remove(leafMesh);
    leafMesh.dispose();
  }

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
  const leafMatrices: THREE.Matrix4[] = [];
  currentPlant = createLSystem3D(
    str,
    {
      initLen: params.initLength,
      initWid: params.initThickness,
      angle: params.angle,
      angleVariance: params.angleVariance,
      turn: 0,
      scale: params.scale,
      leafSize: params.leafSize,
    },
    params.branchColor,
    leafMatrices
  );
  scene.add(currentPlant);

  if (leafMatrices.length > 0) {
    leafPrototypeMat.color.set(params.leafColor);
    leafMesh = new THREE.InstancedMesh(leafPrototypeGeo, leafPrototypeMat, leafMatrices.length);
    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;
    for (let i = 0; i < leafMatrices.length; i++) {
      leafMesh.setMatrixAt(i, leafMatrices[i]);
    }
    leafMesh.instanceMatrix.needsUpdate = true;
    scene.add(leafMesh);
  }
}

// UI
const pane = new Pane({ title: "L-System" });
pane.addButton({ title: "生成" }).on("click", regenerate);

const tab = pane.addTab({ pages: [{ title: "基本設定" }, { title: "ルール" }] });
const p1 = tab.pages[0];
p1.addBinding(params, "initLength", { label: "初期の長さ", min: 0.1, max: 5 }).on("change", regenerate);
p1.addBinding(params, "initThickness", { label: "初期の太さ", min: 0.01, max: 1 }).on("change", regenerate);

p1.addBlade({ view: "separator" });
p1.addBinding(params, "generations", { label: "世代", min: 1, max: 13, step: 1 }).on("change", regenerate);
p1.addBinding(params, "scale", { label: "成長率", min: 0.1, max: 2 }).on( "change", regenerate);
p1.addBinding(params, "angle", { label: "角度", min: 0, max: 180 }).on("change", regenerate);
p1.addBinding(params, "angleVariance", { label: "角度の偏差", min: 0, max: 45 }).on("change", regenerate);
p1.addBinding(params, "branchColor", { label: "枝の色" }).on("change", regenerate);

p1.addBlade({ view: "separator" });
p1.addBinding(params, "leafColor", { label: "葉の色" }).on("change", regenerate);
p1.addBinding(params, "leafSize", { label: "葉の大きさ", min: 0.1, max: 5.0 }).on("change", regenerate);

const p2 = tab.pages[1];
p2.addBinding(params, "premise", { label: "初期状態" }).on("change", regenerate);
p2.addBlade({ view: "separator" });

params.rules.forEach((r, i) => {
  p2.addBinding(r, "expression", {label: `ルール ${i + 1}`});
});

regenerate();
