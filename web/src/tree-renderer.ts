import * as THREE from "three";
import type { NativeGeometry, Population } from "./geometry-client.ts";
import { windUniforms } from "./three-setup";
import { needleShoot } from "./pine-needles.ts";
import { broadleaf, cherryBlossom } from "./botanical-organs.ts";

export interface TreeAppearance {
  growthModel?: string;
  needleLength?: number;
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
    result.repeat.set(file.endsWith("-bark.png") ? 1 : 2, 1);
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

function addWind(
  material: THREE.Material,
  flutter: boolean,
  tapered = false,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.studioTime = windUniforms.time;
    shader.uniforms.studioWindStrength = windUniforms.strength;
    shader.uniforms.studioGust = windUniforms.gust;
    shader.uniforms.studioWindDirection = windUniforms.direction;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${windHeader}`)
      .replace("#include <project_vertex>", windProject)
      .replace("#include <worldpos_vertex>", windWorldPosition);
    if (tapered) {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec2 aBranchShape;",
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          transformed.xz *= mix(1.0, aBranchShape.x, position.y + 0.5);`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
          if (abs(objectNormal.y) < 0.5) objectNormal.y = 1.0 - aBranchShape.x;`,
        )
        .replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
          #ifdef USE_MAP
            vMapUv.y *= max(aBranchShape.y, 0.2);
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv.y *= max(aBranchShape.y, 0.2);
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv.y *= max(aBranchShape.y, 0.2);
          #endif`,
        )
        .replace(
          "max(aThickness, 0.0)",
          "max(aThickness * mix(1.0, aBranchShape.x, position.y + 0.5), 0.0)",
        );
    }
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
    `lsystem-studio-wind-v2-${flutter ? "leaf" : "branch"}-${tapered}`;
}

function addShadows(
  mesh: THREE.Mesh,
  material: THREE.MeshStandardMaterial,
  flutter: boolean,
  tapered = false,
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
  addWind(material, flutter, tapered);
  addWind(depth, flutter, tapered);
  addWind(distance, flutter, tapered);
  mesh.customDepthMaterial = depth;
  mesh.customDistanceMaterial = distance;
  mesh.frustumCulled = false;
}

/** Native buffers are uploaded directly: no per-vertex work on the UI thread. */
function branchGeometry(
  data: NativeGeometry["branchMesh"],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(data.position, 3),
  );
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uv, 2));
  geometry.setAttribute(
    "aThickness",
    new THREE.BufferAttribute(data.thickness, 1),
  );
  geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function organs(
  points: Population,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  flutter: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, points.count);
  mesh.name = name;
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(points.matrices, 16);
  // Each population owns its geometry so its instance attributes cannot collide.
  geometry.setAttribute(
    "aThickness",
    new THREE.InstancedBufferAttribute(points.thickness, 1),
  );
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  addShadows(mesh, material, flutter);
  return mesh;
}

