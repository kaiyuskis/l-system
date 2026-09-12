import * as THREE from "three";
import type { Population } from "./geometry-client.ts";

/** Resize only the woody short shoot; never mutate matrices used by its needles. */
export function shortShootMatrices(points: Population, baseRadius = .007): Float32Array {
  const matrices = points.matrices.slice();
  const frame = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (let i = 0; i < points.count; i++) {
    frame.fromArray(points.matrices, i * 16).decompose(position, rotation, scale);
    const radial = Math.min(scale.x, Math.max(.0004, points.thickness[i] * .7) / baseRadius);
    scale.x = scale.z = radial;
    frame.compose(position, rotation, scale).toArray(matrices, i * 16);
  }
  return matrices;
}
