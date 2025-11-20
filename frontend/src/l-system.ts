import * as THREE from "three";

// 型定義
interface TurtleState {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  lenScalar: number;
  widScalar: number;
}

// パラメータ付きコマンド解析
function parsePara(
  str: string,
  idx: number,
  defaultVal: number
): { val: number; nextIdx: number } {
  if (idx + 1 < str.length && str[idx + 1] === "(") {
    const close = str.indexOf(")", idx + 1);
    if (close !== -1) {
      const content = str.substring(idx + 2, close);
      try {
        const val = new Function(`return ${content}`)();
        return { val: Number(val), nextIdx: close + 1 };
      } catch {}
    }
  }
  return { val: defaultVal, nextIdx: idx + 1 };
}

// L-System 文字列生成
export function generateLSystemString(
  premise: string,
  rules: { [key: string]: string },
  gens: number
): string {
  let str = premise;
  for (let i = 0; i < gens; i++) {
    let next = "";
    for (const char of str) {
      next += rules[char] || char;
    }
    str = next;
  }
  return str;
}

// 偏差計算
function  vary(base: number, variance: number): number {
  return base + (Math.random() * 2 - 1) * variance;
}

// L-System 3Dモデル生成
export function createLSystem3D(
  str: string,
  params: {
    initLen: number;
    initWid: number;
    scale: number;
    angle: number;
    angleVariance: number;
    flowerSize: number;
    leafSize: number;
    budSize: number;
  },
  branchMatrices: THREE.Matrix4[],
  flowerMatrices: THREE.Matrix4[],
  leafMatrices: THREE.Matrix4[],
  budMatrices: THREE.Matrix4[]
): void {
  const stack: TurtleState[] = [];
  const branchDummy = new THREE.Object3D();
  const objDummy = new THREE.Object3D();

  // タートルの初期化
  let turtle: TurtleState = {
    position: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Quaternion(),
    lenScalar: 1.0,
    widScalar: 1.0,
  };

  // 分散計算
  const vary = (base: number, variance: number) => base + (Math.random() * 2 - 1) * variance;

  // 軸ベクトル
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion();

  let i = 0;
  while (i < str.length) {
    const char = str[i];
    let res: { val: number; nextIdx: number };

    switch (char) {
      case "F": // 前進して枝を描画
        res = parsePara(str, i, params.initLen * turtle.lenScalar);
        const L = res.val;
        i = res.nextIdx;
        const W = params.initWid * turtle.widScalar;

        branchDummy.position.copy(turtle.position);
        branchDummy.quaternion.copy(turtle.rotation);
        branchDummy.scale.set(W, L, W);
        branchDummy.updateMatrix();
        branchMatrices.push(branchDummy.matrix.clone());

        turtle.position.add(
          Y.clone().applyQuaternion(turtle.rotation).multiplyScalar(L)
        );

        break;
      
      // 花
      case "K":
        res = parsePara(str, i, params.flowerSize);
        i = res.nextIdx;
        objDummy.position.copy(turtle.position);
        objDummy.quaternion.copy(turtle.rotation);
        objDummy.scale.setScalar(res.val);
        objDummy.translateY(res.val * 0.5);
        objDummy.updateMatrix();
        flowerMatrices.push(objDummy.matrix.clone());
        break;

      // 葉
      case "L":
        res = parsePara(str, i, params.leafSize);
        i = res.nextIdx;
        objDummy.position.copy(turtle.position);
        objDummy.quaternion.copy(turtle.rotation);
        objDummy.scale.setScalar(res.val);
        objDummy.translateY(res.val * 0.5);
        objDummy.updateMatrix();
        leafMatrices.push(objDummy.matrix.clone());
        break;

      // つぼみ
      case "M":
        res = parsePara(str, i, params.budSize);
        i = res.nextIdx;
        objDummy.position.copy(turtle.position);
        objDummy.quaternion.copy(turtle.rotation);
        objDummy.scale.setScalar(res.val);
        objDummy.translateY(res.val * 0.5);
        objDummy.updateMatrix();
        budMatrices.push(objDummy.matrix.clone());
        break;

      case "+": // 右回転 (Yaw -)
        res = parsePara(str, i, params.angle);
        q.setFromAxisAngle(Z, THREE.MathUtils.degToRad(-vary(res.val, params.angleVariance)));
        turtle.rotation.multiply(q);
        i = res.nextIdx;
        break;
      case "-": // 左回転 (Yaw +)
        res = parsePara(str, i, params.angle);
        q.setFromAxisAngle(Z, THREE.MathUtils.degToRad(vary(res.val, params.angleVariance)));
        turtle.rotation.multiply(q);
        i = res.nextIdx;
        break;

      case "&": // ピッチダウン (Pitch +)
        res = parsePara(str, i, params.angle);
        q.setFromAxisAngle(X, THREE.MathUtils.degToRad(vary(res.val, params.angleVariance)));
        turtle.rotation.multiply(q);
        i = res.nextIdx;
        break;
      case "^": // ピッチアップ (Pitch -)
        res = parsePara(str, i, params.angle);
        q.setFromAxisAngle(X, THREE.MathUtils.degToRad(-vary(res.val, params.angleVariance)));
        turtle.rotation.multiply(q);
        i = res.nextIdx;
        break;

      case "\\": // ロール (Roll +)
        res = parsePara(str, i, params.angle);
        q.setFromAxisAngle(Y, THREE.MathUtils.degToRad(vary(res.val, params.angleVariance)));
        turtle.rotation.multiply(q);
        i = res.nextIdx;
        break;
      case "/": // ロール (Roll -)
        res = parsePara(str, i, params.angle);
        q.setFromAxisAngle(Y, THREE.MathUtils.degToRad(-vary(res.val, params.angleVariance)));
        turtle.rotation.multiply(q);
        i = res.nextIdx;
        break;

      case "|": // 180度ターン
        q.setFromAxisAngle(Z, Math.PI);
        turtle.rotation.multiply(q);
        i++;
        break;

      case "!": // 太さ乗算 (Default: scale)
        res = parsePara(str, i, params.scale);
        turtle.widScalar *= res.val;
        i = res.nextIdx;
        break;
      case '"': // 長さ乗算 (Default: scale)
        res = parsePara(str, i, params.scale);
        turtle.lenScalar *= res.val;
        i = res.nextIdx;
        break;

      // スタック操作
      case "[":
        stack.push({
          position: turtle.position.clone(),
          rotation: turtle.rotation.clone(),
          lenScalar: turtle.lenScalar,
          widScalar: turtle.widScalar,
        });
        i++;
        break;
      case "]":
        const popped = stack.pop();
        if (popped) turtle = popped;
        i++;
        break;

      default:
        i++;
        break;
    }
  }
}