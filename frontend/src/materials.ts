import * as THREE from "three";
import type { AppParams } from "./types";
import type { TextureSet } from "./textures";
import { setupDepthMaterial, setupMaterial } from "./wind";

export type MaterialSet = {
  branch: THREE.MeshStandardMaterial;
  flower: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  bud: THREE.MeshStandardMaterial;
  plane: THREE.PlaneGeometry;
};

export function createMaterials(params: AppParams, windUniforms: any, textures: TextureSet): MaterialSet {
  const matBranch = new THREE.MeshStandardMaterial({
    map: textures.barkColor,
    normalMap: textures.barkNormal,
    normalScale: new THREE.Vector2(2, 2),
    roughnessMap: textures.barkRoughness,
    color: params.branchColor,
  });
  setupMaterial(matBranch, windUniforms, false);

  const plane = new THREE.PlaneGeometry(1, 1);

  const matFlower = new THREE.MeshStandardMaterial({
    map: textures.flowerTexture,
    color: params.flowerColor,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.5
  });
  setupMaterial(matFlower, windUniforms, true);

  const matLeaf = new THREE.MeshStandardMaterial({
    map: textures.leafTextures[params.leafTextureKey],
    color: params.leafColor,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.5
  });
  setupMaterial(matLeaf, windUniforms, true);

  const matBud = new THREE.MeshStandardMaterial({
    map: textures.budTexture,
    color: params.budColor,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.5
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

export function updateLeafTexture(materials: MaterialSet, params: AppParams, textures: TextureSet): boolean {
  const tex = textures.leafTextures[params.leafTextureKey];
  if (!tex) return false;

  materials.leaf.map = tex;
  materials.leaf.needsUpdate = true;
  return true;
}
