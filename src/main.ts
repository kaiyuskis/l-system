import './style.css';
import GUI from 'lil-gui';
import * as THREE from 'three';

// 1. Three.jsのセットアップを読み込む
import { scene } from './three-setup.ts';

// 2. L-systemの「エンジン」を読み込む
import { generateLSystemString, createLSystem3D } from './l-system.ts';

// --- 3. アプリケーションの状態管理 ---

let currentPlant: THREE.Group | null = null;

// ★ GUIで操作するパラメータ (ルール定義を削除)
const params = {
  axiom: 'X(10, 0.2)',
  iterations: 5,
  
  // グローバル・パラメータ (ルール内で 'p.' で参照)
  angle: 30.0,
  turn: 137.5,
  scale: 0.7, // 成長率
  
  color: '#8B4513', // 茶色
};

// ★ L-systemのルールを「関数」として直接定義
// (GUIからは編集しない)
const hardcodedRules = {
  'X': (len: number, width: number, p: typeof params) => {
    // p.angle や p.scale を使って計算
    const newLen = len * p.scale;
    const newWidth = width * p.scale;

    // テンプレートリテラル (\`) で文字列を返す
    return `F(${len.toFixed(2)}, ${width.toFixed(2)})
[+(${p.angle}) &(${p.turn}) X(${newLen.toFixed(2)}, ${newWidth.toFixed(2)})]
[-(${p.angle}) ^(${p.turn}) X(${newLen.toFixed(2)}, ${newWidth.toFixed(2)})]`;
  },
  
  // 'F' にはルールを定義しない
  // (定義しない場合、Generatorは 'F' をそのままコピーする)
};

// ★ GUIに「表示するためだけ」のルール説明
const ruleDisplayStrings = {
  ruleX: "F(...) [+(${p.angle}) &(${p.turn}) X(...)] [-(${p.angle}) ^(${p.turn}) X(...)]",
  ruleF: "(No rule / 描画のみ)"
};


// --- 4. L-systemの再生成 (メインロジック) ---

function regenerateLSystem() {
  if (currentPlant) {
    scene.remove(currentPlant);
  }

  // ★ try/catch や new Function() は不要！
  // ★ ハードコードされたルール関数を直接渡す
  const rules = hardcodedRules;

  // 1. ルール生成器 (Generator) の実行
  console.time('L-System Generation');
  const lSystemString = generateLSystemString(
    params.axiom,
    rules, // ★ ハードコードされた関数を渡す
    params.iterations,
    params // ★ globalParams (params自身) を渡す
  );
  console.timeEnd('L-System Generation');
  console.log(`String Length: ${lSystemString.length}`);

  // 2. 3D解釈器 (Interpreter) の実行
  console.time('L-System Interpretation');
  currentPlant = createLSystem3D(
    lSystemString,
    params.angle, // デフォルト角度
    1.0,          // デフォルト長さ
    0.1,          // デフォルト太さ
    params.color
  );
  console.timeEnd('L-System Interpretation');

  scene.add(currentPlant);
}

// --- 5. GUIのセットアップ (★ シンプル版) ---
const gui = new GUI();

const setupFolder = gui.addFolder('Setup');
setupFolder.add(params, 'axiom').name('Axiom');
setupFolder.add(params, 'iterations', 1, 8, 1).name('Iterations');
setupFolder.open();

const paramsFolder = gui.addFolder('Global Params (p.)');
paramsFolder.add(params, 'angle', 0, 90).name('p.angle');
paramsFolder.add(params, 'turn', 0, 180).name('p.turn (Twist)');
paramsFolder.add(params, 'scale', 0.5, 1.0).name('p.scale');
paramsFolder.addColor(params, 'color').name('Color');
paramsFolder.open();

// ★ ルールを「表示だけ」する (編集不可)
const rulesFolder = gui.addFolder('Active Rules (Display Only)');
rulesFolder.add(ruleDisplayStrings, 'ruleX').name('Rule: X').disable(); // ★ .disable()
rulesFolder.add(ruleDisplayStrings, 'ruleF').name('Rule: F').disable(); // ★ .disable()
rulesFolder.open();

gui.add({ generate: regenerateLSystem }, 'generate').name('Generate Plant');

// --- 6. 初回実行 ---
regenerateLSystem();