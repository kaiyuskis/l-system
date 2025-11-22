import "./style.css";
import * as THREE from "three";
import { Pane } from "tweakpane";
import { scene } from "./three-setup.ts";
import { generateLSystemString, createLSystemData, type BranchSegment, type OrganPoint } from "./l-system.ts";
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
  growthMode: true,

  initLength: 1.0,
  maxLength: 1.0,
  initThickness: 1.0,
  maxThickness: 1.0,

  generations: 6,
  angle: 28.0,
  angleVariance: 5.0,
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
  const radialSegments = 8;

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
  return BufferGeometryUtils.mergeGeometries(geometries, false);
}

// --- 再生成関数 ---
function regenerate() {
  treeGroup.clear();

  if (params.growthMode) {
    // 世代数に応じてサイズを変える (例: シグモイド関数や線形補間で滑らかに)
    // ここではシンプルに「現在の世代 / 最大世代(10)」の割合でスケール
    const ratio = Math.min(params.generations / 10.0, 1.0);
    
    // 若い木は細く短く
    params.initLength = params.maxLength * ratio;
    
    // 太さは長さ以上に細くした方が「苗木っぽく」見える (2乗など)
    params.initThickness = params.maxThickness * (ratio * ratio); 
    
    // Tweakpaneの表示も更新
    pane.refresh(); 
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
  
  pane.refresh();

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

  console.log(`生成完了: 枝の数=${data.branches.length}, 花の数=${data.flowers.length}, 葉の数=${data.leaves.length}, つぼみの数=${data.buds.length}`);
}


// --- 色更新だけの関数 ---
function updateColors() {
  matBranch.color.set(params.branchColor);
  matFlower.color.set(params.flowerColor);
  matLeaf.color.set(params.leafColor);
  matBud.color.set(params.budColor);
}

// Tweakpane UI
const generationsMax = 12;
const pane = new Pane({ title: "L-System" });

const tab = pane.addTab({
  pages: [
    { title: "基本設定" },
    { title: "器官設定" },
    { title: "ルール" },
  ]
});

const p1 = tab.pages[0];
p1.addBinding(params, 'growthMode', { label: '成長連動' }).on('change', regenerate);

p1.addBlade({ view: "separator" });
p1.addBinding(params, "maxLength", { label: "最大の長さ", min: 0.1, max: 2, step: 0.01 }).on("change", () => {
  params.initLength = params.maxLength;
  regenerate();
});
p1.addBinding(params, "initLength", { label: "現在の長さ", readonly: true })
p1.addBinding(params, "maxThickness", { label: "最大の太さ", min: 0.01, max: 2, step: 0.01 }).on("change", () => {
  params.initThickness = params.maxThickness;
  regenerate();
});
p1.addBinding(params, "initThickness", { label: "現在の太さ", readonly: true })

p1.addBlade({ view: "separator" });
p1.addBinding(params, "generations", { label: "世代", min: 0, max: generationsMax, step: 1 }).on("change", regenerate);
p1.addBinding(params, "angle", { label: "角度", min: 0, max: 180, step: 0.1 }).on("change", regenerate);
p1.addBinding(params, "angleVariance", { label: "角度の偏差", min: 0, max: 45, step: 0.1 }).on("change", regenerate);
p1.addBinding(params, "branchColor", { label: "枝の色" }).on("change", updateColors);

p1.addBlade({ view: "separator" });
p1.addBinding(params, "scale", { label: '長さ減衰率(")', min: 0.0, max: 2.0, step: 0.01 }).on( "change", regenerate);
p1.addBinding(params, 'widthDecay', { label: '太さ減衰率(!)', min: 0.5, max: 1.0, step: 0.01 }).on('change', regenerate);

p1.addBlade({ view: "separator" });
p1.addBinding(params, 'resultInfo', { 
  label: '文字数', 
  readonly: true
});
p1.addBinding(params, 'resultText', { 
  label: '文字列(1000文字まで)',
  multiline: true,
  rows: 10,
  readonly: true
});

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
p3.addBinding(params, "generations", { label: "世代", min: 0, max: generationsMax, step: 1 }).on("change", regenerate);

p3.addBlade({ view: "separator" });
p3.addBinding(params, "premise", { label: "初期状態" }).on("change", regenerate);
params.rules.forEach((r, i) => {
  p3.addBinding(r, "expression", {label: `ルール${i + 1}`});
});

pane.addButton({ title: "生成" }).on("click", regenerate);

regenerate();
