import "./style.css";
import * as THREE from "three";
import { Pane } from "tweakpane";
import { scene } from "./three-setup.ts";
import { generateLSystemString, createLSystem3D } from "./l-system.ts";

// --- グローバル変数 ---
const treeGroup = new THREE.Group();
scene.add(treeGroup);

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

  resultInfo: 'Length: 0',
  resultText: '',

  rules: [
    { expression: 'A=!"[B]////[B]////[B]' },
    { expression: "B=&FFFA" },
    { expression: "" },
    { expression: "" },
    { expression: "" },
    { expression: "" },
    { expression: "" },
    { expression: "" },
    { expression: "" },
    { expression: "" },
  ] as LSystemRule[],
};

// --- ジオメトリとマテリアルの準備 ---
// 枝の原型
const branchGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
branchGeo.translate(0, 0.5, 0);
const branchMat = new THREE.MeshStandardMaterial({ color: params.branchColor });

// 葉の原型
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

// --- 再生成関数 ---
function regenerate() {
  try {
    treeGroup.clear();

    const rules: { [key: string]: string } = {};

    // ルール解析
    params.rules.forEach((r) => {
      const expr = r.expression.trim();
      if (!expr) return;

      const parts = expr.split("="); // "="で分割
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

    // 文字数
    params.resultInfo = str.length.toLocaleString();
  
    // 文字列本体 (長すぎる場合は切り詰め)
    if (str.length > 2000) {
      params.resultText = str.substring(0, 2000) + ' ... (省略)';
    } else {
      params.resultText = str;
    }
    
    pane.refresh();

    // 行列計算
    const branchMatrices: THREE.Matrix4[] = [];
    const leafMatrices: THREE.Matrix4[] = [];
    createLSystem3D(
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
      branchMatrices,
      leafMatrices
    );

  // 枝の描画
    if (branchMatrices.length > 0) {
      branchMat.color.set(params.branchColor);

      const mesh = new THREE.InstancedMesh(branchGeo, branchMat, branchMatrices.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      for (let i = 0; i < branchMatrices.length; i++) {
        mesh.setMatrixAt(i, branchMatrices[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;

      treeGroup.add(mesh);
    }

    // 葉の描画
    if (leafMatrices.length > 0) {
      leafPrototypeMat.color.set(params.leafColor);
      
      const mesh = new THREE.InstancedMesh(leafPrototypeGeo, leafPrototypeMat, leafMatrices.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      for (let i = 0; i < leafMatrices.length; i++) {
        mesh.setMatrixAt(i, leafMatrices[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;

      treeGroup.add(mesh);
    }

    console.log(`生成完了: 枝の数=${branchMatrices.length}, 葉の数=${leafMatrices.length}`);
  } catch (error) {
    console.error(`再生成中にエラーが発生: ${error}`);
  }
}

// Tweakpane UI
const pane = new Pane({ title: "L-System" });
pane.addButton({ title: "生成" }).on("click", regenerate);

const tab = pane.addTab({
  pages: [
    { title: "基本設定" },
    { title: "ルール" },
    { title: "情報" },
  ]
});

const p1 = tab.pages[0];
p1.addBinding(params, "initLength", { label: "初期の長さ", min: 0.1, max: 5 }).on("change", regenerate);
p1.addBinding(params, "initThickness", { label: "初期の太さ", min: 0.01, max: 1 }).on("change", regenerate);

p1.addBlade({ view: "separator" });
p1.addBinding(params, "generations", { label: "世代", min: 1, max: 25, step: 1 }).on("change", regenerate);
p1.addBinding(params, "scale", { label: "成長率", min: 0.1, max: 2 }).on( "change", regenerate);
p1.addBinding(params, "angle", { label: "角度", min: 0, max: 180, step: 0.1 }).on("change", regenerate);
p1.addBinding(params, "angleVariance", { label: "角度の偏差", min: 0, max: 45, step: 0.1 }).on("change", regenerate);
p1.addBinding(params, "branchColor", { label: "枝の色" }).on("change", regenerate);

p1.addBlade({ view: "separator" });
p1.addBinding(params, "leafColor", { label: "葉の色" }).on("change", regenerate);
p1.addBinding(params, "leafSize", { label: "葉の大きさ", min: 0.0, max: 5.0, step: 0.1 }).on("change", regenerate);

const p2 = tab.pages[1];
p2.addBinding(params, "premise", { label: "初期状態" }).on("change", regenerate);
p2.addBlade({ view: "separator" });

params.rules.forEach((r, i) => {
  p2.addBinding(r, "expression", {label: `ルール ${i + 1}`});
});

const p3 = tab.pages[2];
p3.addBinding(params, 'resultInfo', { 
  label: '文字数', 
  readonly: true
});
p3.addBinding(params, 'resultText', { 
  label: '文字列',
  multiline: true,
  rows: 10,
  readonly: true
});

regenerate();
