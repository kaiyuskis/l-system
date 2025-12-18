import * as THREE from "three";
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { generateLSystemString, createLSystemData, type BranchSegment, type OrganPoint } from "./l-system";
import { setSeed } from "./rng.js";
import { approxXZWidth, calcBBoxForGroup, calcDepthFromBrackets, countChar, formatMetricsLine, getRenderMetrics } from "./metrics";
import type { AppParams, PerfTimings, StructureMetrics } from "./types";
import type { MaterialSet } from "./materials";
import type { TextureSet } from "./textures";
import type { makeDebug } from "./debug";
import { attachDepthMaterials, updateColors as updateMaterialColors, updateLeafTexture as swapLeafTexture } from "./materials";

export type RegeneratorOptions = {
  params: AppParams;
  materials: MaterialSet;
  textures: TextureSet;
  treeGroup: THREE.Group;
  renderer: THREE.WebGLRenderer;
  windUniforms: any;
  debug: ReturnType<typeof makeDebug>;
  refreshPane: () => void;
};

function buildOrganicTreeGeometry(segments: BranchSegment[]): THREE.BufferGeometry {
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

    const posAttribute = geo.getAttribute('position');
    const vertexCount = posAttribute.count;
    const thicknessArray = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const y = posAttribute.getY(i);
      const t = Math.max(0, Math.min(1, (y + length / 2) / length));
      thicknessArray[i] = (1 - t) * seg.radiusBottom + t * seg.radiusTop;
    }

    geo.setAttribute('aThickness', new THREE.BufferAttribute(thicknessArray, 1));

    geo.translate(0, length / 2, 0);
    geo.rotateX(Math.PI / 2);
    geo.lookAt(new THREE.Vector3().subVectors(seg.end, seg.start));
    geo.translate(seg.start.x, seg.start.y, seg.start.z);

    geometries.push(geo);

    const jointGeo = new THREE.SphereGeometry(seg.radiusBottom, radialSegments, radialSegments);
    jointGeo.translate(seg.start.x, seg.start.y, seg.start.z);
    const jointCount = jointGeo.attributes.position.count;
    const jointThicknessArray = new Float32Array(jointCount).fill(seg.radiusBottom);
    jointGeo.setAttribute('aThickness', new THREE.BufferAttribute(jointThicknessArray, 1));

    geometries.push(jointGeo);
  }

  if (geometries.length === 0) return new THREE.BufferGeometry();
  const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries, false);
  geometries.forEach(geo => geo.dispose());

  return mergedGeo;
}

