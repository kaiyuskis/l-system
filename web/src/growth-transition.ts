import * as THREE from "three";

/** A balanced spatial index keeps correspondence work bounded for dense trees. */
export class PointIndex {
  private root: Node | null;
  private points: Float32Array;
  constructor(points: Float32Array) {
    this.points = points;
    const build = (ids: number[], depth: number): Node | null => {
      if (!ids.length) return null;
      const axis = depth % 3;
      ids.sort((a, b) => points[a * 3 + axis] - points[b * 3 + axis]);
      const mid = ids.length >> 1;
      return { id: ids[mid], axis, left: build(ids.slice(0, mid), depth + 1), right: build(ids.slice(mid + 1), depth + 1) };
    };
    this.root = build(Array.from({ length: points.length / 3 }, (_, i) => i), 0);
  }
  nearest(x: number, y: number, z: number): number {
    const q = [x, y, z];
    let best = -1, distance = Infinity;
    const visit = (node: Node | null) => {
      if (!node) return;
      const offset = node.id * 3;
      const d = (x - this.points[offset]) ** 2 + (y - this.points[offset + 1]) ** 2 + (z - this.points[offset + 2]) ** 2;
      if (d < distance) { best = node.id; distance = d; }
      const delta = q[node.axis] - this.points[offset + node.axis];
      visit(delta < 0 ? node.left : node.right);
      if (delta * delta <= distance) visit(delta < 0 ? node.right : node.left);
    };
    visit(this.root);
    return best;
  }
}
type Node = { id: number; axis: number; left: Node | null; right: Node | null };

type Axis = { id?: string; start: number; end: number; width: number; rings: number };
/** The native sweep emits independent, contiguous axes, each ending in two caps.
 * Read connected index runs rather than assuming axes retain their array index.
 */
function axes(geometry: THREE.BufferGeometry): Axis[] {
  if (geometry.userData.growthAxes?.length) return geometry.userData.growthAxes as Axis[];
  const indices = geometry.index?.array;
  if (!indices?.length) return [];
  const result: Axis[] = [];
  let start = 0, maximum = -1, width = 0;
  const finish = () => {
    const rings = (maximum + 1 - start - 2) / width;
    if (width >= 4 && Number.isInteger(rings) && rings >= 2)
      result.push({ start, end: maximum + 1, width, rings });
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    if (a > maximum && b > maximum && c > maximum) {
      if (maximum >= 0) finish();
      start = a;
      width = c - a;
    }
    maximum = Math.max(maximum, a, b, c);
  }
  finish();
  return result;
}

