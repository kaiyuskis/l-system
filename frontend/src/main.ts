import "./style.css";
import * as THREE from "three";
import { Pane } from "tweakpane";
import { scene } from "./three-setup.ts";
import { generateLSystemString, createLSystemData, type BranchSegment } from "./l-system.ts";
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';


// --- グローバル変数 ---
const treeGroup = new THREE.Group();
scene.add(treeGroup);

// メッシュのインスタンス変数
let branchMesh: THREE.Mesh | null = null;
let flowerMesh: THREE.InstancedMesh | null = null;
let leafMesh: THREE.InstancedMesh | null = null;
let budMesh: THREE.InstancedMesh | null = null;

// 型定義
interface LSystemRule { expression: string; }

// パラメータ
const params = {
  initLength: 1.0,
  initThickness: 0.1,

  generations: 5,
  scale: 0.7,
  angle: 28.0,
  angleVariance: 0.0,
  branchColor: "#ffffff",

  swellFrequency: 2.0, // 膨らみの頻度
  swellAmplitude: 0.3, // 膨らみの強さ (0.0 ~ 1.0)

  flowerColor: "#FF69B4",
  flowerSize: 0.5,
  leafColor: "#228B22",
  leafSize: 0.5,
  budColor: "#ADFF2F",
  budSize: 0.3,

  premise: "[+(110)F(3)][-(110)F(3)][&(110)F(3)][^(110)F(3)] F(5, 1.5) A",

  rules: [
    { expression: 'A=!"F[&B]////[&B]////B' },
    { expression: 'B=FFFAL' },
    { expression: '' },
    { expression: '' },
    { expression: '' },
    { expression: '' },
    { expression: '' },
    { expression: '' },
    { expression: '' },
    { expression: '' },
  ] as LSystemRule[],

  resultInfo: '0',
  resultText: '',
};

// --- テクスチャの準備 ---
const texLoader = new THREE.TextureLoader();

const barkTexture = texLoader.load('bark.jpg');
barkTexture.wrapS = THREE.RepeatWrapping;
barkTexture.wrapT = THREE.RepeatWrapping;

const flowerTexture = texLoader.load('flower.png');
const leafTexture = texLoader.load('leaf.png');
const budTexture = texLoader.load('bud.png');

// --- ジオメトリとマテリアルの準備 ---
// 枝
const branchGeo = new THREE.CylinderGeometry(0.7, 1.0, 1, 10);
branchGeo.translate(0, 0.5, 0);

const matBranch = new THREE.MeshStandardMaterial({ 
  map: barkTexture,
  color: params.branchColor,
  roughness: 0.9,
  bumpScale: 0.1,
});

// 花
const flowerPrototypeGeo = new THREE.PlaneGeometry(1, 1);
const flowerPrototypeMat = new THREE.MeshStandardMaterial({
  map: flowerTexture,
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});

// 葉
const leafPrototypeGeo = new THREE.PlaneGeometry(1, 1);
const leafPrototypeMat = new THREE.MeshStandardMaterial({
  map: leafTexture,
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});

// つぼみ
const budPrototypeGeo = new THREE.PlaneGeometry(1, 1);
const budPrototypeMat = new THREE.MeshStandardMaterial({
  map: budTexture,
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});

function buildOrganicTreeGeometry(segments: BranchSegment[]): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  let seed = 0;
  const random = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  const noise = (x: number) => Math.sin(x * params.swellFrequency) * params.swellAmplitude;

  const radialSegments = 6;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const start = seg.start;
    const end = seg.end;
    const thickness = seg.thickness;
  
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    const noiseValStart = noise(start.x + start.y + start.z);
    const noiseValEnd = noise(end.x + end.y + end.z);

    const rudiusTop = thickness * (1.0 + noiseValEnd);
    const rudiusBottom = thickness * (1.0 + noiseValStart);

    const geo = new THREE.CylinderGeometry(
      rudiusTop,
      rudiusBottom,
      length,
      radialSegments
    );

    // 向きの調整
    geo.translate(0, length / 2, 0);
    geo.rotateX(Math.PI / 2);
    geo.lookAt(direction);
    geo.translate(start.x, start.y, start.z);

    geometries.push(geo);
  }

  if (geometries.length === 0) return new THREE.BufferGeometry();
  const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries, false);
  return mergedGeo;
}

