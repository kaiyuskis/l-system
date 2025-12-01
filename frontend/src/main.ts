import "./style.css";
import * as THREE from "three";
import { scene, camera, controls, windUniforms } from "./three-setup.ts";
import { generateLSystemString, createLSystemData, type BranchSegment, type OrganPoint } from "./l-system.ts";
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { setupUI } from './ui-setup.ts';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { setSeed } from "./rng.js";

// --- グローバル変数 ---
const treeGroup = new THREE.Group();
scene.add(treeGroup);

// Tweakpaneのインスタンス変数
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
  seed: 0,
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

const windShaderHeader = `
  uniform float time;
  uniform float windStrength;
  uniform vec2 windDirection;
  
  // 頂点属性として「太さ」を受け取る
  // (枝は BufferAttribute, 葉は InstancedBufferAttribute だが、シェーダーでは同じ)
  attribute float aThickness;

  // ノイズ関数
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
`;

// 枝用の揺れロジック (太いと揺れない)
const branchWindMain = `
  vec3 pos = transformed;
  
  // 風のベクトル (3D)
  vec3 windDir3 = normalize(vec3(windDirection.x, 0.0, windDirection.y));
  
  // ノイズ (ゆらぎ)
  float noiseVal = snoise(vec2(pos.x * 0.05 + time * 0.3, pos.z * 0.05));
  float gust = 1.0 + noiseVal * 0.5;
  
  // ★ 修正: 太さ(aThickness)による計算を削除
  // float flexibility = 1.0 / max(0.05, aThickness); ... (削除)

  // 高さによる影響 (2乗することで、上の方ほど急激に揺れるようにする)
  float heightFactor = pow(max(0.0, pos.y), 2.0);

  // ★ 修正: 係数を小さく (0.01 -> 0.002)
  vec3 displacement = windDir3 * windStrength * gust * heightFactor * 0.002;
  
  pos += displacement;
  transformed = pos;
`;

// 葉用の揺れロジック (パタパタ + 枝への追従)
const leafWindMain = `
  vec3 pos = transformed;
  
  vec3 windDir3 = normalize(vec3(windDirection.x, 0.0, windDirection.y));
  float noiseVal = snoise(vec2(time * 0.5)); // 簡易ノイズ
  float gust = 1.0 + noiseVal * 0.5;
  
  float heightFactor = pow(max(0.0, pos.y), 2.0);
  
  // 1. 枝への追従 (枝と全く同じ計算式)
  vec3 branchMove = windDir3 * windStrength * gust * heightFactor * 0.002;
  pos += branchMove;

  // 2. 葉っぱ特有の「パタパタ」 (Flutter)
  // (ここは変更なし。ただし係数を少し調整)
  float flutter = sin(time * 8.0 + instanceMatrix[3][1] * 0.5) * 0.1; 
  
  // 葉のローカル座標での揺れ
  // (transformed.y は葉のローカル高さ)
  pos.x += flutter * (transformed.y + 0.5) * windStrength; 
  pos.z += flutter * (transformed.y + 0.5) * windStrength;

  transformed = pos;
`;

function setupMaterial(mat: THREE.MeshStandardMaterial, isLeaf: boolean) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.time = windUniforms.time;
    shader.uniforms.windStrength = windUniforms.strength;
    shader.uniforms.windDirection = windUniforms.direction;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\n' + windShaderHeader
    );
    
    const logic = isLeaf ? leafWindMain : branchWindMain;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' + logic
    );
  };
}

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
setupMaterial(matBranch, false);

const geoPlane = new THREE.PlaneGeometry(1, 1);

// 花
const matFlower = new THREE.MeshStandardMaterial({
  map: flowerTexture,
  color: params.flowerColor,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});
setupMaterial(matFlower, true);

// 葉
const matLeaf = new THREE.MeshStandardMaterial({
  map: leafTexture,
  color: params.leafColor,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});
setupMaterial(matLeaf, true);

// つぼみ
const matBud = new THREE.MeshStandardMaterial({
  map: budTexture,
  color: params.budColor,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5
});
setupMaterial(matBud, true);