function sweptStart(large: THREE.Mesh, small: THREE.Mesh | undefined) {
  const target = large.geometry.getAttribute("position").array;
  const previous = small?.geometry.getAttribute("position").array;
  const targetAxes = axes(large.geometry), oldAxes = small ? axes(small.geometry) : [];
  const oldById = new Map(oldAxes.filter(axis=>axis.id).map(axis=>[axis.id,axis]));
  const origins = new Float32Array(oldAxes.length * 3);
  oldAxes.forEach((axis, i) => origins.set(previous!.slice((axis.end - 2) * 3, (axis.end - 1) * 3), i * 3));
  const originIndex = new PointIndex(origins);
  const originGroups = new Map<string, Axis[]>();
  oldAxes.forEach((axis, i) => {
    const key = Array.from(origins.slice(i * 3, i * 3 + 3)).join(",");
    const group = originGroups.get(key) ?? [];
    group.push(axis); originGroups.set(key, group);
  });
  const heading = (axis: Axis, positions: ArrayLike<number>) => {
    const direction = new THREE.Vector3();
    for (let j = 0; j < axis.width - 1; j++)
      for (let k = 0; k < 3; k++) direction.setComponent(k, direction.getComponent(k) + positions[(axis.start + axis.width + j) * 3 + k] / (axis.width - 1));
    return direction.sub(new THREE.Vector3().fromArray(positions, (axis.end - 2) * 3)).normalize();
  };
  const oldCenters: number[] = [];
  for (const axis of oldAxes) {
    for (let r = 0; r < axis.rings; r++) {
      const center = [0, 0, 0];
      for (let j = 0; j < axis.width - 1; j++)
        for (let k = 0; k < 3; k++) center[k] += previous![(axis.start + r * axis.width + j) * 3 + k] / (axis.width - 1);
      oldCenters.push(...center);
    }
  }
  const centers = new Float32Array(oldCenters), centerIndex = new PointIndex(centers);
  const start = new Float32Array(target.length);
  const targetAnchors: number[] = [], sourceAnchors: number[] = [];
  for (const axis of targetAxes) {
    const origin = Array.from(target.slice((axis.end - 2) * 3, (axis.end - 1) * 3));
    const match = axis.id ? -1 : originIndex.nearest(origin[0], origin[1], origin[2]);
    let old: Axis | undefined = axis.id ? oldById.get(axis.id) : undefined;
    if (!axis.id && match >= 0 && Math.hypot(...origin.map((v, k) => v - origins[match * 3 + k])) < 0.05) {
      const candidates = originGroups.get(Array.from(origins.slice(match * 3, match * 3 + 3)).join(","))!;
      const direction = heading(axis, target);
      // A clipped first internode and the completed curve can have
      // different tangents, especially on a young winding trunk.
      let alignment = 0.75;
      for (const candidate of candidates) {
        if (candidate.width !== axis.width) continue;
        const dot = direction.dot(heading(candidate, previous!));
        if (dot > alignment) { old = candidate; alignment = dot; }
      }
    }
    const nearest = centerIndex.nearest(origin[0], origin[1], origin[2]);
    const collapsed = nearest < 0 ? [0, 0, 0] : Array.from(centers.slice(nearest * 3, nearest * 3 + 3));
    for (let v = axis.start; v < axis.end; v++) {
      const ring = Math.floor((v - axis.start) / axis.width);
      let source = -1;
      if (old) {
        source = v === axis.end - 2 ? old.end - 2 : v === axis.end - 1 || ring >= old.rings ? old.end - 1 : old.start + (v - axis.start);
      }
      for (let k = 0; k < 3; k++) start[v * 3 + k] = source < 0 ? collapsed[k] : previous![source * 3 + k];
    }
    for (let r = 0; r < axis.rings; r++) {
      const endCenter = [0, 0, 0], startCenter = [0, 0, 0];
      for (let j = 0; j < axis.width - 1; j++) {
        for (let k = 0; k < 3; k++) {
          const offset = (axis.start + r * axis.width + j) * 3 + k;
          endCenter[k] += target[offset] / (axis.width - 1);
          startCenter[k] += start[offset] / (axis.width - 1);
        }
      }
      targetAnchors.push(...endCenter); sourceAnchors.push(...startCenter);
    }
  }
  return { start, targetAnchors: new Float32Array(targetAnchors), sourceAnchors: new Float32Array(sourceAnchors) };
}

/** Morph the larger topology from/to the smaller tree; roots stay anchored.
 * Correspondence is spatial, not vertex-index based: new axes change topology.
 * No shared API buffers are mutated. Calling finish restores exact geometry.
 */
