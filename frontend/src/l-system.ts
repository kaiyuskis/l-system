import * as THREE from "three";
import { random } from "./rng.ts";

export const LSYSTEM_LIMITS = Object.freeze({
  maxGenerations: 16,
  maxSymbols: 250_000,
  maxBranches: 20_000,
  maxOrgans: 30_000,
  maxBranchDepth: 512,
  maxCoordinate: 100_000,
});

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
  thickness: number;
}

export interface LSystemParams {
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

interface TurtleState {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  lenScalar: number;
  currentWidth: number;
}

const PARAMETER_COMMANDS = new Set('FfKLM+-&^\\/!"');
const SIMPLE_COMMANDS = new Set("[]|");
const MAX_PARAMETER_LENGTH = 128;

function boundedNumber(
  value: number,
  label: string,
  min: number = 0,
  max: number = LSYSTEM_LIMITS.maxCoordinate,
): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}は ${min} ～ ${max} の有限の数にしてください。`);
  }
  return value;
}

/** Arithmetic only: user-authored rules must never execute JavaScript. */
function evaluateNumber(expression: string): number {
  let index = 0;
  const skipSpace = () => {
    while (index < expression.length && /\s/.test(expression[index])) index++;
  };
  const invalid = () =>
    new Error(
      `引数「${expression}」が不正です。数値と + - * /、丸括弧を使ってください。`,
    );

  function factor(depth: number): number {
    if (depth > 32) throw invalid();
    skipSpace();
    const sign = expression[index];
    if (sign === "+" || sign === "-") {
      index++;
      return (sign === "-" ? -1 : 1) * factor(depth + 1);
    }
    if (expression[index] === "(") {
      index++;
      const value = sum(depth + 1);
      skipSpace();
      if (expression[index++] !== ")") throw invalid();
      return value;
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(
      expression.slice(index),
    );
    if (!match) throw invalid();
    index += match[0].length;
    return Number(match[0]);
  }

  function product(depth: number): number {
    let value = factor(depth);
    skipSpace();
    while (expression[index] === "*" || expression[index] === "/") {
      const operator = expression[index++];
      const right = factor(depth);
      value = operator === "*" ? value * right : value / right;
      skipSpace();
    }
    return value;
  }

  function sum(depth: number): number {
    let value = product(depth);
    skipSpace();
    while (expression[index] === "+" || expression[index] === "-") {
      const operator = expression[index++];
      const right = product(depth);
      value = operator === "+" ? value + right : value - right;
      skipSpace();
    }
    return value;
  }

  const value = sum(0);
  skipSpace();
  if (index !== expression.length || !Number.isFinite(value)) throw invalid();
  return value;
}

function parseParameter(
  str: string,
  index: number,
  fallback: number,
): { value: number; next: number } {
  if (str[index + 1] !== "(") return { value: fallback, next: index + 1 };
  let depth = 1;
  for (
    let end = index + 2;
    end < str.length && end - index <= MAX_PARAMETER_LENGTH + 2;
    end++
  ) {
    if (str[end] === "(") depth++;
    if (str[end] === ")") depth--;
    if (depth === 0) {
      return {
        value: evaluateNumber(str.slice(index + 2, end)),
        next: end + 1,
      };
    }
  }
  throw new Error(
    `位置 ${index + 1} の引数を閉じる ) がないか、引数が ${MAX_PARAMETER_LENGTH} 文字を超えています。`,
  );
}

/** Validate a complete, balanced turtle program, including numeric arguments. */
export function validateLSystemString(str: string): void {
  if (typeof str !== "string")
    throw new Error("初期状態とルールには文字列を指定してください。");
  if (str.length > LSYSTEM_LIMITS.maxSymbols) {
    throw new Error(
      `展開結果が ${LSYSTEM_LIMITS.maxSymbols.toLocaleString()} 文字を超えます。世代数やルールを小さくしてください。`,
    );
  }
  let depth = 0;
  for (let index = 0; index < str.length;) {
    const char = str[index];
    if (PARAMETER_COMMANDS.has(char)) {
      const parsed = parseParameter(str, index, 0);
      boundedNumber(
        parsed.value,
        `${char} の引数`,
        "+-&^\\/".includes(char) ? -LSYSTEM_LIMITS.maxCoordinate : 0,
      );
      index = parsed.next;
      continue;
    }
    if (char === "[") {
      if (++depth > LSYSTEM_LIMITS.maxBranchDepth)
        throw new Error(
          `枝の入れ子は ${LSYSTEM_LIMITS.maxBranchDepth} 段までにしてください。`,
        );
    } else if (char === "]") {
      if (--depth < 0)
        throw new Error(`位置 ${index + 1} の ] に対応する [ がありません。`);
    } else if (!SIMPLE_COMMANDS.has(char) && !/[A-Za-z\s]/.test(char)) {
      throw new Error(
        `位置 ${index + 1} の「${char}」は使えません。英字の記号と対応する描画コマンドを使ってください。`,
      );
    }
    index++;
  }
  if (depth !== 0) throw new Error("枝の [ と ] の数が一致していません。");
}

type RuleInput = string | readonly string[] | readonly { expression: string }[];

/** One A = ... production per line. Empty productions intentionally erase a symbol. */
export function parseRules(input: RuleInput): Record<string, string> {
  if (typeof input === "string" && input.length > LSYSTEM_LIMITS.maxSymbols)
    throw new Error("ルールが長すぎます。短くして再生成してください。");
  const rows =
    typeof input === "string"
      ? input.split(/\r?\n/)
      : input.map((row) => (typeof row === "string" ? row : row.expression));
  const rules: Record<string, string> = Object.create(null);
  let totalLength = 0;
  for (const [index, source] of rows.entries()) {
    const line = source.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0)
      throw new Error(`${index + 1} 行目は A = ... の形式で入力してください。`);
    const symbol = line.slice(0, separator).trim();
    if (!/^[A-Za-z]$/.test(symbol))
      throw new Error(`${index + 1} 行目の左辺は英字 1 文字にしてください。`);
    if (Object.hasOwn(rules, symbol))
      throw new Error(
        `記号 ${symbol} のルールが重複しています。1 行にまとめてください。`,
      );
    const replacement = line.slice(separator + 1).trim();
    totalLength += replacement.length;
    if (totalLength > LSYSTEM_LIMITS.maxSymbols)
      throw new Error("ルールが長すぎます。短くして再生成してください。");
    validateLSystemString(replacement);
    rules[symbol] = replacement;
  }
  return rules;
}

export function generateLSystemString(
  premise: string,
  rules: Record<string, string>,
  gens: number,
): string {
  boundedNumber(gens, "世代数", 0, LSYSTEM_LIMITS.maxGenerations);
  if (!Number.isInteger(gens)) throw new Error("世代数は整数にしてください。");
  validateLSystemString(premise);
  for (const [symbol, replacement] of Object.entries(rules)) {
    if (!/^[A-Za-z]$/.test(symbol))
      throw new Error("ルールの左辺は英字 1 文字にしてください。");
    validateLSystemString(replacement);
  }

  let str = premise;
  for (let generation = 0; generation < gens && str.length > 0; generation++) {
    const parts: string[] = [];
    let length = 0;
    for (let index = 0; index < str.length;) {
      const char = str[index];
      let replacement = Object.hasOwn(rules, char) ? rules[char] : char;
      // Do not rewrite symbols in numerical arguments (for example the e in 1e3).
      if (PARAMETER_COMMANDS.has(char) && str[index + 1] === "(") {
        const parsed = parseParameter(str, index, 0);
        if (replacement.length > 0)
          replacement += str.slice(index + 1, parsed.next);
        index = parsed.next;
      } else {
        index++;
      }
      length += replacement.length;
      if (length > LSYSTEM_LIMITS.maxSymbols) {
        throw new Error(
          `第 ${generation + 1} 世代で ${LSYSTEM_LIMITS.maxSymbols.toLocaleString()} 文字を超えます。世代数を減らしてください。`,
        );
      }
      parts.push(replacement);
    }
    const next = parts.join("");
    if (next === str) break;
    str = next;
  }
  validateLSystemString(str);
  return str;
}

export function createLSystemData(
  str: string,
  params: LSystemParams,
): {
  branches: BranchSegment[];
  flowers: OrganPoint[];
  leaves: OrganPoint[];
  buds: OrganPoint[];
} {
  validateLSystemString(str);
  for (const key of [
    "initLen",
    "initWid",
    "scale",
    "widthDecay",
    "angle",
    "angleVariance",
    "flowerSize",
    "leafSize",
    "budSize",
    "gravity",
  ] as const) {
    boundedNumber(
      params[key],
      key,
      key === "angle" || key === "gravity" ? -LSYSTEM_LIMITS.maxCoordinate : 0,
    );
  }
  const branches: BranchSegment[] = [];
  const flowers: OrganPoint[] = [];
  const leaves: OrganPoint[] = [];
  const buds: OrganPoint[] = [];
  const stack: TurtleState[] = [];
  let turtle: TurtleState = {
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    lenScalar: 1,
    currentWidth: params.initWid,
  };
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion();
  const vary = (base: number) =>
    base + (random() * 2 - 1) * params.angleVariance;
  const defaults: Record<string, number> = {
    K: params.flowerSize,
    L: params.leafSize,
    M: params.budSize,
    "!": params.scale,
    '"': params.scale,
  };
  let organCount = 0;

  for (let index = 0; index < str.length;) {
    const char = str[index];
    const fallback =
      char === "F" || char === "f"
        ? params.initLen * turtle.lenScalar
        : (defaults[char] ?? params.angle);
    const parsed = PARAMETER_COMMANDS.has(char)
      ? parseParameter(str, index, fallback)
      : { value: 0, next: index + 1 };
    index = parsed.next;

    if (char === "F" || char === "f") {
      const length = boundedNumber(parsed.value, "枝の長さ");
      if (length === 0) continue;
      if (params.gravity !== 0 && char === "F") {
        const heading = Y.clone().applyQuaternion(turtle.rotation).normalize();
        const target = new THREE.Vector3(0, -Math.sign(params.gravity), 0);
        const resistance = (turtle.currentWidth * 5) ** 2;
        const strength = Math.min(
          (Math.abs(params.gravity) * 0.05) / (resistance + 1),
          0.2,
        );
        const nextHeading = heading.clone().lerp(target, strength).normalize();
        q.setFromUnitVectors(heading, nextHeading);
        turtle.rotation.premultiply(q).normalize();
      }
      const start = turtle.position.clone();
      turtle.position.add(
        Y.clone().applyQuaternion(turtle.rotation).multiplyScalar(length),
      );
      for (const coordinate of turtle.position.toArray()) {
        boundedNumber(
          coordinate,
          "モデルの座標",
          -LSYSTEM_LIMITS.maxCoordinate,
        );
      }
      if (char === "F") {
        const radiusTop = boundedNumber(
          turtle.currentWidth * params.widthDecay,
          "枝の太さ",
        );
        if (turtle.currentWidth > 0) {
          if (branches.length >= LSYSTEM_LIMITS.maxBranches)
            throw new Error(
              `枝が ${LSYSTEM_LIMITS.maxBranches.toLocaleString()} 本を超えます。世代数を減らしてください。`,
            );
          branches.push({
            start,
            end: turtle.position.clone(),
            rotation: turtle.rotation.clone(),
            radiusBottom: turtle.currentWidth,
            radiusTop,
          });
        }
        turtle.currentWidth = radiusTop;
      }
    } else if (char === "K" || char === "L" || char === "M") {
      const scale = boundedNumber(parsed.value, "花・葉・つぼみのサイズ");
      if (scale === 0) continue;
      if (++organCount > LSYSTEM_LIMITS.maxOrgans)
        throw new Error(
          `花・葉・つぼみが ${LSYSTEM_LIMITS.maxOrgans.toLocaleString()} 個を超えます。世代数を減らしてください。`,
        );
      const target = char === "K" ? flowers : char === "L" ? leaves : buds;
      target.push({
        position: turtle.position.clone(),
        rotation: turtle.rotation.clone(),
        scale,
        thickness: turtle.currentWidth,
      });
    } else if ("+-&^\\/".includes(char)) {
      const axis = "+-".includes(char) ? Z : "&^".includes(char) ? X : Y;
      const sign = "+^/".includes(char) ? -1 : 1;
      q.setFromAxisAngle(
        axis,
        THREE.MathUtils.degToRad(sign * vary(parsed.value)),
      );
      turtle.rotation.multiply(q).normalize();
    } else if (char === "|") {
      q.setFromAxisAngle(Z, Math.PI);
      turtle.rotation.multiply(q).normalize();
    } else if (char === "!") {
      turtle.currentWidth = boundedNumber(
        turtle.currentWidth * parsed.value,
        "枝の太さ",
      );
    } else if (char === '"') {
      turtle.lenScalar = boundedNumber(
        turtle.lenScalar * parsed.value,
        "枝の長さ倍率",
      );
    } else if (char === "[") {
      stack.push({
        ...turtle,
        position: turtle.position.clone(),
        rotation: turtle.rotation.clone(),
      });
    } else if (char === "]") {
      // The validation above guarantees a matching opening bracket.
      turtle = stack.pop()!;
    }
  }
  return { branches, flowers, leaves, buds };
}