export function createRegenerator(options: RegeneratorOptions) {
  const { params, materials, textures, treeGroup, renderer, windUniforms, debug, refreshPane } = options;

  let branchMesh: THREE.Mesh | null = null;
  let flowerMesh: THREE.InstancedMesh | null = null;
  let leafMesh: THREE.InstancedMesh | null = null;
  let budMesh: THREE.InstancedMesh | null = null;
  let isRegenerating = false;

  const streamingStartGen = 7;
  const streamingStep = 2;

  const waitNextFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const disposeInstanced = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    mesh.geometry.dispose();
  };

  const resetMeshes = () => {
    if (branchMesh) branchMesh.geometry.dispose();
    disposeInstanced(flowerMesh);
    disposeInstanced(leafMesh);
    disposeInstanced(budMesh);

    treeGroup.clear();
    branchMesh = null;
    flowerMesh = null;
    leafMesh = null;
    budMesh = null;
  };

  const renderFromString = async (
    str: string,
    opts: { targetGen: number; rewriteMs?: number; logMetrics?: boolean; startTime: number }
  ) => {
    resetMeshes();

    const tInterp0 = performance.now();
    const data = createLSystemData(
      str,
      {
        initLen: params.initLength,
        initWid: params.initThickness,
        scale: params.scale,
        widthDecay: params.widthDecay,
        angle: params.angle,
        angleVariance: params.angleVariance,
        flowerSize: params.flowerSize,
        leafSize: params.leafSize,
        budSize: params.budSize,
        gravity: params.gravity,
      }
    );
    const tInterp1 = performance.now();

    const tMesh0 = performance.now();
    const mergedGeo = buildOrganicTreeGeometry(data.branches);

    if (mergedGeo) {
      materials.branch.color.set(params.branchColor);
      branchMesh = new THREE.Mesh(mergedGeo, materials.branch);
      branchMesh.castShadow = true;
      branchMesh.receiveShadow = true;
      attachDepthMaterials(branchMesh, materials.branch, windUniforms, false);
      treeGroup.add(branchMesh);
    }

    const createInstanced = (pts: OrganPoint[], mat: THREE.MeshStandardMaterial, col: string) => {
      if (pts.length === 0) return;

      mat.color.set(col);
      const mesh = new THREE.InstancedMesh(materials.plane, mat, pts.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const isLeaf = mat === materials.leaf;
      attachDepthMaterials(mesh, mat, windUniforms, isLeaf);

      const thicknessArray = new Float32Array(pts.length);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        dummy.position.copy(pts[i].position);
        dummy.quaternion.copy(pts[i].rotation);
        dummy.scale.setScalar(pts[i].scale);
        dummy.translateY(pts[i].scale * 0.5);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        thicknessArray[i] = p.thickness;
      }
      mesh.geometry.setAttribute('aThickness', new THREE.InstancedBufferAttribute(thicknessArray, 1));
      mesh.instanceMatrix.needsUpdate = true;
      treeGroup.add(mesh);
      return mesh;
    };

    leafMesh = createInstanced(data.leaves, materials.leaf, params.leafColor) || null;
    flowerMesh = createInstanced(data.flowers, materials.flower, params.flowerColor) || null;
    budMesh = createInstanced(data.buds, materials.bud, params.budColor) || null;
    const tMesh1 = performance.now();

    if (opts.logMetrics) {
      const depthInfo = calcDepthFromBrackets(str);
      const box = calcBBoxForGroup(treeGroup);
      const size = new THREE.Vector3();
      box.getSize(size);

      const struct: StructureMetrics = {
        generations: opts.targetGen,
        stringLength: str.length,

        branchSegments: data.branches.length,
        branchCountF: countChar(str, "F"),

        bracketPushes: depthInfo.pushes,
        maxBranchDepth: depthInfo.maxDepth,

        leaves: data.leaves.length,
        flowers: data.flowers.length,
        buds: data.buds.length,

        bboxHeight: size.y,
        bboxWidth: approxXZWidth(box),
        bboxDepth: size.z,
      };

      const perf: PerfTimings = {
        rewriteMs: opts.rewriteMs ?? 0,
        interpretMs: tInterp1 - tInterp0,
        meshMs: tMesh1 - tMesh0,
        totalMs: performance.now() - opts.startTime,
      };

      requestAnimationFrame(() => {
        const render = getRenderMetrics(renderer);
        const line = formatMetricsLine(struct, perf, render);

        console.log("[METRICS]", line);
        console.table({ ...struct, ...perf, ...render });

        refreshPane();
      });
    } else {
      refreshPane();
    }

    await waitNextFrame();

    return {
      data,
      interpretMs: tInterp1 - tInterp0,
      meshMs: tMesh1 - tMesh0,
    };
  };

  const regenerate = async () => {
    if (isRegenerating) return;
    isRegenerating = true;

    const tAll0 = performance.now();

    try {
      setSeed(params.seed);
      refreshPane();

      resetMeshes();

      if (params.growthMode) {
        const ratio = Math.min(params.generations / 10.0, 1.0);
        params.initLength = params.maxLength * ratio;
        params.initThickness = params.maxThickness * (ratio * ratio);
        refreshPane();
      }

      const rules: { [key: string]: string } = {};
      params.rules.forEach(r => {
        const parts = r.expression.split('=');
        if (parts.length >= 2)
          rules[parts[0].trim()] = parts.slice(1).join('=').trim();
      });

      const targetGenerations = Math.floor(params.generations);
      const streamingGens = new Set<number>();
      for (let g = streamingStartGen; g < targetGenerations; g += streamingStep) {
        streamingGens.add(g);
      }

      const tRewrite0 = performance.now();
      const str = await generateLSystemString(
        params.premise,
        rules,
        targetGenerations,
        async (gen, currentStr) => {
          params.resultInfo = `${currentStr.length.toLocaleString()} (gen ${gen}/${targetGenerations})`;
          params.resultText = currentStr.length > 1000 ? `${currentStr.substring(0, 1000)} ... (省略)` : currentStr;
          refreshPane();

          if (streamingGens.has(gen)) {
            await renderFromString(currentStr, { targetGen: targetGenerations, startTime: tAll0 });
          } else if (currentStr.length > 20000 && gen % 2 === 0) {
            await waitNextFrame();
          }
        }
      );
      const tRewrite1 = performance.now();

      params.resultInfo = `${str.length.toLocaleString()} (gen ${targetGenerations}/${targetGenerations})`;
      params.resultText = str.length > 1000 ? `${str.substring(0, 1000)} ... (省略)` : str;
      refreshPane();

      const { data } = await renderFromString(str, {
        targetGen: targetGenerations,
        rewriteMs: tRewrite1 - tRewrite0,
        logMetrics: true,
        startTime: tAll0,
      });

      debug.clear();
      if (params.debugBranches) debug.addBranchAxes(data.branches);
      if (params.debugLeaves) {
        debug.addLeafPoints(data.leaves, 0.12);
        debug.addLeafNormals(data.leaves, 0.8);
      }
    } catch (e) {
      console.error(e);
    } finally {
      isRegenerating = false;
    }
  };

  const updateColors = () => updateMaterialColors(materials, params);
  const updateLeafTexture = () => {
    if (swapLeafTexture(materials, params, textures)) {
      regenerate();
    }
  };

  return { regenerate, updateColors, updateLeafTexture };
}
