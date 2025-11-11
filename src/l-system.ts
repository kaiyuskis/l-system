import * as THREE from 'three';

/**
 * ★ ヘルパー関数: パラメータ(...)をパースする
 * 'F(1.0, 0.5)' や '+(30)' や 'B()' のような文字列を処理する
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
 * ★ L-systemの「ルール生成器」 (パラメトリック対応)
 * @param axiom 開始文字列 (公理)
 * @param rules ルール (JavaScript関数のオブジェクト)
 * @param iterations 繰り返す回数
 * @param globalParams ルール関数内で参照するグローバル変数 (p.angle など)
 */
export function generateLSystemString(
  axiom: string,
  rules: { [key: string]: (...args: any[]) => string },
  iterations: number,
  globalParams: any
): string {
  let currentString = axiom;

  for (let i = 0; i < iterations; i++) {
    let nextString = '';
    let j = 0;
    
    // ★ 文字列をパースしながら進む
    while (j < currentString.length) {
      const char = currentString[j];
      
      // ルールを適用する可能性のある文字 (A-Z)
      if (char.match(/[A-Z]/)) {
        // パラメータを取得 (例: X(10, 0.2) -> values = [10, 0.2])
        const { values, nextIndex } = parseParameters(currentString, j + 1, []);
        const command = char;
        const rule = rules[command]; // 対応するルール関数を探す

        if (rule) {
          // ★ ルールが存在する場合、関数を実行して置換後の文字列を取得
          // 'p' (globalParams) を引数の最後に追加
          const replacement = rule.apply(null, [...values, globalParams]);
          nextString += replacement;
          j = nextIndex; // インデックスをジャンプ
        } else {
          // ★ ルールが存在しない場合 (例: 'F' にルールがない)
          // 元のコマンドとパラメータをそのままコピー
          nextString += currentString.substring(j, nextIndex);
          j = nextIndex;
        }
      } else {
        // ★ 'F' や 'X' 以外 ('[', ']', '+', '-')
        // パラメータをパースして、そのままコピーする
        // (例: '+(30)' をそのまま '+(30)' としてコピー)
        const { values, nextIndex } = parseParameters(currentString, j + 1, []);
        nextString += currentString.substring(j, nextIndex);
        j = nextIndex;
      }
    }
    currentString = nextString;
  }
  return currentString;
}

/**
 * ★ L-systemの「3D解釈器 (Interpreter)」 (パラメトリック対応)
 */
export function createLSystem3D(
  lSystemString: string,
  defaultAngle: number,
  defaultLength: number,
  defaultWidth: number,
  color: THREE.ColorRepresentation
): THREE.Group {
  const plant = new THREE.Group();
  const turtle = new THREE.Object3D();
  const stack: THREE.Object3D[] = [];
  
  const branchMaterial = new THREE.MeshStandardMaterial({
    color: color
  });

  let i = 0;
  while (i < lSystemString.length) {
    const char = lSystemString[i];
    
    let params: number[];
    let nextIndex: number;

    switch (char) {
      // "F(length, width)": 枝を描画
      case 'F': {
        ({ values: params, nextIndex } = parseParameters(lSystemString, i + 1, [defaultLength, defaultWidth]));
        const length = params[0];
        const width = params.length > 1 ? params[1] : defaultWidth;
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