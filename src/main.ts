import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';
import './style.css';

// --- 1. Three.jsの基本セットアップ ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(10, 15, 25);
camera.lookAt(0, 10, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.appendChild(renderer.domElement);
}
const ambientLight = new THREE.AmbientLight(0x606060);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(1, 1, 0.5).normalize();
scene.add(directionalLight);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 10, 0);
controls.update();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 2. L-systemのロジック ---

/**
 * @param str L-system文字列全体
 * @param startIndex 'F' や '+' の *次* の文字のインデックス
 * @param defaultValues パラメータが省略された場合のデフォルト値
 * @returns パースした値(配列)と、パース後の次のインデックス
 */
function parseParameters(
  str: string,
  startIndex: number,
  defaultValues: number[] = []
): { values: number[]; nextIndex: number } {
  // 次の文字が '(' でなければ、パラメータなし
  if (str[startIndex] !== '(') {
    return { values: defaultValues, nextIndex: startIndex };
  }
  
  // ')' を探す
  const closingParenIndex = str.indexOf(')', startIndex);
  if (closingParenIndex === -1) {
    console.error(`Parse error: Missing ')' after index ${startIndex}`);
    return { values: defaultValues, nextIndex: startIndex };
  }

  // ( と ) の間の文字列（パラメータ）を取得
  const paramString = str.substring(startIndex + 1, closingParenIndex);
  if (paramString === '') {
    // F() のように空の場合はデフォルト
    return { values: defaultValues, nextIndex: closingParenIndex + 1 };
  }

  // カンマで分割し、数値に変換
  const values = paramString.split(',').map(s => parseFloat(s.trim()));

  if (values.some(isNaN)) {
    console.error(`Parse error: Invalid number in "${paramString}"`);
    return { values: defaultValues, nextIndex: closingParenIndex + 1 };
  }

  return { values: values, nextIndex: closingParenIndex + 1 };
}

/**
 * L-systemのルール生成 (パラメトリック対応)
 * @param axiom 開始文字列 (公理)
 * @param rules ルール (JavaScript関数のオブジェクト)
 * @param iterations 繰り返す回数
 * @returns 生成されたL-system文字列
 */
function generateLSystemString(
  axiom: string,
  rules: { [key: string]: (...args: number[]) => string },
  iterations: number
): string {
  let currentString = axiom;

  for (let i = 0; i < iterations; i++) {
    let nextString = '';
    let j = 0;
    
    // 文字列をパースしながら進む
    while (j < currentString.length) {
      const char = currentString[j];
      
      // ルールを適用する可能性のある文字
      if (char.match(/[A-Z]/)) {
        // パラメータを取得
        const { values, nextIndex } = parseParameters(currentString, j + 1, []);
        const command = char;
        const rule = rules[command]; // 対応するルール関数を探す

        if (rule) {
          // ルールが存在する場合、関数を実行して置換後の文字列を取得
          const replacement = rule.apply(null, values);
          nextString += replacement;
          j = nextIndex;
        } else {
          // ルールが存在しない場合 (例: 'F' にルールが設定されていない)
          nextString += currentString.substring(j, nextIndex);
          j = nextIndex;
        }
      } else {
        nextString += char;
        j++;
      }
    }
    currentString = nextString;
    // console.log(`Iteration ${i+1}: ${currentString.substring(0, 1000)}...`);
  }
  return currentString;
}

/**
 * L-systemの3D解釈
 */