// --- 再生成関数 ---
function regenerate() {
  treeGroup.clear();
  if (branchMesh) { branchMesh.geometry.dispose(); branchMesh = null; }
  if (leafMesh) { leafMesh.dispose(); leafMesh = null; }

  // ルール解析
  const rules: { [key: string]: string } = {};
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

  // 文字列本体 (2000文字まで)
  if (str.length > 2000) {
    params.resultText = str.substring(0, 2000) + ' ... (省略)';
  } else {
    params.resultText = str;
  }
  
  pane.refresh();

  // L-System データ生成
  const data = createLSystemData(
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
    }
  );

  console.time("Building Geometry");
  const mergedGeo = buildOrganicTreeGeometry(data.branches);
  console.timeEnd("Building Geometry");

  if (mergedGeo) {
    matBranch.color.set(params.branchColor);
    branchMesh = new THREE.Mesh(mergedGeo, matBranch);
    branchMesh.castShadow = true;
    branchMesh.receiveShadow = true;
    treeGroup.add(branchMesh);
  }

  if (data.flowers.length > 0) {
    flowerPrototypeMat.color.set(params.flowerColor);
    flowerMesh = new THREE.InstancedMesh(
      flowerPrototypeGeo,
      flowerPrototypeMat,
      data.flowers.length
    );
    flowerMesh.castShadow = true;
    flowerMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < data.flowers.length; i++) {
      const f = data.flowers[i];
      dummy.position.copy(f.position);
      dummy.quaternion.copy(f.rotation);
      dummy.scale.setScalar(f.scale);
      dummy.translateY(f.scale * 0.5);
      dummy.updateMatrix();
      flowerMesh.setMatrixAt(i, dummy.matrix);
    }
    flowerMesh.instanceMatrix.needsUpdate = true;
    treeGroup.add(flowerMesh);
  }

  
  if (data.leaves.length > 0) {
    leafPrototypeMat.color.set(params.leafColor);
    leafMesh = new THREE.InstancedMesh(
      leafPrototypeGeo,
      leafPrototypeMat,
      data.leaves.length
    );
    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < data.leaves.length; i++) {
      const l = data.leaves[i];
      dummy.position.copy(l.position);
      dummy.quaternion.copy(l.rotation);
      dummy.scale.setScalar(l.scale);
      dummy.translateY(l.scale * 0.5);
      dummy.updateMatrix();
      leafMesh.setMatrixAt(i, dummy.matrix);
    }
    leafMesh.instanceMatrix.needsUpdate = true;
    treeGroup.add(leafMesh);
  }

  if (data.buds.length > 0) {
    budPrototypeMat.color.set(params.budColor);
    budMesh = new THREE.InstancedMesh(
      budPrototypeGeo,
      budPrototypeMat,
      data.buds.length
    );
    budMesh.castShadow = true;
    budMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < data.buds.length; i++) {
      const b = data.buds[i];
      dummy.position.copy(b.position);
      dummy.quaternion.copy(b.rotation);
      dummy.scale.setScalar(b.scale);
      dummy.translateY(b.scale * 0.5);
      dummy.updateMatrix();
      budMesh.setMatrixAt(i, dummy.matrix);
    }
    budMesh.instanceMatrix.needsUpdate = true;
    treeGroup.add(budMesh);
  }

  console.log(`Generated: Branches=${data.branches.length}, Leaves=${data.leaves.length}`);
}


// --- 色更新だけの関数 ---
function updateColors() {
  matBranch.color.set(params.branchColor);
  flowerPrototypeMat.color.set(params.flowerColor);
  leafPrototypeMat.color.set(params.leafColor);
  leafPrototypeMat.color.set(params.budColor);
}

// Tweakpane UI
const pane = new Pane({ title: "L-System" });

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
p1.addBinding(params, "generations", { label: "世代", min: 1, max: 15, step: 1 }).on("change", regenerate);
p1.addBinding(params, "scale", { label: "成長率", min: 0.1, max: 2 }).on( "change", regenerate);
p1.addBinding(params, "angle", { label: "角度", min: 0, max: 180, step: 0.1 }).on("change", regenerate);
p1.addBinding(params, "angleVariance", { label: "角度の偏差", min: 0, max: 45, step: 0.1 }).on("change", regenerate);
p1.addBinding(params, "branchColor", { label: "枝の色" }).on("change", updateColors);

p1.addBlade({ view: 'separator' });
p1.addBinding(params, 'swellFrequency', { label: '膨らみ頻度', min: 0, max: 10 }).on('change', regenerate);
p1.addBinding(params, 'swellAmplitude', { label: '膨らみ強度', min: 0, max: 1.0 }).on('change', regenerate);

const p2 = tab.pages[1];
p2.addBinding(params, 'flowerColor').on('change', updateColors);
p2.addBinding(params, 'flowerSize', { label: "花", min: 0, max: 5 }).on('change', regenerate);

p2.addBlade({ view: 'separator' });
p2.addBinding(params, 'leafColor').on('change', updateColors);
p2.addBinding(params, 'leafSize', { label: "葉", min: 0, max: 5 }).on('change', regenerate);

p2.addBlade({ view: 'separator'});
p2.addBinding(params, 'budColor').on('change', updateColors);
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

pane.addButton({ title: "生成" }).on("click", regenerate);

regenerate();
