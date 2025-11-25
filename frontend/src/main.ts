import "./style.css";
import * as THREE from "three";
import { scene } from "./three-setup.ts";
import { generateLSystemString, createLSystemData, type BranchSegment, type OrganPoint } from "./l-system.ts";
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { setupUI } from './ui-setup.ts';

// --- グローバル変数 ---
const treeGroup = new THREE.Group();
scene.add(treeGroup);

let pane: any;

// メッシュのインスタンス変数
let branchMesh: THREE.Mesh | null = null;
let flowerMesh: THREE.InstancedMesh | null = null;
let leafMesh: THREE.InstancedMesh | null = null;
let budMesh: THREE.InstancedMesh | null = null;

// 型定義
interface LSystemRule { expression: string; }

// パラメータ
const params = {
  growthMode: true,

  initLength: 1.0,
  maxLength: 1.0,
  initThickness: 1.0,
  maxThickness: 1.0,

  generations: 6,
  angle: 28.0,
  angleVariance: 5.0,
  gravity: 1.0,
  branchColor: "#ffffff",

  scale: 0.95,
  widthDecay: 0.90,

  flowerColor: "#fef4f4",
  flowerSize: 1.0,
  leafColor: "#fffff0",
  leafSize: 1.0,
  budColor: "#ADFF2F",
  budSize: 1.0,

  premise: "A",

  rules: [
    { expression: 'A=FFFB' },
    { expression: 'B=FFF"![C]////[C]////[C]////[&D]' },
    { expression: 'C=&F+(15)F-(15)F^(15)F+BL' },
    { expression: 'D="(0.7)!(0.5)FKFBL' },
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
const barkColor = texLoader.load('bark_willow_02_diff_4k.jpg');
barkColor.colorSpace = THREE.SRGBColorSpace;
const barkNormal = texLoader.load('bark_willow_02_nor_gl_4k.jpg');
const barkRoughness = texLoader.load('bark_willow_02_rough_4k.jpg');
[barkColor, barkNormal, barkRoughness].forEach(barkTexture => {
  barkTexture.wrapS = THREE.RepeatWrapping;
  barkTexture.wrapT = THREE.RepeatWrapping;
  barkTexture.repeat.set(4, 4);
});

const flowerTexture = texLoader.load('cherry_blossom.png');
const leafTexture = texLoader.load('leaf.png');
const budTexture = texLoader.load('bud.png');

// --- ジオメトリとマテリアルの準備 ---
// 枝
const matBranch = new THREE.MeshStandardMaterial({ 
  map: barkColor,
  normalMap: barkNormal,
  normalScale: new THREE.Vector2(16, 16),
  roughnessMap: barkRoughness,
  color: params.branchColor,
});

const geoPlane = new THREE.PlaneGeometry(1, 1);

// 花
const matFlower = new THREE.MeshStandardMaterial({
  map: flowerTexture,
  color: params.flowerColor,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});

// 葉
const matLeaf = new THREE.MeshStandardMaterial({
  map: leafTexture,
  color: params.leafColor,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});

// つぼみ
const matBud = new THREE.MeshStandardMaterial({
  map: budTexture,
  color: params.budColor,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});

function buildOrganicTreeGeometry(segments: BranchSegment[]): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  const radialSegments = 20;

  for (const seg of segments) {
    const length = seg.start.distanceTo(seg.end);

    const cylGeo = new THREE.CylinderGeometry(
      seg.radiusTop,
      seg.radiusBottom,
      length,
      radialSegments,
    );

    cylGeo.translate(0, length / 2, 0);
    cylGeo.rotateX(Math.PI / 2);
    cylGeo.lookAt(new THREE.Vector3().subVectors(seg.end, seg.start));
    cylGeo.translate(seg.start.x, seg.start.y, seg.start.z);

    geometries.push(cylGeo);

    const jointGeo = new THREE.SphereGeometry(seg.radiusBottom, radialSegments, radialSegments);
    jointGeo.translate(seg.start.x, seg.start.y, seg.start.z);
    geometries.push(jointGeo);
  }

  if (geometries.length === 0) return new THREE.BufferGeometry();
  const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries, false);

  geometries.forEach(geo => geo.dispose());

  return mergedGeo;
}

