import './style.css';
import * as THREE from 'three';
import { Pane } from 'tweakpane';
import { scene } from './three-setup.ts';
import { generateLSystemString, createLSystem3D } from './l-system.ts';

interface LSystemRules {
  char: string;
  rule: string;
}

let currentPlant: THREE.Group | null = null;
let leafMesh: THREE.InstancedMesh | null = null;
const loadingOverlay = document.getElementById('loading-overlay');

const params = {
  useAI: false,
  prompt: 'もみじ',

  premise: 'A(10, 0.2)',
  generations: 7.0,
  angle: 30.0,
  angleVariance: 10.0,
  turn: 137.5,
  turnVariance: 20.0,
  scale: 0.7,
  branchColor: '#8B4513',
  leafColor: '#228B22',
  leafSize: 1,

  rules: [
    { char: "A", rule: "F[+(30)&(137.5)A(len*0.7)L(1)]"},
    { char: "", rule: "" },
    { char: "", rule: "" },
    { char: "", rule: "" },
    { char: "", rule: "" },
  ] as LSystemRules[],
};

const vary = (base: number, variance: number) => {
  return base + (Math.random() * 2 - 1) * variance;
};

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

// ★★★ トランスパイラ関数 (簡易文法 -> JSコード) ★★★
/**
 * 簡易文法を new Function() が解釈できるJSコードに変換する
 * @param simpleRule "F(len, width)[+X(len*p.scale)]"
 * @returns "return `F(${len}, ${width})[+(${p.angle})X(${len*p.scale})]`"
 */
