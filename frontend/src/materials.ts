import * as THREE from "three";
import type { AppParams } from "./types";
import { setupDepthMaterial, setupMaterial } from "./wind";

export type MaterialSet = {
  branch: THREE.MeshStandardMaterial;
  flower: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  bud: THREE.MeshStandardMaterial;
  plane: THREE.PlaneGeometry;
};

export function createMaterials(params: AppParams, windUniforms: any): MaterialSet {
  const matBranch = new THREE.MeshStandardMaterial({
    color: params.branchColor,
  });
  setupMaterial(matBranch, windUniforms, false);

  const plane = new THREE.PlaneGeometry(1, 1);

  const matFlower = new THREE.MeshStandardMaterial({
    color: params.flowerColor,
    side: THREE.DoubleSide,
  });
  setupMaterial(matFlower, windUniforms, true);

  const matLeaf = new THREE.MeshStandardMaterial({
    color: params.leafColor,
    side: THREE.DoubleSide,
  });
  setupMaterial(matLeaf, windUniforms, true);

  const matBud = new THREE.MeshStandardMaterial({
    color: params.budColor,
    side: THREE.DoubleSide,
  });
  setupMaterial(matBud, windUniforms, true);

  return { branch: matBranch, flower: matFlower, leaf: matLeaf, bud: matBud, plane };
}

export function attachDepthMaterials(
  mesh: THREE.Mesh | THREE.InstancedMesh,
  material: THREE.MeshStandardMaterial,
  windUniforms: any,
  isLeaf: boolean
) {
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    alphaTest: material.alphaTest,
    map: material.map,
  });
  setupDepthMaterial(depthMat, windUniforms, isLeaf);
  mesh.customDepthMaterial = depthMat;

  const distanceMat = new THREE.MeshDistanceMaterial({
    map: material.map,
    alphaTest: material.alphaTest
  });
  setupDepthMaterial(distanceMat, windUniforms, isLeaf);
  mesh.customDistanceMaterial = distanceMat;
}

export function updateColors(materials: MaterialSet, params: AppParams) {
  materials.branch.color.set(params.branchColor);
  materials.flower.color.set(params.flowerColor);
  materials.leaf.color.set(params.leafColor);
  materials.bud.color.set(params.budColor);
}
