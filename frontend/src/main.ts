import "./style.css";
import * as THREE from "three";
import { scene, camera, controls, windUniforms } from "./three-setup.ts";
import { generateLSystemString, createLSystemData, type BranchSegment, type OrganPoint } from "./l-system.ts";
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { setupUI } from './ui-setup.ts';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { setSeed } from "./rng.js";
import { toast } from "./toast";

// 木全体をまとめるグループ
const treeGroup = new THREE.Group();
scene.add(treeGroup);

// Tweakpaneのインスタンス変数
let pane: any;

// 再生成中かどうかのフラグ
let isRegenerating = false;

// メッシュのインスタンス変数
let branchMesh: THREE.Mesh | null = null;
let flowerMesh: THREE.InstancedMesh | null = null;
let leafMesh: THREE.InstancedMesh | null = null;
let budMesh: THREE.InstancedMesh | null = null;

// 型定義
interface LSystemRule { expression: string; }

// プリセットをローカルに保存する
const LS_KEY = "lsystem_presets_v1";

type PresetEntry = {
  savedAt: number;
  data: any;
};
type PresetMap = Record<string, PresetEntry>;

function loadPresetMap(): PresetMap {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePresetMap(map: PresetMap) {
  localStorage.setItem(LS_KEY, JSON.stringify(map));
}

// 保存したくない一時情報を除外
function getPresetPayload() {
  const { resultInfo, resultText, ...rest } = params;
  return rest;
}

function listPresetNames(): string[] {
  return Object.keys(loadPresetMap()).sort((a, b) => a.localeCompare(b, "ja"));
}

function savePresetToLocal(name: string) {
  const map = loadPresetMap();
  map[name] = { savedAt: Date.now(), data: getPresetPayload() };
  savePresetMap(map);
}

function loadPresetFromLocal(name: string): boolean {
  const map = loadPresetMap();
  const entry = map[name];
  if (!entry) return false;
  Object.assign(params, entry.data);
  return true;
}

function deletePresetFromLocal(name: string) {
  const map = loadPresetMap();
  delete map[name];
  savePresetMap(map);
}

// パラメータ
const params = {
  growthMode: true,

  initLength: 1.0,
  maxLength: 1.0,
  initThickness: 1.0,
  maxThickness: 1.0,

  generations: 7,
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

// 風エフェクト用シェーダーコード
const windShaderHeader = `
  uniform float time;
  uniform float windStrength;
  uniform vec2 windDirection;
  
  attribute float aThickness;

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

  vec3 getWindVector(vec3 worldPos, float height, float thickness) {
    vec3 windDir3 = normalize(vec3(windDirection.x, 0.0, windDirection.y));
    
    float noiseVal = snoise(vec2(worldPos.x * 0.05 + time * 0.3, worldPos.z * 0.05));
    float gust = 1.0 + noiseVal * 0.5;
    float resistance = pow(thickness + 0.5, 3.0);
    float distFromRoot = length(worldPos);
  
    float swayFactor = smoothstep(0.0, 5.0, distFromRoot);

    return windDir3 * (windStrength * gust * swayFactor / resistance) * 0.01;
  }
`;

// 葉のパタパタ
const leafFlutter = `
  vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  
  float flutter = sin(time * 8.0 + instancePos.y * 0.5 + instancePos.x) * 0.1 * windStrength; 
  
  vec3 pos = transformed;
  pos.x += flutter * (pos.y + 0.5); 
  pos.z += flutter * (pos.y + 0.5);
  transformed = pos;
`;

// 全体揺れ
const applySway = `
  vec4 wPos = modelMatrix * vec4( position, 1.0 );
  
  #ifdef USE_INSTANCING
    wPos = modelMatrix * instanceMatrix * vec4( position, 1.0 );
  #endif

  vec3 sway = getWindVector(wPos.xyz, wPos.y, aThickness);
  vec4 viewSway = viewMatrix * vec4(sway, 0.0);
  mvPosition += viewSway;

  gl_Position = projectionMatrix * mvPosition;
`;

function setupMaterial(mat: THREE.MeshStandardMaterial, isLeaf: boolean) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.time = windUniforms.time;
    shader.uniforms.windStrength = windUniforms.strength;
    shader.uniforms.windDirection = windUniforms.direction;

    // 共通ヘッダー
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\n' + windShaderHeader
    );
    
    // 葉の場合のみ
    if (isLeaf) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' + leafFlutter
      );
    }

    // 枝も
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n' + applySway
    );
  };
}

