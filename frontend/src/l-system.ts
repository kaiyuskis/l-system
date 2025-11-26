import * as THREE from "three";

export interface BranchSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  rotation: THREE.Quaternion;
  radiusBottom: number;
  radiusTop: number;
}

export interface OrganPoint {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: number;
}

export interface FlowerPoint  {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: number;
}

export interface LeafPoint  {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: number;
}

export interface BudPoint  {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: number;
}

// 型定義
interface TurtleState {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  lenScalar: number;
  widScalar: number;
  currentWidth: number;
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

// L-System 3Dモデル生成
export function createLSystemData(
  str: string,
  params: {
    initLen: number;
    initWid: number;
    scale: number;
    widthDecay: number;
    angle: number;
    angleVariance: number;
    flowerSize: number;
    leafSize: number;
    budSize: number;
    gravity: number;
  }
): { 
  branches: BranchSegment[],
  flowers: FlowerPoint[],
  leaves: LeafPoint[],
  buds: BudPoint[],
} {

  const branches: BranchSegment[] = [];
  const flowers: FlowerPoint[] = [];
  const leaves: LeafPoint[] = [];
  const buds: BudPoint[] = [];

  const stack: TurtleState[] = [];

  // タートルの初期化
  let turtle: TurtleState = {
    position: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Quaternion(),
    lenScalar: 1.0,
    widScalar: 1.0,
    currentWidth: params.initWid,
  };

  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion();

  // 偏差計算
  const vary = (base: number, variance: number) => base + (Math.random() * 2 - 1) * variance;

  const gravityVec = new THREE.Vector3(0, -1, 0);
  // const tempVec = new THREE.Vector3();
  const tempQuat = new THREE.Quaternion();

  let i = 0;
  while (i < str.length) {
    const char = str[i];
    let res: { val: number; nextIdx: number };

    switch (char) {
      case "F": // 前進して枝を描画
        res = parsePara(str, i, params.initLen * turtle.lenScalar);
        const len = res.val;
        i = res.nextIdx;

        // 重力の適用
        if (params.gravity !== 0) {
          const currentHeading = Y.clone().applyQuaternion(turtle.rotation).normalize();
          const targetDir = gravityVec.clone().multiplyScalar(Math.sign(params.gravity));
          const strength = Math.min(Math.abs(params.gravity) * 0.01, 1.0);
          const nextHeading = currentHeading.clone().lerp(targetDir, strength).normalize();
          tempQuat.setFromUnitVectors(currentHeading, nextHeading);
          turtle.rotation.premultiply(tempQuat);
        }

        const startPos = turtle.position.clone();
        const startRot = turtle.rotation.clone();

        const rBot = turtle.currentWidth;
        const rTop = turtle.currentWidth * params.widthDecay;

        turtle.position.add(
          Y.clone().applyQuaternion(turtle.rotation).multiplyScalar(len)
        );
        const endPos = turtle.position.clone();

        branches.push({
          start: startPos,
          end: endPos,
          rotation: startRot,
          radiusBottom: rBot,
          radiusTop: rTop,
        });

        turtle.currentWidth = rTop;
        break;
      
      // 花
      case "K":
        res = parsePara(str, i, params.flowerSize);
        i = res.nextIdx;

        flowers.push({
          position: turtle.position.clone(),
          rotation: turtle.rotation.clone(),
          scale: res.val
        });
        break;

      // 葉
      case "L":
        res = parsePara(str, i, params.leafSize); 
        i = res.nextIdx;

        leaves.push({
          position: turtle.position.clone(),
          rotation: turtle.rotation.clone(),
          scale: res.val
        });
        break;

      // つぼみ
      case "M":
        res = parsePara(str, i, params.budSize);
        i = res.nextIdx;
        
        buds.push({
          position: turtle.position.clone(),
          rotation: turtle.rotation.clone(),
          scale: res.val
        });
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

      case "!": // 太さ乗算
        res = parsePara(str, i, params.scale);
        turtle.currentWidth *= res.val;
        i = res.nextIdx;
        break;
      case '"': // 長さ乗算
        res = parsePara(str, i, params.scale);
        turtle.lenScalar *= res.val;
        i = res.nextIdx;
        break;

      // スタック操作
      case "[":
        stack.push({
          ...turtle,
          position: turtle.position.clone(),
          rotation: turtle.rotation.clone(),
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

  return { branches, flowers, leaves, buds };
}