export function prepareGrowth(large: THREE.Group, small: THREE.Group) {
  const wood = small.getObjectByName("Branches");
  const targetWood = large.getObjectByName("Branches");
  const sweep = targetWood instanceof THREE.Mesh && !(targetWood instanceof THREE.InstancedMesh)
    ? sweptStart(targetWood, wood instanceof THREE.Mesh && !(wood instanceof THREE.InstancedMesh) ? wood : undefined) : undefined;
  let points = new Float32Array(0);
  if (wood instanceof THREE.InstancedMesh) {
    points = new Float32Array(wood.count * 3);
    for (let i = 0; i < wood.count; i++) points.set(wood.instanceMatrix.array.slice(i * 16 + 12, i * 16 + 15), i * 3);
  } else if (!sweep && wood instanceof THREE.Mesh) {
    points = new Float32Array(wood.geometry.getAttribute("position").array);
  }
  const index = new PointIndex(points);
  const anchorIndex = sweep ? new PointIndex(sweep.targetAnchors) : index;
  const updates: ((t: number) => void)[] = [];
  const restores: (() => void)[] = [];
  large.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const culled = object.frustumCulled;
    object.frustumCulled = false;
    restores.push(() => { object.frustumCulled = culled; });
    if (object instanceof THREE.InstancedMesh) {
      const original = object.instanceMatrix;
      const end = new Float32Array(original.array);
      const start = end.slice();
      const previous = small.getObjectByName(object.name);
      const prevMesh = previous instanceof THREE.InstancedMesh ? previous : undefined;
      const prevCount = prevMesh ? prevMesh.count : 0;
      const prevAnchors = new Float32Array(prevCount * 3);
      if (prevMesh) {
        for (let i = 0; i < prevCount; i++) {
          prevAnchors.set(prevMesh.instanceMatrix.array.slice(i * 16 + 12, i * 16 + 15), i * 3);
        }
      }

      const currCount = object.count;
      const currAnchors = new Float32Array(currCount * 3);
      for (let i = 0; i < currCount; i++) {
        currAnchors.set(end.slice(i * 16 + 12, i * 16 + 15), i * 3);
      }

      const matchedPrevForTarget = new Int32Array(currCount).fill(-1);
      const claimedPrev = new Uint8Array(prevCount);
      const claimedTarget = new Uint8Array(currCount);

      const ids = object.userData.growthIds as string[] | undefined;
      const oldIds = previous?.userData.growthIds as string[] | undefined;
      if (ids && oldIds) {
        const byId = new Map(oldIds.map((id,i)=>[id,i]));
        for(let i=0;i<currCount;i++) matchedPrevForTarget[i]=byId.get(ids[i]) ?? -1;
      } else if (prevCount > 0 && currCount > 0) {
        const prevIndex = new PointIndex(prevAnchors);
        for (let i = 0; i < currCount; i++) {
          const x = currAnchors[i * 3], y = currAnchors[i * 3 + 1], z = currAnchors[i * 3 + 2];
          const match = prevIndex.nearest(x, y, z);
          if (match >= 0 && !claimedPrev[match]) {
            const d = Math.hypot(x - prevAnchors[match * 3], y - prevAnchors[match * 3 + 1], z - prevAnchors[match * 3 + 2]);
            if (d < 1e-4) {
              matchedPrevForTarget[i] = match;
              claimedPrev[match] = 1;
              claimedTarget[i] = 1;
            }
          }
        }

        const currIndex = new PointIndex(currAnchors);
        for (let j = 0; j < prevCount; j++) {
          if (claimedPrev[j]) continue;
          const px = prevAnchors[j * 3], py = prevAnchors[j * 3 + 1], pz = prevAnchors[j * 3 + 2];
          const match = currIndex.nearest(px, py, pz);
          if (match >= 0 && !claimedTarget[match]) {
            const d = Math.hypot(px - currAnchors[match * 3], py - currAnchors[match * 3 + 1], pz - currAnchors[match * 3 + 2]);
            if (d < 2.5) {
              matchedPrevForTarget[match] = j;
              claimedTarget[match] = 1;
              claimedPrev[j] = 1;
            }
          }
        }


      }

      for (let i = 0; i < currCount; i++) {
        const offset = i * 16;
        const prevIdx = matchedPrevForTarget[i];
        if (prevIdx >= 0 && prevMesh) {
          start.set(prevMesh.instanceMatrix.array.slice(prevIdx * 16, prevIdx * 16 + 16), offset);
        } else {
          const x = end[offset + 12], y = end[offset + 13], z = end[offset + 14];
          const nearest = anchorIndex.nearest(x, y, z);
          start.fill(0, offset, offset + 12);
          for (let k = 0; k < 3; k++) {
            start[offset + 12 + k] = nearest < 0 ? 0 : (sweep?.sourceAnchors ?? points)[nearest * 3 + k];
          }
        }
      }
      const attribute = original;
      const originalArray = original.array;
      attribute.array = start.slice();
      attribute.needsUpdate = true;
      updates.push(t => { for (let i = 0; i < end.length; i++) attribute.array[i] = start[i] + (end[i] - start[i]) * t; attribute.needsUpdate = true; });
      restores.push(() => { attribute.array = originalArray; attribute.needsUpdate = true; });
    } else {
      const original = object.geometry.getAttribute("position") as THREE.BufferAttribute;
      const end = new Float32Array(original.array), start = sweep && object === targetWood ? sweep.start : end.slice();
      if (!sweep || object !== targetWood) for (let i = 0; i < end.length; i += 3) {
        const nearest = index.nearest(end[i], end[i + 1], end[i + 2]);
        for (let k = 0; k < 3; k++) start[i + k] = nearest < 0 ? 0 : points[nearest * 3 + k];
      }
      const attribute = original;
      const originalArray = original.array;
      attribute.array = start.slice();
      attribute.needsUpdate = true;
      updates.push(t => { for (let i = 0; i < end.length; i++) attribute.array[i] = start[i] + (end[i] - start[i]) * t; attribute.needsUpdate = true; });
      restores.push(() => { attribute.array = originalArray; attribute.needsUpdate = true; });
    }
  });
  return { update(t: number, ease = true) { updates.forEach(update => update(ease ? THREE.MathUtils.smoothstep(t, 0, 1) : THREE.MathUtils.clamp(t, 0, 1))); }, finish() { restores.forEach(restore => restore()); } };
}