function buildOrganicTreeGeometry(segments: BranchSegment[]): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  const radialSegments = 18;

  for (const seg of segments) {
    const length = seg.start.distanceTo(seg.end);

    const geo = new THREE.CylinderGeometry(
      seg.radiusTop,
      seg.radiusBottom,
      length,
      radialSegments,
    );

    geo.translate(0, length / 2, 0);
    geo.rotateX(Math.PI / 2);
    geo.lookAt(new THREE.Vector3().subVectors(seg.end, seg.start));
    geo.translate(seg.start.x, seg.start.y, seg.start.z);

    const count = geo.attributes.position.count;
    const thicknessArray = new Float32Array(count).fill(seg.radiusBottom);
    geo.setAttribute('aThickness', new THREE.BufferAttribute(thicknessArray, 1));

    geometries.push(geo);

    const jointGeo = new THREE.SphereGeometry(seg.radiusBottom, radialSegments, radialSegments);
    jointGeo.translate(seg.start.x, seg.start.y, seg.start.z);

    const jointCount = jointGeo.attributes.position.count;
    const jointThicknessArray = new Float32Array(jointCount).fill(seg.radiusBottom);
    jointGeo.setAttribute('aThickness', new THREE.BufferAttribute(jointThicknessArray, 1));

    geometries.push(jointGeo);
  }

  if (geometries.length === 0) return new THREE.BufferGeometry();
  const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries, false);

  geometries.forEach(geo => geo.dispose());

  return mergedGeo;
}

// --- 再生成関数 ---
function regenerate() {
  setSeed(params.seed);
  if (pane) pane.refresh();

  if (branchMesh) {
    branchMesh.geometry.dispose();
  }

  treeGroup.clear();

  branchMesh = null;
  flowerMesh = null;
  leafMesh = null;
  budMesh = null;

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

    const thicknessArray = new Float32Array(pts.length);

    const dummy = new THREE.Object3D();
    for(let i=0; i<pts.length; i++){
      const p = pts[i];
      dummy.position.copy(pts[i].position);
      dummy.quaternion.copy(pts[i].rotation);
      dummy.scale.setScalar(pts[i].scale);
      dummy.translateY(pts[i].scale*0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      thicknessArray[i] = p.thickness;
    }
    mesh.geometry.setAttribute('aThickness', new THREE.InstancedBufferAttribute(thicknessArray, 1));
    mesh.instanceMatrix.needsUpdate = true;
    treeGroup.add(mesh);
    return mesh;
  };

  leafMesh = createInstanced(data.leaves, matLeaf, params.leafColor) || null;
  flowerMesh = createInstanced(data.flowers, matFlower, params.flowerColor) || null;
  budMesh = createInstanced(data.buds, matBud, params.budColor) || null;

  console.log(`生成完了: 枝の数=${data.branches.length}`);
}


// 色だけ更新関数
function updateColors() {
  matBranch.color.set(params.branchColor);
  matFlower.color.set(params.flowerColor);
  matLeaf.color.set(params.leafColor);
  matBud.color.set(params.budColor);
}

// GLTFエクスポート関数
function downloadGLTF() {
  if (treeGroup.children.length === 0) {
    alert("エクスポートするモデルがありません");
    return;
  }

  console.log("エクスポート処理開始...");

  const exporter = new GLTFExporter();
  const exportScene = new THREE.Scene();

  treeGroup.children.forEach((child) => {
    
    if (child instanceof THREE.InstancedMesh) {
      const count = child.count;
      const originalGeo = child.geometry;
      const originalMat = child.material;
      
      console.log(`InstancedMeshを変換中... 個数: ${count}`);

      for (let i = 0; i < count; i++) {
        const matrix = new THREE.Matrix4();
        child.getMatrixAt(i, matrix);

        const mesh = new THREE.Mesh(originalGeo, originalMat);
        
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(matrix);
        
        mesh.name = `${child.name || 'Instance'}_${i}`;
        
        exportScene.add(mesh);
      }
    } 
    else if (child instanceof THREE.Mesh) {
      console.log("Mesh (枝) をコピー");
      const mesh = child.clone();
      exportScene.add(mesh);
    }
  });

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

// プリセット保存関数
function savePreset() {
  const jsonStr = JSON.stringify(params, null, 2);
  
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  link.download = `lsystem_preset_${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// プリセット読込関数
function loadPreset() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    
    const file = target.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        Object.assign(params, data);
        
        pane.refresh();
        
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
  
  input.click();
}

function resetCamera() {
  camera.position.set(0, 10, 40);
  controls.target.set(0, 7, 0);
  controls.update();
}

// Tweakpaneのセットアップ
pane = setupUI(params, regenerate, updateColors, downloadGLTF, savePreset, loadPreset, resetCamera);

// 初回実行
regenerate();
