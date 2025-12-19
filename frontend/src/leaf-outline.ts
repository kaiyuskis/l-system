import * as THREE from "three";
import type { LeafGroupParams } from "./types";
import { generateLSystemStringSync } from "./l-system";

function buildRulesMap(rules: LeafGroupParams["outlineRules"]) {
  const map: Record<string, string> = {};
  rules.forEach(rule => {
    const parts = rule.expression.split("=");
    if (parts.length >= 2) {
      map[parts[0].trim()] = parts.slice(1).join("=").trim();
    }
  });
  return map;
}

export function buildLeafOutlineGeometry(params: LeafGroupParams): THREE.BufferGeometry | null {
  if (!params.outlineEnabled) return null;

  const gens = Math.max(0, Math.floor(params.outlineGenerations));
  const ruleMap = buildRulesMap(params.outlineRules);
  const str = generateLSystemStringSync(params.outlinePremise, ruleMap, gens);

  const angleRad = THREE.MathUtils.degToRad(params.outlineAngle);
  const step = params.outlineStep;

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
  if (params.outlineMirror) {
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
  return new THREE.ShapeGeometry(shape);
}
