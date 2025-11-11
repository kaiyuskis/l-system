import './style.css';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { scene } from './three-setup.ts';
import { generateLSystemString, createLSystem3D } from './l-system.ts';
// import { createLeafGeometry } from './leaf-generator.ts';

let ruleXController: import('lil-gui').Controller;

// --- 1. アプリケーションの状態管理 ---

let currentPlant: THREE.Group | null = null;

const params = {
  axiom: 'X(10, 0.2)',
  iterations: 5,
  angle: 30.0,
  turn: 137.5,
  scale: 0.7,
  branchColor: '#8B4513',
  leafColor: '#228B22',
  leafSize: 0.5,

  ruleXDisplay: "", 
  ruleFDisplay: "(No rule / 描画のみ)",
};

// --- 2. L-systemのルール定義 ---

const hardcodedRules = {
  'X': (len: number, width: number, p: typeof params) => {
    const newLen = len * p.scale;
    const newWidth = width * p.scale;

    return `F(${len.toFixed(2)}, ${width.toFixed(2)})
[+(${p.angle}) &(${p.turn}) X(${newLen.toFixed(2)}, ${newWidth.toFixed(2)})L(${p.leafSize})]
[-(${p.angle}) ^(${p.turn}) X(${newLen.toFixed(2)}, ${newWidth.toFixed(2)})L(${p.leafSize})]`;
  },
};

// --- 3. L-systemの再生成 (メインロジック) ---

function updateRuleDisplay() {
  params.ruleXDisplay = `F(...) [+(${params.angle}) &(${params.turn}) X(len*${params.scale.toFixed(2)}, ...)L(${params.leafSize})] ...`;

  if (ruleXController) {
    ruleXController.updateDisplay();
  }
}

function regenerateLSystem() {
  if (currentPlant) {
    scene.remove(currentPlant);
  }

  const rules = hardcodedRules;

  console.time('L-System Generation');
  const lSystemString = generateLSystemString(
    params.axiom,
    rules,
    params.iterations,
    params
  );
  console.timeEnd('L-System Generation');
  console.log(`String Length: ${lSystemString.length}`);

  console.time('L-System Interpretation');
  currentPlant = createLSystem3D(
    lSystemString,
    params.angle,
    1.0,
    0.1,
    params.branchColor,
    params.leafColor,
    params.leafSize
  );
  console.timeEnd('L-System Interpretation');

  scene.add(currentPlant);
}

// --- 4. GUIのセットアップ ---

const gui = new GUI();

const setupFolder = gui.addFolder('Setup');
setupFolder.add(params, 'axiom').name('Axiom');
setupFolder.add(params, 'iterations', 1, 8, 1).name('Iterations');
setupFolder.open();

const paramsFolder = gui.addFolder('Global Params (p.)');
paramsFolder.add(params, 'angle', 0, 90).name('p.angle (Pitch)').onChange(updateRuleDisplay);
paramsFolder.add(params, 'turn', 0, 180).name('p.turn (Twist)').onChange(updateRuleDisplay);
paramsFolder.add(params, 'scale', 0.5, 1.0).name('p.scale').onChange(updateRuleDisplay);
paramsFolder.addColor(params, 'branchColor').name('Branch Color'); // ★ 枝の色
paramsFolder.addColor(params, 'leafColor').name('Leaf Color');     // ★ 葉の色
paramsFolder.add(params, 'leafSize', 0.1, 2.0).name('Leaf Size').onChange(updateRuleDisplay); // ★ 葉のサイズ
paramsFolder.open();

const rulesFolder = gui.addFolder('Active Rules (Display Only)');
ruleXController = rulesFolder.add(params, 'ruleXDisplay').name('Rule: X').disable();

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

rulesFolder.add(params, 'ruleFDisplay').name('Rule: F').disable();
rulesFolder.open();

gui.add({ generate: regenerateLSystem }, 'generate').name('Generate Plant');

// --- 5. 初回実行 ---
updateRuleDisplay();
regenerateLSystem();