// 徹底的なメモリ掃除関数
function cleanUp(obj: THREE.Object3D) {
  if (!obj) return;

  // 子要素も再帰的に削除
  while (obj.children.length > 0) {
    cleanUp(obj.children[0]);
    obj.remove(obj.children[0]);
  }

  if (obj instanceof THREE.Mesh) {
    // ジオメトリの削除 (GPUメモリ解放)
    if (obj.geometry) {
      obj.geometry.dispose();
    }

    // マテリアルの削除
    if (obj.material) {
      // 配列の場合 (Material[])
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } 
      // 単体の場合 (Material)
      else {
        obj.material.dispose();
      }
    }
  }
}

// --- 再生成関数 ---
function regenerate() {
  if (pane) pane.refresh();

  cleanUp(treeGroup);
  treeGroup.clear();

  // グローバル変数のメッシュも掃除
  if (branchMesh) { cleanUp(branchMesh); branchMesh = null; }
  if (leafMesh) { cleanUp(leafMesh); leafMesh = null; }
  if (flowerMesh) { cleanUp(flowerMesh); flowerMesh = null; }
  if (budMesh) { cleanUp(budMesh); budMesh = null; }

  if (params.growthMode) {
    const ratio = Math.min(params.generations / 10.0, 1.0);
    
    params.initLength = params.maxLength * ratio;
    params.initThickness = params.maxThickness * (ratio * ratio); 
    
    if (pane) pane.refresh(); 
  }

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

  // 文字列本体 (1000文字まで)
  if (str.length > 1000) {
    params.resultText = str.substring(0, 2000) + ' ... (省略)';
  } else {
    params.resultText = str;
  }
  
  if (pane) pane.refresh();

  // L-System データ生成
  const data = createLSystemData(
    str,
    {
      initLen: params.initLength,
      initWid: params.initThickness,
      scale: params.scale,
      widthDecay: params.widthDecay,
      angle: params.angle,
      angleVariance: params.angleVariance,
      flowerSize: params.flowerSize,
      leafSize: params.leafSize,
      budSize: params.budSize,
      gravity: params.gravity,
    }
  );

  console.time("ジオメトリー生成時間");
  const mergedGeo = buildOrganicTreeGeometry(data.branches);
  console.timeEnd("ジオメトリー生成時間");

  if (mergedGeo) {
    matBranch.color.set(params.branchColor);
    branchMesh = new THREE.Mesh(mergedGeo, matBranch);
    branchMesh.castShadow = true;
    branchMesh.receiveShadow = true;
    treeGroup.add(branchMesh);
  }

  // 器官のインスタンス生成関数
  const createInstanced = (pts: OrganPoint[], mat: THREE.MeshStandardMaterial, col: string) => {
    if(pts.length===0) return;
    mat.color.set(col);
    const mesh = new THREE.InstancedMesh(geoPlane, mat, pts.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for(let i=0; i<pts.length; i++){
      dummy.position.copy(pts[i].position);
      dummy.quaternion.copy(pts[i].rotation);
      dummy.scale.setScalar(pts[i].scale);
      dummy.translateY(pts[i].scale*0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    treeGroup.add(mesh);
    return mesh;
  };

  leafMesh = createInstanced(data.leaves, matLeaf, params.leafColor) || null;
  flowerMesh = createInstanced(data.flowers, matFlower, params.flowerColor) || null;
  budMesh = createInstanced(data.buds, matBud, params.budColor) || null;

  console.log(`生成完了: 枝の数=${data.branches.length}`);
}


// --- 色更新だけの関数 ---
function updateColors() {
  matBranch.color.set(params.branchColor);
  matFlower.color.set(params.flowerColor);
  matLeaf.color.set(params.leafColor);
  matBud.color.set(params.budColor);
}

// Tweakpaneのセットアップ
pane = setupUI(params, regenerate, updateColors);

// 初回実行
regenerate();
