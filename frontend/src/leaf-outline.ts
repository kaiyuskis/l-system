import * as THREE from "three";
import type { LeafGroupParams, LeafGroupRule } from "./types";
import { generateLSystemStringSync } from "./l-system";

type OutlineParams = {
  enabled: boolean;
  mirror: boolean;
  generations: number;
  angle: number;
  step: number;
  premise: string;
  rules: LeafGroupRule[];
  bend?: number;
};

function buildRulesMap(rules: LeafGroupRule[]) {
  const map: Record<string, string> = {};
  rules.forEach(rule => {
    const parts = rule.expression.split("=");
    if (parts.length >= 2) {
      map[parts[0].trim()] = parts.slice(1).join("=").trim();
    }
  });
  return map;
}

function buildOutlineGeometry(params: OutlineParams): THREE.BufferGeometry | null {
  if (!params.enabled) return null;

  const gens = Math.max(0, Math.floor(params.generations));
  const ruleMap = buildRulesMap(params.rules);
  const str = generateLSystemStringSync(params.premise, ruleMap, gens);

  const angleRad = THREE.MathUtils.degToRad(params.angle);
  const step = params.step;

  let pos = new THREE.Vector2(0, 0);
  let angle = Math.PI / 2;
  const stack: { pos: THREE.Vector2; angle: number }[] = [];

  const points: THREE.Vector2[] = [pos.clone()];

  for (const char of str) {
    switch (char) {
      case "F": {
        const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
        pos = pos.clone().addScaledVector(dir, step);
        points.push(pos.clone());
        break;
      }
      case "G": {
        const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
        pos = pos.clone().addScaledVector(dir, step);
        break;
      }
      case "+": {
        angle -= angleRad;
        break;
      }
      case "-": {
        angle += angleRad;
        break;
      }
      case "[": {
        stack.push({ pos: pos.clone(), angle });
        break;
      }
      case "]": {
        const popped = stack.pop();
        if (popped) {
          pos = popped.pos;
          angle = popped.angle;
        }
        break;
      }
      default:
        break;
    }
  }

  if (points.length < 3) return null;

  let outline = points;
  if (params.mirror) {
    const mirrored = points
      .slice(1, -1)
      .map(p => new THREE.Vector2(-p.x, p.y))
      .reverse();
    outline = points.concat(mirrored);
  }

  if (outline[0].distanceTo(outline[outline.length - 1]) > 1e-4) {
    outline = outline.concat(outline[0].clone());
  }

  const box = new THREE.Box2().setFromPoints(outline);
  const size = new THREE.Vector2();
  box.getSize(size);
  const center = new THREE.Vector2();
  box.getCenter(center);
  const maxSize = Math.max(size.x, size.y, 1e-6);

  const normalized = outline.map(p => p.clone().sub(center).multiplyScalar(1 / maxSize));
  const shape = new THREE.Shape(normalized);
  const geometry = new THREE.ShapeGeometry(shape);

  const bendAmount = params.bend ?? 0;
  if (bendAmount !== 0) {
    const posAttributes = geometry.attributes.position;
    const vertexCount = posAttributes.count;

    for (let i = 0; i < vertexCount; i++) {
      const x = posAttributes.getX(i);
      const y = posAttributes.getY(i);

      const z = bendAmount * (x * x);
      
      posAttributes.setZ(i, z);
    }
    geometry.computeVertexNormals();
  }
  return geometry;
}

export function buildLeafOutlineGeometry(params: LeafGroupParams): THREE.BufferGeometry | null {
  return buildOutlineGeometry({
    enabled: params.outlineEnabled,
    mirror: params.outlineMirror,
    generations: params.outlineGenerations,
    angle: params.outlineAngle,
    step: params.outlineStep,
    premise: params.outlinePremise,
    rules: params.outlineRules,
    bend: params.leafBend ?? 0,
  });
}

export function buildFlowerOutlineGeometry(params: LeafGroupParams): THREE.BufferGeometry | null {
  return buildOutlineGeometry({
    enabled: params.flowerOutlineEnabled,
    mirror: params.flowerOutlineMirror,
    generations: params.flowerOutlineGenerations,
    angle: params.flowerOutlineAngle,
    step: params.flowerOutlineStep,
    premise: params.flowerOutlinePremise,
    rules: params.flowerOutlineRules,
  });
}

export function buildBudOutlineGeometry(params: LeafGroupParams): THREE.BufferGeometry | null {
  return buildOutlineGeometry({
    enabled: params.budOutlineEnabled,
    mirror: params.budOutlineMirror,
    generations: params.budOutlineGenerations,
    angle: params.budOutlineAngle,
    step: params.budOutlineStep,
    premise: params.budOutlinePremise,
    rules: params.budOutlineRules,
  });
}
