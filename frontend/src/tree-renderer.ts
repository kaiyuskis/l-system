import * as THREE from "three";
import type { BranchSegment, OrganPoint, createLSystemData } from "./l-system";
import { windUniforms } from "./three-setup";

export interface TreeAppearance {
  branchColor: string;
  leafColor: string;
  flowerColor: string;
  budColor: string;
  leafTextureKey: string;
  leafSize?: number;
}

const textureLoader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();
const textureLoads = new Map<string, Promise<void>>();

function texture(file: string, color = false, repeat = false): THREE.Texture {
  const cached = textures.get(file);
  if (cached) return cached;
  let markLoaded!: () => void;
  let markFailed!: (error: Error) => void;
  const loading = new Promise<void>((resolve, reject) => {
    markLoaded = resolve;
    markFailed = reject;
  });
  // Keep load failures available to the export action without an unhandled rejection.
  void loading.catch(() => undefined);
  textureLoads.set(file, loading);
  const result = textureLoader.load(
    `${import.meta.env.BASE_URL}textures/${file}`,
    markLoaded,
    undefined,
    () =>
      markFailed(
        new Error(
          `テクスチャ ${file} を読み込めませんでした。ページを再読み込みしてください。`,
        ),
      ),
  );
  if (color) result.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.repeat.set(2, 1);
  }
  result.anisotropy = 4;
  textures.set(file, result);
  return result;
}

/** Export actions can await the photographic maps before encoding model or image data. */
export async function waitForTextures(): Promise<void> {
  await Promise.all(textureLoads.values());
}

// Visible and shadow shaders share the same displacement. A zero wind direction
// remains finite even when both components are set to zero.
const windHeader = `
uniform float studioTime;
uniform float studioWindStrength;
uniform float studioGust;
uniform vec2 studioWindDirection;
attribute float aThickness;
vec3 studioWind(vec3 worldPosition) {
  vec2 direction = studioWindDirection / max(length(studioWindDirection), 0.0001);
  float sway = sin(studioTime * 1.5 + worldPosition.y * 0.12)
    + 0.35 * sin(studioTime * 2.7 + worldPosition.x * 0.13 + worldPosition.z * 0.17);
  float height = max(worldPosition.y, 0.0);
  float resistance = 1.0 + max(aThickness, 0.0) * 5.0;
  float amplitude = (studioWindStrength * 0.055 * sway + studioGust * 0.09)
    * smoothstep(0.0, 2.0, height) * min(height * 0.16, 2.5) / resistance;
  return vec3(direction.x, 0.0, direction.y) * amplitude;
}
`;

const windProject = `
vec4 studioObjectPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  studioObjectPosition = batchingMatrix * studioObjectPosition;
#endif
#ifdef USE_INSTANCING
  studioObjectPosition = instanceMatrix * studioObjectPosition;
#endif
vec4 studioWorldPosition = modelMatrix * studioObjectPosition;
vec3 studioOffset = studioWind(studioWorldPosition.xyz);
studioWorldPosition.xyz += studioOffset;
vec4 mvPosition = viewMatrix * studioWorldPosition;
gl_Position = projectionMatrix * mvPosition;
`;

const windWorldPosition = `
#if defined(USE_ENVMAP) || defined(DISTANCE) || defined(USE_SHADOWMAP) || defined(USE_TRANSMISSION) || NUM_SPOT_LIGHT_COORDS > 0
  vec4 worldPosition = studioWorldPosition;
#endif
`;

function addWind(material: THREE.Material, flutter: boolean): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.studioTime = windUniforms.time;
    shader.uniforms.studioWindStrength = windUniforms.strength;
    shader.uniforms.studioGust = windUniforms.gust;
    shader.uniforms.studioWindDirection = windUniforms.direction;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${windHeader}`)
      .replace("#include <project_vertex>", windProject)
      .replace("#include <worldpos_vertex>", windWorldPosition);
    if (flutter) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          float studioPhase = instanceMatrix[3].x + instanceMatrix[3].y * 0.4 + instanceMatrix[3].z;
          float studioFlutter = sin(studioTime * 5.0 + studioPhase)
            * (studioWindStrength + studioGust) * 0.025;
          transformed.z += studioFlutter * max(position.y, 0.0);
        #endif
      `,
      );
    }
  };
  material.customProgramCacheKey = () =>
    `lsystem-studio-wind-v1-${flutter ? "leaf" : "branch"}`;
}

function addShadows(
  mesh: THREE.Mesh,
  material: THREE.MeshStandardMaterial,
  flutter: boolean,
): void {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: material.map,
    alphaTest: material.alphaTest,
    side: material.side,
  });
  const distance = new THREE.MeshDistanceMaterial({
    map: material.map,
    alphaTest: material.alphaTest,
    side: material.side,
  });
  addWind(material, flutter);
  addWind(depth, flutter);
  addWind(distance, flutter);
  mesh.customDepthMaterial = depth;
  mesh.customDistanceMaterial = distance;
  mesh.frustumCulled = false;
}

