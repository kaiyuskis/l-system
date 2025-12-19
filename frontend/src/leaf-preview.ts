import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { OrganPoint, BranchSegment } from "./l-system";
import type { MaterialSet } from "./materials";
import { attachDepthMaterials } from "./materials";
import { setupMaterial } from "./wind";

function buildBranchGeometry(segments: BranchSegment[]): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  const radialSegments = 8;

  for (const seg of segments) {
    const length = seg.start.distanceTo(seg.end);

    const geo = new THREE.CylinderGeometry(
      seg.radiusTop,
      seg.radiusBottom,
      length,
      radialSegments,
      1,
      false,
    );

    const posAttribute = geo.getAttribute("position");
    const vertexCount = posAttribute.count;
    const thicknessArray = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const y = posAttribute.getY(i);
      const t = Math.max(0, Math.min(1, (y + length / 2) / length));
      thicknessArray[i] = (1 - t) * seg.radiusBottom + t * seg.radiusTop;
    }

    geo.setAttribute("aThickness", new THREE.BufferAttribute(thicknessArray, 1));

    geo.translate(0, length / 2, 0);
    geo.rotateX(Math.PI / 2);
    geo.lookAt(new THREE.Vector3().subVectors(seg.end, seg.start));
    geo.translate(seg.start.x, seg.start.y, seg.start.z);

    geometries.push(geo);

    const jointGeo = new THREE.SphereGeometry(seg.radiusBottom, radialSegments, radialSegments);
    jointGeo.translate(seg.start.x, seg.start.y, seg.start.z);
    const jointCount = jointGeo.attributes.position.count;
    const jointThicknessArray = new Float32Array(jointCount).fill(seg.radiusBottom);
    jointGeo.setAttribute("aThickness", new THREE.BufferAttribute(jointThicknessArray, 1));

    geometries.push(jointGeo);
  }

  if (geometries.length === 0) return new THREE.BufferGeometry();
  const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
  geometries.forEach(geo => geo.dispose());
  return merged;
}

function createInstancedPoints(
  points: OrganPoint[],
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  windUniforms: any,
  isLeaf: boolean
): THREE.InstancedMesh | null {
  if (!points.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  attachDepthMaterials(mesh, material, windUniforms, isLeaf);

  const thicknessArray = new Float32Array(points.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    dummy.position.copy(p.position);
    dummy.quaternion.copy(p.rotation);
    dummy.scale.setScalar(p.scale);
    dummy.translateY(p.scale * 0.5);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    thicknessArray[i] = p.thickness;
  }
  mesh.geometry.setAttribute("aThickness", new THREE.InstancedBufferAttribute(thicknessArray, 1));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function buildLeafPreviewMeshes(
  leaves: OrganPoint[],
  buds: OrganPoint[],
  branches: BranchSegment[],
  leafGeometry: THREE.BufferGeometry | null,
  materials: MaterialSet,
  windUniforms: any,
  leafColor: string,
  budColor: string,
  branchColor: string
): {
  branchMesh: THREE.Mesh | null;
  leafMesh: THREE.InstancedMesh | null;
  budMesh: THREE.InstancedMesh | null;
  dispose: () => void;
} {
  const planeGeo = leafGeometry ?? new THREE.PlaneGeometry(1, 1);
  const budGeo = new THREE.SphereGeometry(0.5, 10, 10);

  const leafMat = new THREE.MeshStandardMaterial({
    color: leafColor,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.2,
  });
  setupMaterial(leafMat, windUniforms, true);

  const budMat = new THREE.MeshStandardMaterial({
    color: budColor,
  });
  setupMaterial(budMat, windUniforms, false);

  const branchGeo = buildBranchGeometry(branches);
  const branchMat = new THREE.MeshStandardMaterial({
    color: branchColor,
  });
  setupMaterial(branchMat, windUniforms, false);

  const branchMesh = branchGeo.attributes.position?.count
    ? new THREE.Mesh(branchGeo, branchMat)
    : null;
  if (branchMesh) {
    branchMesh.castShadow = true;
    branchMesh.receiveShadow = true;
    attachDepthMaterials(branchMesh, branchMat, windUniforms, false);
  }

  const leafMesh = createInstancedPoints(leaves, planeGeo, leafMat, windUniforms, true);
  const budMesh = createInstancedPoints(buds, budGeo, budMat, windUniforms, false);

  const dispose = () => {
    planeGeo.dispose();
    budGeo.dispose();
    branchGeo.dispose();
    leafMat.dispose();
    budMat.dispose();
    branchMat.dispose();
  };

  return { branchMesh, leafMesh, budMesh, dispose };
}
