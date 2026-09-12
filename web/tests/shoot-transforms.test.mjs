import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { shortShootMatrices } from '../src/shoot-transforms.ts';

test('thinning pine short shoots leaves the needles full-sized and attached', () => {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(3, 4, 5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), .7), new THREE.Vector3(1.4,1.4,1.4));
  const population = { count:1, matrices:new Float32Array(matrix.elements), thickness:new Float32Array([.002]) };
  const original = population.matrices.slice();
  const stems = shortShootMatrices(population);
  assert.deepEqual(population.matrices, original, 'needle transform was mutated');
  assert.notEqual(stems.buffer, population.matrices.buffer);
  const point = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  new THREE.Matrix4().fromArray(stems).decompose(point,rotation,scale);
  assert.ok(point.distanceTo(new THREE.Vector3(3,4,5)) < 1e-6, 'detached base');
  assert.ok(Math.abs(scale.y-1.4) < 1e-6, 'stem length changed');
  assert.ok(scale.x < .21 && scale.z < .21, 'twig should be thinner than the parent');
});
