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
    angle: number;
    angleVariance: number;
    turn: number;
    scale: number;
    leafSize: number;
  },
  col: THREE.ColorRepresentation,
  leafMats: THREE.Matrix4[]
): THREE.Group {
  const group = new THREE.Group();
  const stack: TurtleState[] = [];
  const mat = new THREE.MeshStandardMaterial({ color: col });
  const leafDummy = new THREE.Object3D();

  // タートルの初期化
  let turtle: TurtleState = {
    position: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Quaternion(),
    lenScalar: 1.0,
    widScalar: 1.0,
  };

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
        const geo = new THREE.CylinderGeometry(W, W, L, 6);
        geo.translate(0, L / 2, 0);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(turtle.position);
        mesh.quaternion.copy(turtle.rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        turtle.position.add(
          Y.clone().applyQuaternion(turtle.rotation).multiplyScalar(L)
        );

        break;

      case "A": case "B": case "L": case "X":
        res = parsePara(str, i, params.leafSize);
        const s = res.val;
        i = res.nextIdx;

        leafDummy.position.copy(turtle.position);
        leafDummy.quaternion.copy(turtle.rotation);
        leafDummy.scale.setScalar(s);
        leafDummy.translateY(s * 0.5);
        leafDummy.updateMatrix();
        leafMats.push(leafDummy.matrix.clone());
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
  return group;
}