function transpileRule(simpleRule: string): string {
  let jsCode = simpleRule;

  // 1. パラメータ付きコマンド (例: F(len*p.scale)) を
  //    JSテンプレートリテラル (例: F(${len*p.scale})) に変換
  //    正規表現: [A-Z] (アルファベット大文字) の直後の (...)
  jsCode = jsCode.replace(/([A-Z])\((.*?)\)/g, (_match, char, params) => {
    // F(len, width) -> F(${len}, ${width})
    // F(len*p.scale) -> F(${len*p.scale})
    const jsParams = params.split(',').map((p: string) => `\${${p.trim()}}`).join(', ');
    return `${char}(${jsParams})`;
  });

  // 2. パラメータなしの回転コマンド (例: +, -, &, ^, \, /) を
  //    自動的にグローバルパラメータ (p.angle, p.turn) で補完する
  //    正規表現: [+-] (または \&, \^, \\, \/) で、直後に "(" が *ない* もの
  jsCode = jsCode.replace(/([+-])(?![\\(])/g, (_match, char) => {
    // + -> +(${p.angle})
    return `${char}(\${p.angle})`;
  });
  jsCode = jsCode.replace(/([&^])(?![\\(])/g, (_match, char) => {
    // & -> &(${p.turn})
    return `${char}(\${p.turn})`;
  });
  jsCode = jsCode.replace(/([\\\/])(?![\\(])/g, (_match, char) => {
    // \ -> \(${p.angle})
    return `${char}(\${p.angle})`;
  });
  
  return `return \`${jsCode}\`;`;
}

async function regenerateLSystem() {
  if (loadingOverlay) {
    if (params.useAI) {
      loadingOverlay.style.display = 'flex';
    }
  }
  
  // --- 1. バックエンドにプロンプトを送信 ---
  try {
    if (params.useAI) {
      console.log(`サーバーにプロンプト送信: ${params.prompt}`);
      const response = await fetch('http://localhost:8000/generate-params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ prompt: params.prompt }), 
      });
      
      if (!response.ok) {
        throw new Error(`サーバーエラー: ${response.statusText}`);
      }
      
      // サーバーから返ってきたJSONを取得
      const serverParams = await response.json();
      console.log("サーバーから受信:", serverParams);

      // サーバーのパラメータをローカルの params オブジェクトに上書き
      params.premise = serverParams.premise;
      params.angle = serverParams.angle;
      params.turn = serverParams.turn;
      params.scale = serverParams.scale;
      params.leafSize = serverParams.leafSize;
      params.branchColor = serverParams.branchColor;
      params.leafColor = serverParams.leafColor;

      params.rules.forEach((slot, i) => {
        if (serverParams.rules[i]) {
          slot.char = serverParams.rules[i].char;
          slot.rule = serverParams.rules[i].code;
        } else {
          slot.char = "";
          slot.rule = "";
        }
      });

      pane.refresh();
    }
    
    if (currentPlant) { scene.remove(currentPlant); }
    if (leafMesh) {
      scene.remove(leafMesh);
      leafMesh.dispose();
    }

    const rules: { [key: string]: (...args: any[]) => string } = {};
    try {
      for (const rule of params.rules) {
        if (rule.char && rule.rule.trim() !== '') {
          const jsCode = transpileRule(rule.rule);
          rules[rule.char] = new Function('len', 'width', 'p', 'vary', jsCode) as (...args: any[]) => string;
        }
      }
    } catch (e) {
      console.error("ルールの文法エラー:", e);
      alert("ルールの文法が間違っています。コンソールを確認してください。");
      throw e;
    }

    const leafMatrices: THREE.Matrix4[] = [];
    const lSystemString = generateLSystemString(
      params.premise,
      rules,
      Math.floor(params.generations),
      params,
      vary,
    );

    currentPlant = createLSystem3D(
      lSystemString,
      params.angle,
      1.0,
      0.1,
      params.branchColor,
      leafMatrices
    );
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
    }

  } catch (error) {
    console.error('処理エラー:', error);

  } finally {
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
  }
}

// Tweakpane UI
const pane = new Pane({ title: 'L-System 設定' });

// 生成ボタン
pane.addButton({ title: 'モデルを生成' }).on('click', regenerateLSystem);

// タブでUIを分割
const tab = pane.addTab({
  pages: [
    { title: 'AI 設定' },
    { title: '基本設定' },
    { title: 'ルール設定' },
  ],
});

// --- AI設定タブ ---
const aiTab = tab.pages[0];
aiTab.addBinding(params, 'useAI', { label: 'AIでパラメータを生成' });
aiTab.addBinding(params, 'prompt', { 
  label: 'プロンプト', 
  multiline: true, 
  rows: 4 
});

// --- 基本設定タブ (スライダー類) ---
const setupTab = tab.pages[1];
setupTab.addBinding(params, 'premise', { label: '前提 (Premise)' });
setupTab.addBinding(params, 'generations', { label: '世代数', min: 1, max: 10, step: 0.1 });
setupTab.addBinding(params, 'angle', { label: 'p.角度 (基本値)', min: 0, max: 90 });
setupTab.addBinding(params, 'angleVariance', { label: 'p.角度の偏差', min: 0, max: 45 });
setupTab.addBinding(params, 'turn', { label: 'p.ひねり (基本値)', min: 0, max: 180 });
setupTab.addBinding(params, 'turnVariance', { label: 'p.ひねりの偏差', min: 0, max: 90 });
setupTab.addBinding(params, 'scale', { label: 'p.成長率 (Scale)', min: 0.5, max: 1.0 });
setupTab.addBinding(params, 'branchColor', { label: '枝の色' });
setupTab.addBinding(params, 'leafColor', { label: '葉の色' });
setupTab.addBinding(params, 'leafSize', { label: '葉のサイズ', min: 0.1, max: 2.0 });

// --- ルール設定タブ ---
const rulesTab = tab.pages[2];
params.rules.forEach((rule, index) => {
  const folder = rulesTab.addFolder({ title: `ルール ${index + 1}` });
  folder.addBinding(rule, 'char', { label: '文字' });
  folder.addBinding(rule, 'rule', { 
    label: 'ルール',
    multiline: true,
    rows: 10,
  });
});

regenerateLSystem();