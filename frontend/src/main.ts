import "./style.css";
import * as THREE from "three";
import { Pane } from "tweakpane";
import { scene } from "./three-setup.ts";
import { generateLSystemString, createLSystem3D } from "./l-system.ts";

// --- グローバル変数 ---
const treeGroup = new THREE.Group();
scene.add(treeGroup);

// メッシュのインスタンス変数
let branchMesh: THREE.InstancedMesh | null = null;
let flowerMesh: THREE.InstancedMesh | null = null;
let leafMesh: THREE.InstancedMesh | null = null;
let budMesh: THREE.InstancedMesh | null = null;

// 型定義
interface LSystemRule { expression: string; }

// パラメータ
const params = {
  initLength: 1.0,
  initThickness: 0.1,

  generations: 7,
  scale: 0.7,
  angle: 28.0,
  angleVariance: 0.0,
  branchColor: "#8B4113",

  flowerColor: "#FF69B4",
  flowerSize: 0.5,
  leafColor: "#228B22",
  leafSize: 0.7,
  budColor: "#ADFF2F",
  budSize: 0.3,

  premise: "FFFA",

  rules: [
    { expression: 'A=!"[B]////[B]////[B]L' },
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

  resultInfo: '0',
  resultText: '',
};

// --- ジオメトリとマテリアルの準備 ---
// 枝
const texLoader = new THREE.TextureLoader();
const geoPlane = new THREE.PlaneGeometry(1, 1);
const geoBranch = new THREE.CylinderGeometry(1, 1, 1, 6);
geoBranch.translate(0, 0.5, 0);

const matBranch = new THREE.MeshStandardMaterial({ color: params.branchColor });

// 花
const matFlower = new THREE.MeshStandardMaterial({
  map: texLoader.load('flower.png'),
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});

// 葉
const matLeaf = new THREE.MeshStandardMaterial({
  map: texLoader.load('leaf.png'),
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});

// つぼみ
const matBud = new THREE.MeshStandardMaterial({
  map: texLoader.load('bud.png'),
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});

// --- 再生成関数 ---
function regenerate() {
  treeGroup.clear();

  const rules: { [key: string]: string } = {};

  // ルール解析
  params.rules.forEach(r => {
    const parts = r.expression.split('=');
    if (parts.length >= 2) 
      rules[parts[0].trim()] = parts.slice(1).join('=').trim();
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
  const mBranch: THREE.Matrix4[] = [];
  const mFlower: THREE.Matrix4[] = [];
  const mLeaf: THREE.Matrix4[] = [];
  const mBud: THREE.Matrix4[] = [];

  createLSystem3D(
    str,
    {
      initLen: params.initLength,
      initWid: params.initThickness,
      scale: params.scale,
      angle: params.angle,
      angleVariance: params.angleVariance,
      flowerSize: params.flowerSize,
      leafSize: params.leafSize,
      budSize: params.budSize,
    },
    mBranch,
    mFlower,
    mLeaf,
    mBud
  );

  // インスタンシングメッシュの生成
  const createInstanced = (geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], col?: string) => {
    if (matrices.length === 0) return;
    if (col && 'color' in mat) (mat as any).color.set(col);
    
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    treeGroup.add(mesh);
    return mesh;
  };

  branchMesh = createInstanced(geoBranch, matBranch, mBranch, params.branchColor) || null;
  flowerMesh = createInstanced(geoPlane, matFlower, mFlower, params.flowerColor) || null;
  leafMesh = createInstanced(geoPlane, matLeaf, mLeaf, params.leafColor) || null;
  budMesh = createInstanced(geoPlane, matBud, mBud, params.budColor) || null;

  console.log(`生成完了: 枝の数=${mBranch.length}, 花の数=${mFlower.length}, 葉の数=${mLeaf.length}, つぼみの数=${mBud.length}`);
}

// Tweakpane UI
const pane = new Pane({ title: "L-System" });
pane.addButton({ title: "生成" }).on("click", regenerate);

const tab = pane.addTab({
  pages: [
    { title: "基本設定" },
    { title: "器官設定" },
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

const p2 = tab.pages[1];
p2.addBlade({ view: 'separator' });
p2.addBinding(params, 'flowerColor').on('change', regenerate);
p2.addBinding(params, 'flowerSize', { label: "花", min: 0, max: 5 }).on('change', regenerate);

p2.addBlade({ view: 'separator' });
p2.addBinding(params, 'leafColor').on('change', regenerate);
p2.addBinding(params, 'leafSize', { label: "葉", min: 0, max: 5 }).on('change', regenerate);

p2.addBlade({ view: 'separator'});
p2.addBinding(params, 'budColor').on('change', regenerate);
p2.addBinding(params, 'budSize', { label: "つぼみ", min: 0, max: 5 }).on('change', regenerate);

const p3 = tab.pages[2];
p3.addBinding(params, "premise", { label: "初期状態" }).on("change", regenerate);

p3.addBlade({ view: "separator" });
params.rules.forEach((r, i) => {
  p3.addBinding(r, "expression", {label: `ルール ${i + 1}`});
});

const p4 = tab.pages[3];
p4.addBinding(params, 'resultInfo', { 
  label: '文字数', 
  readonly: true
});
p4.addBinding(params, 'resultText', { 
  label: '文字列',
  multiline: true,
  rows: 10,
  readonly: true
});



regenerate();
