import * as THREE from 'three';

// -----------------------------------------------------------------
// 1. L-system 文字列生成器
// (l-system.ts の generateLSystemString とほぼ同じだが、
//  ここではパラメータ(len, p)を使わないシンプルなバージョンを使用)
// -----------------------------------------------------------------

/**
 * 葉脈用のシンプルなL-system文字列を生成する
 * @param premise 公理
 * @param rules 規則
 * @param generations 繰り返し回数
 * @returns L-system文字列
 */
function generateLeafString(
  premise: string,
  rules: { [key: string]: string },
  generations: number
): string {
  let currentString = premise;
  for (let i = 0; i < generations; i++) {
    let nextString = '';
    for (const char of currentString) {
      nextString += rules[char] || char;
    }
    currentString = nextString;
  }
  return currentString;
}

// -----------------------------------------------------------------
// 2. 2Dタートル解釈器 ＆ ジオメトリビルダー
// -----------------------------------------------------------------

/**
 * L-system文字列から、葉脈のジオメトリ(BufferGeometry)を生成する
 * @returns THREE.BufferGeometry
 */
export function createLeafGeometry(): THREE.BufferGeometry {
  
  // 1. 葉脈のL-systemルールを定義
  const leafParams = {
    premise: 'X',
    rules: {
      // X: 成長点 (描画しない)
      // F: 枝 (描画する)
      'X': 'F[+X]F[-X][X]',
      'F': 'FF'
    },
    generations: 4, // 葉脈の複雑さ
    angle: 25,   // 葉脈の分岐角度
    length: 0.1,   // 葉脈の基本長
  };

  // 2. L-system文字列を生成
  const lSystemString = generateLeafString(
    leafParams.premise,
    leafParams.rules,
    leafParams.generations
  );

  // 3. 2Dタートルで解釈
  const turtle = {
    position: new THREE.Vector2(0, 0), // 2Dの位置
    direction: new THREE.Vector2(0, 1), // 上向き (Y軸)
  };
  const stack: typeof turtle[] = [];
  const vertices: number[] = []; // 頂点バッファ (x, y, z, x, y, z, ...)

  const angleRad = THREE.MathUtils.degToRad(leafParams.angle);

  for (const char of lSystemString) {
    switch (char) {
      case 'F': // 描画して前進
      {
        // 1. 現在地を線の始点として追加 (Z=0)
        vertices.push(turtle.position.x, turtle.position.y, 0);

        // 2. 前進
        turtle.position.addScaledVector(turtle.direction, leafParams.length);

        // 3. 移動先を線の終点として追加 (Z=0)
        vertices.push(turtle.position.x, turtle.position.y, 0);
        break;
      }
      
      case 'f': // 描画せず前進
        turtle.position.addScaledVector(turtle.direction, leafParams.length);
        break;

      case '+': // 左回転 (2D)
        turtle.direction.rotateAround(new THREE.Vector2(), angleRad);
        break;
      
      case '-': // 右回転 (2D)
        turtle.direction.rotateAround(new THREE.Vector2(), -angleRad);
        break;

      case '[': // 保存
        stack.push({
          position: turtle.position.clone(),
          direction: turtle.direction.clone()
        });
        break;

      case ']': // 復元
      {
        const popped = stack.pop();
        if (popped) {
          turtle.position.copy(popped.position);
          turtle.direction.copy(popped.direction);
        }
        break;
      }
    }
  }

  // 4. 頂点データからジオメトリを生成
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  
  // 葉の根元 (0,0) を中心に回転・スケールできるようにセンタリング
  geometry.center();
  
  return geometry;
}