/** Eight-sided tapered cylinders in one draw call, without a sphere per joint. */
function branchGeometry(segments: BranchSegment[]): THREE.BufferGeometry {
  const valid = segments.filter(
    (segment) => segment.start.distanceToSquared(segment.end) > 1e-12,
  );
  const template = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
  const sourcePosition = template.getAttribute("position");
  const sourceNormal = template.getAttribute("normal");
  const sourceUv = template.getAttribute("uv");
  const sourceIndex = template.getIndex()!;
  const verticesPerBranch = sourcePosition.count;
  const count = valid.length * verticesPerBranch;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const thicknesses = new Float32Array(count);
  const indices =
    count > 65535
      ? new Uint32Array(valid.length * sourceIndex.count)
      : new Uint16Array(valid.length * sourceIndex.count);
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  for (let branch = 0; branch < valid.length; branch++) {
    const segment = valid[branch];
    direction.subVectors(segment.end, segment.start);
    const length = direction.length();
    rotation.setFromUnitVectors(up, direction.divideScalar(length));
    const bottomRadius = Math.max(segment.radiusBottom, 0.00001);
    const topRadius = Math.max(segment.radiusTop, 0.00001);
    const slope = (bottomRadius - topRadius) / length;
    for (let vertex = 0; vertex < verticesPerBranch; vertex++) {
      const offset = branch * verticesPerBranch + vertex;
      const progress = sourcePosition.getY(vertex) + 0.5;
      const radius = THREE.MathUtils.lerp(bottomRadius, topRadius, progress);
      position
        .set(
          sourcePosition.getX(vertex) * radius,
          progress * length,
          sourcePosition.getZ(vertex) * radius,
        )
        .applyQuaternion(rotation)
        .add(segment.start);
      positions.set([position.x, position.y, position.z], offset * 3);
      normal.fromBufferAttribute(sourceNormal, vertex);
      if (Math.abs(normal.y) < 0.5) normal.y = slope;
      normal.normalize().applyQuaternion(rotation);
      normals.set([normal.x, normal.y, normal.z], offset * 3);
      uvs.set(
        [sourceUv.getX(vertex), sourceUv.getY(vertex) * Math.max(length, 0.2)],
        offset * 2,
      );
      thicknesses[offset] = radius;
    }
    for (let index = 0; index < sourceIndex.count; index++) {
      indices[branch * sourceIndex.count + index] =
        sourceIndex.getX(index) + branch * verticesPerBranch;
    }
  }
  template.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute(
    "aThickness",
    new THREE.BufferAttribute(thicknesses, 1),
  );
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function organs(
  points: OrganPoint[],
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  flutter: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  mesh.name = name;
  const thicknesses = new Float32Array(points.length);
  const transform = new THREE.Object3D();
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    transform.position.copy(point.position);
    transform.quaternion.copy(point.rotation);
    transform.scale.setScalar(point.scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    thicknesses[index] = point.thickness;
  }
  // Each population owns its geometry so its instance attributes cannot collide.
  geometry.setAttribute(
    "aThickness",
    new THREE.InstancedBufferAttribute(thicknesses, 1),
  );
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  addShadows(mesh, material, flutter);
  return mesh;
}

export function buildTree(
  data: ReturnType<typeof createLSystemData>,
  appearance: TreeAppearance,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "L-System Plant";
  try {
    if (data.branches.length) {
      const material = new THREE.MeshStandardMaterial({
        color: appearance.branchColor,
        map: texture("bark-color.jpg", true, true),
        normalMap: texture("bark-normal.png", false, true),
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughnessMap: texture("bark-roughness.jpg", false, true),
        roughness: 1,
      });
      const mesh = new THREE.Mesh(branchGeometry(data.branches), material);
      mesh.name = "Branches";
      addShadows(mesh, material, false);
      group.add(mesh);
    }
    if (data.leaves.length) {
      const maple = appearance.leafTextureKey === "leaf_maple";
      const geometry = new THREE.PlaneGeometry(1, 1);
      if (!maple) geometry.rotateZ(Math.PI / 4).translate(0, 0.66, 0);
      else geometry.translate(0, 0.48, 0);
      const material = new THREE.MeshStandardMaterial({
        color: appearance.leafColor,
        emissive: appearance.leafColor,
        emissiveIntensity: 0.16,
        map: texture(maple ? "leaf-maple.png" : "leaf-default.png", true),
        side: THREE.DoubleSide,
        alphaTest: 0.4,
        roughness: 0.92,
        metalness: 0,
        alphaToCoverage: true,
      });
      group.add(organs(data.leaves, "Leaves", geometry, material, true));
    }
    if (data.flowers.length) {
      const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.42, 0);
      const material = new THREE.MeshStandardMaterial({
        color: appearance.flowerColor,
        map: texture("cherry-blossom.png", true),
        side: THREE.DoubleSide,
        alphaTest: 0.4,
        roughness: 0.9,
        alphaToCoverage: true,
      });
      group.add(organs(data.flowers, "Flowers", geometry, material, true));
    }
    if (data.buds.length) {
      const geometry = new THREE.IcosahedronGeometry(0.5, 1)
        .scale(0.55, 1, 0.55)
        .translate(0, 0.42, 0);
      const material = new THREE.MeshStandardMaterial({
        color: appearance.budColor,
        roughness: 0.85,
      });
      group.add(organs(data.buds, "Buds", geometry, material, false));
    }
    group.updateMatrixWorld(true);
    return group;
  } catch (error) {
    disposeTree(group);
    throw error;
  }
}

/** Release per-tree GPU resources, keeping texture assets cached for regeneration. */
export function disposeTree(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      materials.add(material);
    if (object.customDepthMaterial) materials.add(object.customDepthMaterial);
    if (object.customDistanceMaterial)
      materials.add(object.customDistanceMaterial);
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  group.removeFromParent();
  group.clear();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const cached of textures.values()) cached.dispose();
    textures.clear();
    textureLoads.clear();
  });
}