export function buildTree(
  data: NativeGeometry,
  appearance: TreeAppearance,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "L-System Plant";
  try {
    if (data.meta.branches) {
      const pine = appearance.growthModel === "pine";
      const barkFile = ({pine:"pine-bark.png",birch:"birch-bark.png",maple:"maple-bark.png",sakura:"cherry-bark.png"} as Record<string,string>)[appearance.growthModel ?? ""];
      const fern = appearance.growthModel === "fern";
      const material = new THREE.MeshStandardMaterial({
        color: appearance.branchColor,
        map: fern ? null : texture(barkFile ?? "bark-color.jpg", true, true),
        normalMap: barkFile || fern ? null : texture("bark-normal.png", false, true),
        bumpMap: barkFile ? texture(barkFile, true, true) : null,
        bumpScale: pine ? 0.055 : 0.016,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughnessMap: barkFile || fern ? null : texture("bark-roughness.jpg", false, true),
        roughness: 1,
      });
      let mesh: THREE.Mesh;
      if (data.branchInstances.count) {
        const points = data.branchInstances;
        const geometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
        geometry.setAttribute(
          "aThickness",
          new THREE.InstancedBufferAttribute(points.thickness, 1),
        );
        geometry.setAttribute(
          "aBranchShape",
          new THREE.InstancedBufferAttribute(points.shape, 2),
        );
        const instances = new THREE.InstancedMesh(
          geometry,
          material,
          points.count,
        );
        instances.instanceMatrix = new THREE.InstancedBufferAttribute(
          points.matrices,
          16,
        );
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingBox();
        instances.computeBoundingSphere();
        mesh = instances;
      } else {
        mesh = new THREE.Mesh(branchGeometry(data.branchMesh), material);
        if (appearance.growthModel === "birch") {
          const colors=new Float32Array(data.branchMesh.thickness.length*3);
          const twig=new THREE.Color(.18,.12,.075),white=new THREE.Color(1,1,1),color=new THREE.Color();
          for(let i=0;i<data.branchMesh.thickness.length;i++) {
            color.copy(twig).lerp(white,THREE.MathUtils.smoothstep(data.branchMesh.thickness[i],.014,.055));
            colors.set([color.r,color.g,color.b],i*3);
          }
          mesh.geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));
          material.vertexColors=true;
        }
      }
      mesh.name = "Branches";
      addShadows(mesh, material, false, data.branchInstances.count > 0);
      group.add(mesh);
    }
    if (data.leaves.count) {
      const pine = appearance.leafTextureKey === "pine_needles";
      const maple = appearance.leafTextureKey === "leaf_maple";
      const leafKind = appearance.leafTextureKey === "leaf_birch" ? "birch" : appearance.leafTextureKey === "leaf_cherry" ? "cherry" : appearance.leafTextureKey === "fern_pinnule" ? "fern" : maple && appearance.growthModel === "maple" ? "maple" : null;
      const geometry = pine ? needleShoot(appearance.needleLength) : leafKind ? broadleaf(leafKind) : new THREE.PlaneGeometry(1, 1);
      if (!pine && !leafKind) {
        if (!maple) geometry.rotateZ(Math.PI / 4).translate(0, 0.66, 0);
        else geometry.translate(0, 0.48, 0);
      }
      const material = new THREE.MeshStandardMaterial({
        color: appearance.leafColor,
        emissive: appearance.leafColor,
        emissiveIntensity: pine ? 0.08 : 0.16,
        map: pine || leafKind ? null : texture(maple ? "leaf-maple.png" : "leaf-default.png", true),
        vertexColors: !!(pine || leafKind),
        side: THREE.DoubleSide,
        alphaTest: pine || leafKind ? 0 : 0.4,
        roughness: pine ? 0.65 : 0.92,
        metalness: 0,
        alphaToCoverage: true,
      });
      const foliage = organs(data.leaves, pine ? "Pine paired needles" : "Leaves", geometry, material, true);
      if (pine || leafKind) {
        const color = new THREE.Color();
        for (let i = 0; i < data.leaves.count; i++) {
          const variation = .82 + ((Math.imul(i + 7, 16807) >>> 0) % 101) / 300;
          color.setRGB(variation, variation, variation * .94);
          foliage.setColorAt(i, color);
        }
      }
      group.add(foliage);
    }
    if (data.flowers.count) {
      const blossom = appearance.growthModel === "sakura";
      const geometry = blossom ? cherryBlossom() : new THREE.PlaneGeometry(1, 1).translate(0, 0.42, 0);
      const material = new THREE.MeshStandardMaterial({
        color: appearance.flowerColor,
        map: blossom ? null : texture("cherry-blossom.png", true),
        vertexColors: blossom,
        side: THREE.DoubleSide,
        alphaTest: blossom ? 0 : 0.4,
        roughness: 0.9,
        alphaToCoverage: true,
      });
      group.add(organs(data.flowers, "Flowers", geometry, material, true));
    }
    if (data.buds.count) {
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
