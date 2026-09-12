import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PointIndex, prepareGrowth } from '../src/growth-transition.ts';

// Same independent ring-and-cap layout as the Rust sweep, including UV seams.
function tree(paths) {
  const position = [], index = [];
  for (const path of paths) {
    const start = position.length / 3, width = 5;
    for (const [x, y, z] of path)
      for (let j = 0; j < width; j++) position.push(x + Math.cos(j * Math.PI / 2) * .02, y, z + Math.sin(j * Math.PI / 2) * .02);
    for (let r = 0; r < path.length - 1; r++) for (let j = 0; j < 4; j++) {
      const a = start + r * width + j, b = a + width;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
    for (const [r, reverse] of [[0, true], [path.length - 1, false]]) {
      const cap = position.length / 3; position.push(...path[r]);
      for (let j = 0; j < 4; j++) {
        const a = start + r * width + j;
        index.push(...(reverse ? [cap, a + 1, a] : [cap, a, a + 1]));
      }
    }
  }
  const group = new THREE.Group();
  if (paths.length) {
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry); mesh.name = 'Branches'; group.add(mesh);
  }
  return group;
}

test('spatial index agrees with brute force and handles an empty seed', () => {
  assert.equal(new PointIndex(new Float32Array()).nearest(1, 2, 3), -1);
  const points = new Float32Array(Array.from({length:300}, (_, i) => Math.sin(i * 79) * 10));
  const index = new PointIndex(points);
  for (let i = 0; i < 25; i++) {
    const q = [Math.cos(i), i / 2, Math.sin(i)];
    const distances = Array.from({length:100}, (_, j) => Math.hypot(...q.map((v,k)=>v-points[j*3+k])));
    assert.equal(index.nearest(...q), distances.indexOf(Math.min(...distances)));
  }
});

test('established rings stay fixed and additional wood extends from the old tip', () => {
  const small = tree([[[0,0,0],[.1,1,0]]]);
  const large = tree([[[0,0,0],[.1,1,0],[.3,2,.1],[.2,3,.2]], [[.3,2,.1],[1,3,.1]]]);
  const mesh = large.children[0], original = mesh.geometry.getAttribute('position');
  const cached = original.array, saved = cached.slice(), old = small.children[0].geometry.getAttribute('position').array.slice();
  const morph = prepareGrowth(large, small);
  morph.update(0);
  const current = mesh.geometry.getAttribute('position').array;
  assert.deepEqual(current.slice(0,30), old.slice(0,30));
  assert.deepEqual(Array.from(current.slice(30,33)), Array.from(old.slice(-3)));
  morph.update(.5);
  assert.equal(mesh.geometry.getAttribute('position').getY(10), 1.5);
  assert.deepEqual(cached, saved, 'cached endpoint buffer must remain immutable');
  assert.deepEqual(small.children[0].geometry.getAttribute('position').array, old);
  morph.update(1);
  assert.deepEqual(mesh.geometry.getAttribute('position').array, saved);
  morph.finish();
  assert.equal(mesh.geometry.getAttribute('position'), original);
  assert.equal(mesh.frustumCulled, true);
});

test('axis identity follows its root even when new axes change mesh ordering', () => {
  const trunk = [[0,0,0],[0,1,0],[0,2,0]];
  const branch = [[0,1,0],[1,2,0]];
  const small = tree([trunk, branch]);
  const large = tree([trunk, [[0,2,0],[-1,3,0]], branch]);
  const morph = prepareGrowth(large, small);
  morph.update(0);
  const a = large.children[0].geometry.getAttribute('position').array;
  const b = small.children[0].geometry.getAttribute('position').array;
  assert.deepEqual(a.slice(-36), b.slice(-36));
  morph.finish();
});

test('seed transitions and reverse interpolation are finite and restore exact instances', () => {
  const large = tree([[[0,0,0],[0,1,0]]]), small = tree([]);
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial(), 1);
  leaves.name = 'Leaves'; leaves.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0,1,0)); large.add(leaves);
  const original = leaves.instanceMatrix, saved = original.array.slice();
  const morph = prepareGrowth(large, small);
  for (const time of [1,.75,.5,.25,0]) {
    morph.update(time);
    assert.ok(Array.from(leaves.instanceMatrix.array).every(Number.isFinite));
  }
  assert.equal(leaves.instanceMatrix.array[0], 0);
  morph.finish();
  assert.equal(leaves.instanceMatrix, original);
  assert.deepEqual(original.array, saved);
});

test('trunk and roots sharing an origin match by direction when reordered', () => {
  const trunk = [[0,0,0],[0,1,0]], root = [[0,0,0],[1,0,0]];
  const small = tree([root, trunk]);
  const large = tree([[[0,0,0],[0,1,0],[.1,2,0]], [[0,0,0],[1,0,0],[2,0,.1]]]);
  const morph = prepareGrowth(large, small);
  morph.update(0);
  const current = large.children[0].geometry.getAttribute('position');
  assert.equal(current.getY(5), 1, 'trunk must not collapse or match a root');
  assert.equal(current.getX(17 + 5), Math.fround(1.02), 'root direction must be retained');
  morph.finish();
});


test('a curved juvenile first segment matches its mature trunk without collapsing', () => {
  const small = tree([[[0,0,0],[.04,.1,0]]]);
  const large = tree([[[0,0,0],[0,1,0],[.2,2,0]]]);
  const morph = prepareGrowth(large, small);
  morph.update(0);
  assert.deepEqual(large.children[0].geometry.getAttribute('position').array.slice(0,30),
    small.children[0].geometry.getAttribute('position').array.slice(0,30));
  morph.finish();
});


test('playback interpolation keeps constant progress between generation boundaries', () => {
  const large = tree([[[0,0,0],[0,4,0]]]);
  const morph = prepareGrowth(large, tree([]));
  for (const t of [.1,.25,.5,.75,.9]) {
    morph.update(t, false);
    assert.ok(Math.abs(large.children[0].geometry.getAttribute('position').getY(5) - 4*t) < 1e-6);
  }
  morph.finish();
});

test('established organs whose positions shift due to branch thickening maintain non-zero continuity without zeroing out', () => {
  const small = tree([[[0, 0, 0], [0, 1, 0]]]);
  const smallLeaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial(), 2);
  smallLeaves.name = 'Leaves';
  smallLeaves.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0.1, 0.5, 0));
  smallLeaves.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0.1, 0.9, 0));
  small.add(smallLeaves);

  const large = tree([[[0, 0, 0], [0, 1.2, 0]]]);
  const largeLeaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial(), 3);
  largeLeaves.name = 'Leaves';
  largeLeaves.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0.13, 0.51, 0));
  largeLeaves.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0.12, 1.0, 0));
  largeLeaves.setMatrixAt(2, new THREE.Matrix4().makeTranslation(0.1, 1.2, 0));
  large.add(largeLeaves);

  const morph = prepareGrowth(large, small);
  morph.update(0);
  const arr = largeLeaves.instanceMatrix.array;
  assert.ok(arr[0] > 0.5, 'first leaf scale must be preserved');
  assert.ok(arr[16 + 0] > 0.5, 'second leaf scale must be preserved');
  assert.equal(arr[32 + 0], 0, 'new leaf starts at scale 0');
  morph.finish();
});