function setupDepthMaterial(mat: THREE.Material, isLeaf: boolean) {
  mat.onBeforeCompile = (shader) => {
    // メインマテリアルと同じユニフォームを渡す
    shader.uniforms.time = windUniforms.time;
    shader.uniforms.windStrength = windUniforms.strength;
    shader.uniforms.windDirection = windUniforms.direction;

    // 共通ヘッダー（ノイズ関数、getWindVectorなど）を注入
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\n' + windShaderHeader
    );
    
    // 葉の場合のみ：ローカル変形 (パタパタ) を注入
    if (isLeaf) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' + leafFlutter
      );
    }

    // 共通：全体揺れ (Sway) を注入
    // MeshDepthMaterialでも project_vertex への注入で正しく動作します
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n' + applySway
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
      1,
      true,
    );

    // 頂点のY座標を見て、太さをradiusBottom(下)〜radiusTop(上)で補間する
    const posAttribute = geo.getAttribute('position');
    const vertexCount = posAttribute.count;
    const thicknessArray = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const y = posAttribute.getY(i);
      const t = Math.max(0, Math.min(1, (y + length / 2) / length));
      thicknessArray[i] = (1 - t) * seg.radiusBottom + t * seg.radiusTop;
    }
    
    geo.setAttribute('aThickness', new THREE.BufferAttribute(thicknessArray, 1));

    geo.translate(0, length / 2, 0);
    geo.rotateX(Math.PI / 2);
    geo.lookAt(new THREE.Vector3().subVectors(seg.end, seg.start));
    geo.translate(seg.start.x, seg.start.y, seg.start.z);

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
  if (isRegenerating) return;
  isRegenerating = true;

  try {
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

      const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      setupDepthMaterial(depthMat, false); // 枝なので isLeaf は false
      branchMesh.customDepthMaterial = depthMat;

      // ポイントライトの影用（今回はDirectionalLightなので必須ではないが、念のため）
      const distanceMat = new THREE.MeshDistanceMaterial();
      setupDepthMaterial(distanceMat, false);
      branchMesh.customDistanceMaterial = distanceMat;
      
      treeGroup.add(branchMesh);
    }

    // 器官のインスタンス生成関数
    const createInstanced = (pts: OrganPoint[], mat: THREE.MeshStandardMaterial, col: string) => {
      if(pts.length===0) return;

      mat.color.set(col);
      const mesh = new THREE.InstancedMesh(geoPlane, mat, pts.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // マテリアルが葉かどうかを判定
      const isLeaf = mat === matLeaf;

      // 透過を考慮してメインマテリアルからmapとalphaTestをコピー
      const depthMat = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: mat.map,       // テクスチャを渡す
        alphaTest: mat.alphaTest // アルファテストの閾値を渡す
      });
      setupDepthMaterial(depthMat, isLeaf);
      mesh.customDepthMaterial = depthMat;

      const distanceMat = new THREE.MeshDistanceMaterial({
        map: mat.map,
        alphaTest: mat.alphaTest
      });
      setupDepthMaterial(distanceMat, isLeaf);
      mesh.customDistanceMaterial = distanceMat;

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
  } catch (e) {
    console.error(e);
  } finally {
    isRegenerating = false;
  }
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

// ブラウザ内のプリセット保存
const uiState = {
  presetName: "myPreset",
  presetSelected: "",
  presetList: [] as string[],
};

function refreshPresetList() {
  uiState.presetList = listPresetNames();
  if (!uiState.presetSelected && uiState.presetList.length) {
    uiState.presetSelected = uiState.presetList[0];
  }
  uiState.__rebuildPresetSelect?.();
  pane?.refresh();
}

function savePresetBrowser() {
  const name = (uiState.presetName || "").trim();
  if (!name) {
    toast("保存名を入力してください。", "error");
    return;
  }
  savePresetToLocal(name);
  refreshPresetList();
  toast(`プリセット「${name}」を保存しました。`, "success");
}

function loadPresetBrowser() {
  const name = (uiState.presetSelected || "").trim();
  if (!name) {
    toast("読み込むプリセットを選択してください。", "error");
    return;
  }
  if (!loadPresetFromLocal(name)) {
    toast("プリセットが見つかりません。", "error");
    return;
  }
  updateColors();
  regenerate();
  pane?.refresh();
  toast(`プリセット「${name}」を読み込みました。`, "success");
}

function deletePresetBrowser() {
  const name = (uiState.presetSelected || "").trim();
  if (!name) return;

  deletePresetFromLocal(name);
  if (uiState.presetSelected === name) uiState.presetSelected = "";
  refreshPresetList();
}

function resetCamera() {
  camera.position.set(0, 10, 40);
  controls.target.set(0, 7, 0);
  controls.update();
}

// Tweakpaneのセットアップ
pane = setupUI(
  params, 
  regenerate, 
  updateColors, 
  downloadGLTF, 
  resetCamera,
  uiState,
  refreshPresetList,
  savePresetBrowser,
  loadPresetBrowser,
  deletePresetBrowser,
);

// 初回実行
regenerate();