function createLSystem3D(
  lSystemString: string,
  defaultAngle: number,
  defaultLength: number,
  defaultWidth: number
): THREE.Group {
  const plant = new THREE.Group();
  const turtle = new THREE.Object3D();
  const stack: THREE.Object3D[] = [];
  
  const branchMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(params.color)
  });

  let i = 0;
  while (i < lSystemString.length) {
    const char = lSystemString[i];
    
    // パラメータをパース
    let params: number[];
    let nextIndex: number;

    switch (char) {
      // "F(length, width)": 枝を描画
      case 'F': {
        // F(length, width) の2引数をパース
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultLength, defaultWidth]));
        const length = params[0];
        const width = params.length > 1 ? params[1] : defaultWidth; // 2番目の引数(太さ)
        i = nextIndex;

        const branchGeometry = new THREE.CylinderGeometry(width, width, length, 8);
        const branchMesh = new THREE.Mesh(branchGeometry, branchMaterial);
        branchMesh.position.set(0, length / 2, 0); // 根元をタートルの位置に
        
        const container = new THREE.Object3D();
        container.add(branchMesh);
        container.position.copy(turtle.position);
        container.quaternion.copy(turtle.quaternion);
        
        plant.add(container);
        turtle.translateY(length);
        break;
      }

      // "f(length)": 描画せずに前進
      case 'f': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultLength]));
        i = nextIndex;
        turtle.translateY(params[0]);
        break;
      }
        
      // "+(angle)": X軸回転
      case '+': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateX(THREE.MathUtils.degToRad(params[0]));
        break;
      }
      // "-(angle)": X軸回転
      case '-': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateX(THREE.MathUtils.degToRad(-params[0]));
        break;
      }
      
      // "\ (angle)": Z軸回転
      case '\\': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateZ(THREE.MathUtils.degToRad(params[0]));
        break;
      }
      // "/ (angle)": Z軸回転
      case '/': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateZ(THREE.MathUtils.degToRad(-params[0]));
        break;
      }
      
      // "& (angle)": Y軸回転
      case '&': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateY(THREE.MathUtils.degToRad(params[0]));
        break;
      }
      // "^ (angle)": Y軸回転
      case '^': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultAngle]));
        i = nextIndex;
        turtle.rotateY(THREE.MathUtils.degToRad(-params[0]));
        break;
      }

      // "[": 保存
      case '[':
        stack.push(turtle.clone());
        i++;
        break;

      // "]": 復元
      case ']': {
        const poppedState = stack.pop();
        if (poppedState) {
          turtle.copy(poppedState);
        }
        i++;
        break;
      }
      
      // 他の文字 (ルール用の 'X' や 'Y' など) は解釈器(Interpreter)では無視
      default:
        i++;
        break;
    }
  }
  return plant;
}

// --- 3. GUIと再生成ロジック ---

let currentPlant: THREE.Group | null = null;

// ★ GUIで操作するパラメータ
const params = {
  axiom: 'X(10, 0.2)', // X(初期長さ, 初期太さ)
  iterations: 5, // 繰り返し回数をGUIで制御
  angle: 30.0, // デフォルト角度
  branchLength: 1.0, // 使わない
  color: '#8B4513', // 茶色
};

function regenerateLSystem() {
  if (currentPlant) {
    scene.remove(currentPlant);
  }

  // パラメトリック・ルールを「JavaScript関数」として定義
  const rules = {
    // X(len, width): 成長点 (または幹)
    // F(len, width): 枝 (描画される)
    
    // ルールX: 
    // X(len, width) は、次の世代で
    // 1. 幹 F(len, width) になり
    // 2. 30度傾いて (Y軸回転)
    // 3. 2つに分岐 [ ... ] [ ... ] する
    // 4. 分岐した先は、長さ*0.7, 太さ*0.7 の新しい成長点 X になる
    'X': (len: number, width: number) => 
      `F(${len.toFixed(2)}, ${width.toFixed(2)})` + // 幹を描画
      `[&(${params.angle}) \\(${params.angle * 1.5}) F(${len * 0.8}, ${width * 0.7})]` + // 右上に分岐
      `[^((${params.angle}) /(${params.angle * 1.5}) F(${len * 0.8}, ${width * 0.7})]` + // 左上に分岐
      `[\\(${params.angle * 0.5}) X(${len * 0.7}, ${width * 0.7})]`, // 真ん中がさらに成長

    // ルールF:
    // F(len, width) は、次の世代で
    // そのままの F(len, width) になる (成長停止)
    // もしFが成長し続けるルール (例: `F(${len*0.9}, ...`) を
    // 書くと、iterations が増えると急激に複雑になる
    'F': (len: number, width: number) => 
      `F(${len.toFixed(2)}, ${width.toFixed(2)})`
  };

  // 1. ルール生成器 (Generator) の実行
  console.time('L-System Generation');
  const lSystemString = generateLSystemString(
    params.axiom,
    rules,
    params.iterations
  );
  console.timeEnd('L-System Generation');
  console.log(`String Length: ${lSystemString.length}`);
  // console.log(lSystemString);

  // 2. 3D解釈器 (Interpreter) の実行
  console.time('L-System Interpretation');
  currentPlant = createLSystem3D(
    lSystemString,
    params.angle, // デフォルト角度
    1.0, // デフォルト長さ
    0.1 // デフォルト太さ
  );
  console.timeEnd('L-System Interpretation');

  scene.add(currentPlant);
}

// --- 4. GUIセットアップ ---
const gui = new GUI();

// GUIで Axiom と Iterations を編集できるようにする
gui.add(params, 'axiom').name('Axiom (初期状態)');
gui.add(params, 'iterations', 1, 8, 1).name('Iterations (繰り返し)');
gui.add(params, 'angle', 0, 90).name('Angle (角度)');
gui.addColor(params, 'color').name('Color');

// Generateボタン
gui.add({ generate: regenerateLSystem }, 'generate').name('Generate Plant');

// --- 5. 初回実行 ---
regenerateLSystem();