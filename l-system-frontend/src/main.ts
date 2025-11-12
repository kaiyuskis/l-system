import './style.css';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { scene } from './three-setup.ts';
import { generateLSystemString, createLSystem3D } from './l-system.ts';

let ruleXController: import('lil-gui').Controller;
let currentPlant: THREE.Group | null = null;
let leafMesh: THREE.InstancedMesh | null = null;

const params = {
  prompt: '背の高い木',
  premise: 'X(10, 0.2)',
  generations: 7,
  angle: 30.0,
  angleVariance: 10.0,
  turn: 137.5,
  turnVariance: 20.0,
  scale: 0.7,
  branchColor: '#8B4513',
  leafColor: '#228B22',
  leafSize: 1,
  ruleXDisplay: "", 
  ruleFDisplay: "",
};

const vary = (base: number, variance: number) => {
  return base + (Math.random() * 2 - 1) * variance;
};

const hardcodedRules = {
  'X': (len: number, width: number, p: typeof params) => {
    const newLen = len * p.scale;
    const newWidth = width * p.scale;

    const angle1 = vary(p.angle, p.angleVariance);
    const turn1 = vary(p.turn, p.turnVariance);
    const angle2 = vary(p.angle, p.angleVariance);
    const turn2 = vary(p.turn, p.turnVariance);
    

    return `F(${len.toFixed(2)}, ${width.toFixed(2)})
[+(${angle1.toFixed(1)}) &(${turn1.toFixed(1)}) X(${newLen.toFixed(2)}, ${newWidth.toFixed(2)})L(${p.leafSize})]
[-(${angle2.toFixed(1)}) ^(${turn2.toFixed(1)}) X(${newLen.toFixed(2)}, ${newWidth.toFixed(2)})L(${p.leafSize})]`;
  },
};

function updateRuleDisplay() {
  params.ruleXDisplay = `F[+(${params.angle})&(${params.turn})X(len*${params.scale.toFixed(2)})L(${params.leafSize})]`;

  if (ruleXController) {
    ruleXController.updateDisplay();
  }
}

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

// 地面
const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = 0;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

async function regenerateLSystem() {
  
  // --- 1. バックエンドにプロンプトを送信 ---
  try {
    console.log(`サーバーにプロンプト送信: ${params.prompt}`);
    const response = await fetch('http://localhost:8000/generate-params', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: params.prompt }), // { "prompt": "..." } を送信
    });
    
    if (!response.ok) {
      throw new Error(`サーバーエラー: ${response.statusText}`);
    }
    
    // サーバーから返ってきたJSONを取得
    const serverParams = await response.json();
    console.log("サーバーから受信:", serverParams);

    // ★ サーバーのパラメータをローカルの params オブジェクトに上書き
    params.premise = serverParams.premise;
    params.generations = serverParams.generations;
    params.angle = serverParams.angle;
    params.turn = serverParams.turn;
    params.scale = serverParams.scale;
    params.leafSize = serverParams.leafSize;
    
  } catch (error) {
    console.error("バックエンドとの通信に失敗:", error);
    alert("バックエンドとの通信に失敗しました。コンソールを確認してください。");
    return;
  }
  
  updateRuleDisplay();
  
  if (currentPlant) {
    scene.remove(currentPlant);
  }
  if (leafMesh) {
    scene.remove(leafMesh);
    leafMesh.dispose();
  }

  const rules = hardcodedRules;
  const leafMatrices: THREE.Matrix4[] = [];

  console.time('L-System Generation');
  const lSystemString = generateLSystemString(
    params.premise,
    rules,
    params.generations,
    params
  );
  console.timeEnd('L-System Generation');

  console.time('Branch Interpretation');
  currentPlant = createLSystem3D(
    lSystemString,
    params.angle,
    1.0,
    0.1,
    params.branchColor,
    leafMatrices
  );
  console.timeEnd('Branch Interpretation');
  scene.add(currentPlant);

  if (leafMatrices.length > 0) {
    console.time('Leaf Instancing');

    leafPrototypeMat.color.set(params.leafColor);

    leafMesh = new THREE.InstancedMesh(
      leafPrototypeGeo,
      leafPrototypeMat,
      leafMatrices.length
    );

    for (let i = 0; i < leafMatrices.length; i++) {
      leafMesh.setMatrixAt(i, leafMatrices[i]);
    }

    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;
    
    scene.add(leafMesh);
    console.timeEnd('Leaf Instancing');
  }
}

// GUI
const gui = new GUI();

gui.add(params, 'prompt').name('生成したいものを入力');

const setupFolder = gui.addFolder('基本設定');
setupFolder.add(params, 'premise').name('初期状態').listen();
setupFolder.add(params, 'generations', 0, 14, 0.1).name('世代数').listen();
setupFolder.open();

const paramsFolder = gui.addFolder('パラメーター設定');
paramsFolder.add(params, 'angle', 0, 90, 0.1).name('角度').onChange(updateRuleDisplay).listen();
paramsFolder.add(params, 'angleVariance', 0, 45, 0.1).name('角度 (偏差)').listen();
paramsFolder.add(params, 'turn', 0, 180, 0.1).name('ひねり').onChange(updateRuleDisplay).listen();
paramsFolder.add(params, 'turnVariance', 0, 90, 0.1).name('ひねり (偏差)').listen();
paramsFolder.add(params, 'scale', 0.5, 1.0, 0.01).name('成長率').onChange(updateRuleDisplay).listen();
paramsFolder.addColor(params, 'branchColor').name('幹の色').listen();
paramsFolder.addColor(params, 'leafColor').name('葉の色').listen();
paramsFolder.add(params, 'leafSize', 0, 5, 0.1).name('葉のサイズ').onChange(updateRuleDisplay).listen();
paramsFolder.open();

const rulesFolder = gui.addFolder('実行中のルール (変更不可)');
ruleXController = rulesFolder.add(params, 'ruleXDisplay').name('ルールX').disable();

const textarea = document.createElement('textarea');
textarea.value = params.ruleXDisplay;
textarea.disabled = true;
textarea.style.height = '70px';
textarea.style.width = '100%';
textarea.style.resize = 'none';
textarea.style.fontFamily = 'monospace';

const inputElement = (ruleXController as any).$input as HTMLInputElement;
inputElement.parentNode?.replaceChild(textarea, inputElement);
(ruleXController as any).$input = textarea;

rulesFolder.add(params, 'ruleFDisplay').name('ルールF').disable();
rulesFolder.open();

gui.add({ generate: regenerateLSystem }, 'generate').name('モデルを生成');

updateRuleDisplay();
regenerateLSystem();