import "./style.css";
import * as THREE from "three";
import { scene } from "./three-setup.ts";
import { generateLSystemString, createLSystemData, type BranchSegment, type OrganPoint } from "./l-system.ts";
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { setupUI } from './ui-setup.ts';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

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

function downloadGLTF() {
  if (treeGroup.children.length === 0) {
    alert("エクスポートするモデルがありません");
    return;
  }

  console.log("エクスポート処理開始...");

  const exporter = new GLTFExporter();
  const exportScene = new THREE.Scene();

  // treeGroupの中身を走査
  treeGroup.children.forEach((child) => {
    
    // A. InstancedMesh (葉・花・つぼみ) の場合 -> バラバラのMeshに変換
    if (child instanceof THREE.InstancedMesh) {
      const count = child.count;
      const originalGeo = child.geometry;
      const originalMat = child.material;
      
      console.log(`InstancedMeshを変換中... 個数: ${count}`);

      for (let i = 0; i < count; i++) {
        const matrix = new THREE.Matrix4();
        child.getMatrixAt(i, matrix);

        const mesh = new THREE.Mesh(originalGeo, originalMat);
        
        // ★ 重要: 行列を直接コピーし、自動更新を止める
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(matrix);
        
        // 名前を一意にする (例: Leaf_0, Leaf_1...)
        mesh.name = `${child.name || 'Instance'}_${i}`;
        
        exportScene.add(mesh);
      }
    } 
    // B. 普通の Mesh (枝) の場合 -> そのままクローン
    else if (child instanceof THREE.Mesh) {
      console.log("Mesh (枝) をコピー");
      const mesh = child.clone();
      exportScene.add(mesh);
    }
  });

  // ★ 最重要: エクスポート前に全ての位置情報を確定させる
  exportScene.updateMatrixWorld(true);

  // エクスポート実行
  exporter.parse(
    exportScene,
    (gltf) => {
      console.log("GLTF生成完了。ダウンロードを開始します。");
      const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = 'l-system-tree.glb';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    (error) => {
      console.error('エクスポートエラー:', error);
    },
    { binary: true }
  );
}

// ★ 1. プリセット保存関数 (JSONダウンロード)
function savePreset() {
  // params オブジェクトをきれいなJSON文字列に変換
  const jsonStr = JSON.stringify(params, null, 2);
  
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  // ファイル名に日時を入れると便利
  const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  link.download = `lsystem_preset_${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// ★ 2. プリセット読込関数 (JSONアップロード)
function loadPreset() {
  // ファイル選択ダイアログを動的に作成
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json'; // JSONファイルのみ
  
  input.onchange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    
    const file = target.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        // 読み込んだデータで params を上書き
        // (Object.assign で既存の params に値をコピー)
        Object.assign(params, data);
        
        // UIの表示を更新
        pane.refresh();
        
        // 色と形状を反映
        updateColors();
        regenerate();
        
        console.log("プリセットを読み込みました");
      } catch (error) {
        console.error("読み込みエラー:", error);
        alert("ファイルの読み込みに失敗しました。正しいJSONファイルですか？");
      }
    };
    reader.readAsText(file);
  };
  
  input.click(); // ダイアログを開く
}

// Tweakpaneのセットアップ
pane = setupUI(params, regenerate, updateColors, downloadGLTF, savePreset, loadPreset);

// 初回実行
regenerate();
