import * as THREE from "three";
import type { PerfTimings, RenderMetrics, StructureMetrics } from "./types";

export function countChar(s: string, ch: string): number {
  let c = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ch) c++;
  return c;
}

export function calcDepthFromBrackets(s: string): { pushes: number; maxDepth: number } {
  let depth = 0;
  let maxDepth = 0;
  let pushes = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "[") {
      pushes++;
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (ch === "]") {
      depth = Math.max(0, depth - 1);
    }
  }
  return { pushes, maxDepth };
}

export function calcBBoxForGroup(group: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  box.setFromObject(group);
  return box;
}

export function approxXZWidth(box: THREE.Box3): number {
  const size = new THREE.Vector3();
  box.getSize(size);
  return Math.max(size.x, size.z);
}

export function getRenderMetrics(renderer: THREE.WebGLRenderer): RenderMetrics {
  const info = renderer.info;
  return {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
  };
}

export function formatMetricsLine(struct: StructureMetrics, perf: PerfTimings, render?: RenderMetrics) {
  const parts = [
    `gen=${struct.generations}`,
    `str=${struct.stringLength}`,
    `F=${struct.branchCountF}`,
    `branches=${struct.branchSegments}`,
    `push=[${struct.bracketPushes}]`,
    `depthMax=${struct.maxBranchDepth}`,
    `L=${struct.leaves}`,
    `K=${struct.flowers}`,
    `M=${struct.buds}`,
    `H=${struct.bboxHeight.toFixed(2)}`,
    `W=${struct.bboxWidth.toFixed(2)}`,
    `rewrite=${perf.rewriteMs.toFixed(1)}ms`,
    `interpret=${perf.interpretMs.toFixed(1)}ms`,
    `mesh=${perf.meshMs.toFixed(1)}ms`,
    `total=${perf.totalMs.toFixed(1)}ms`,
  ];
  if (render) {
    parts.push(`calls=${render.drawCalls}`, `tri=${render.triangles}`);
  }
  return parts.join(" | ");
}
