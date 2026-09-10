import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const viewport = document.querySelector<HTMLElement>("#viewport");
if (!viewport) throw new Error("3D ビューポートが見つかりません。");

export const scene = new THREE.Scene();
scene.background = new THREE.Color("#e5eaee");
const sceneFog = new THREE.Fog("#e5eaee", 75, 240);
scene.fog = sceneFog;

export const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 1000);
camera.position.set(18, 13, 25);

export const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute(
  "aria-label",
  "生成された植物の3Dプレビュー。ドラッグで回転、スクロールで拡大縮小できます。",
);
renderer.domElement.setAttribute("role", "img");
viewport.appendChild(renderer.domElement);
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(outputPass);
let antialias = true;
export function setAntialias(enabled: boolean): void {
  antialias = enabled;
  const samples = enabled ? Math.min(4, renderer.capabilities.maxSamples) : 0;
  for (const target of [composer.renderTarget1, composer.renderTarget2]) {
    if (target.samples !== samples) { target.dispose(); target.samples = samples; }
  }
}

const hemisphere = new THREE.HemisphereLight(0xf5f7ec, 0x899782, 2.5);
scene.add(hemisphere);
export const directionalLight = new THREE.DirectionalLight(0xfff5e5, 2.9);
directionalLight.position.set(14, 28, 18);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 150;
directionalLight.shadow.bias = -0.00015;
directionalLight.shadow.normalBias = 0.025;
directionalLight.shadow.radius = 3;
scene.add(directionalLight, directionalLight.target);
const fillLight = new THREE.DirectionalLight(0xe2eee7, 0.8);
fillLight.position.set(-15, 12, -10);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xe4edff, 0.35);
rimLight.position.set(3, 16, -18);
rimLight.visible = false;
scene.add(rimLight);
export type LightingQuality = "low" | "medium" | "high";
let lightingQuality: LightingQuality = "medium";
const qualitySettings = {
  low: { shadowSize: 1024, pixelRatio: 1, soft: false, fill: false, rim: false },
  medium: { shadowSize: 2048, pixelRatio: 1.5, soft: true, fill: true, rim: false },
  high: { shadowSize: 4096, pixelRatio: 2, soft: true, fill: true, rim: true },
};

export function setLightingQuality(quality: LightingQuality): void {
  lightingQuality = quality;
  const settings = qualitySettings[quality];
  directionalLight.shadow.map?.dispose();
  directionalLight.shadow.map = null;
  directionalLight.shadow.mapSize.set(settings.shadowSize, settings.shadowSize);
  renderer.shadowMap.type = settings.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.needsUpdate = true;
  fillLight.visible = settings.fill;
  rimLight.visible = settings.rim;
  // Changing the light count or shadow filter changes material shader variants.
  scene.traverse(object => {
    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => { material.needsUpdate = true; });
    }
  });
  resize();
}

const grid = new THREE.GridHelper(100, 50, 0x8c9eac, 0xaebdc8);
grid.position.y = -0.008;
const gridMaterial = grid.material as THREE.LineBasicMaterial;
gridMaterial.transparent = true;
gridMaterial.opacity = 0.24;
gridMaterial.depthWrite = false;
scene.add(grid);

const groundMaterial = new THREE.ShadowMaterial({
  color: 0x465c6c,
  opacity: 0.18,
});
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  groundMaterial,
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 7, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.rotateSpeed = 0.65;
controls.zoomSpeed = 0.8;
controls.autoRotateSpeed = 0.65;
controls.maxPolarAngle = Math.PI / 2 - 0.015;
controls.minDistance = 0.05;
controls.maxDistance = 300;
controls.update();

export const windUniforms = {
  time: { value: 0 },
  speed: { value: 1 },
  strength: { value: 0 },
  gust: { value: 0 },
  direction: { value: new THREE.Vector2(1, 0.5).normalize() },
};
let windPaused = false;

export function setEnvironmentVisible(visible: boolean): void {
  ground.visible = visible;
  renderer.shadowMap.enabled = visible;
  directionalLight.castShadow = visible;
  scene.fog = visible ? sceneFog : null;
}
export function setGridVisible(visible: boolean): void {
  grid.visible = visible;
}
export function setAutoRotate(enabled: boolean): void {
  controls.autoRotate = enabled;
}
export function setWindPaused(paused: boolean): void {
  windPaused = paused;
}

export function zoomCamera(factor: number): void {
  const offset = camera.position.clone().sub(controls.target);
  const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(offset.setLength(distance));
  controls.update();
}

export function setSceneTheme(theme: "light" | "dark"): void {
  const dark = theme === "dark";
  const background = dark ? "#202a34" : "#e5eaee";
  (scene.background as THREE.Color).set(background);
  sceneFog.color.set(background);
  gridMaterial.opacity = dark ? 0.17 : 0.24;
  groundMaterial.color.set(dark ? 0x040b07 : 0x465c6c);
  groundMaterial.opacity = dark ? 0.35 : 0.18;
}

/** Frame every corner, including wide models and portrait viewports. */
export function fitCamera(
  object: THREE.Object3D,
  view: "perspective" | "front" | "top" = "perspective",
): void {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty())
    box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 3, 1));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  if (
    ![center.x, center.y, center.z, size.x, size.y, size.z].every(
      Number.isFinite,
    )
  )
    return;
  const extent = Math.max(size.x, size.y, size.z, 0.5);
  const direction =
    view === "front"
      ? new THREE.Vector3(0, 0.035, 1)
      : view === "top"
        ? new THREE.Vector3(0, 1, 0.001)
        : new THREE.Vector3(0.72, 0.3, 1);
  direction.normalize();
  const right = new THREE.Vector3()
    .crossVectors(camera.up, direction)
    .normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanHorizontal = tanVertical * camera.aspect;
  let distance = 0;
  const corner = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z).sub(center);
        const depth = corner.dot(direction);
        distance = Math.max(
          distance,
          Math.abs(corner.dot(right)) / tanHorizontal + depth,
          Math.abs(corner.dot(up)) / tanVertical + depth,
        );
      }
    }
  }
  distance = Math.max(distance * 1.02, extent * 0.8);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(0.005, extent / 1000);
  camera.far = Math.max(300, extent * 50);
  camera.updateProjectionMatrix();
  controls.minDistance = extent * 0.08;
  controls.maxDistance = extent * 15;
  controls.update();

  fitEnvironment(object);
  sceneFog.near = Math.max(distance + extent * 2, 30);
  sceneFog.far = sceneFog.near + extent * 12;
}

/** Keep the receiving plane and shadow coverage in sync even during growth playback. */
export function fitEnvironment(object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z, .5);
  if (!Number.isFinite(extent)) return;
  const groundScale = Math.max(0.1, extent / 18);
  const shadowExtent = 100 * groundScale;
  const shadowCamera = directionalLight.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -shadowExtent;
  shadowCamera.right = shadowCamera.top = shadowExtent;
  shadowCamera.near = 0.05;
  shadowCamera.far = Math.max(extent * 7, shadowExtent * 4);
  directionalLight.position
    .copy(center)
    .add(new THREE.Vector3(1.4, 2.3, 1.6).multiplyScalar(extent));
  directionalLight.target.position.copy(center);
  shadowCamera.updateProjectionMatrix();
  directionalLight.shadow.normalBias = Math.max(0.002, extent * 0.001);
  grid.scale.setScalar(groundScale);
  ground.scale.setScalar(groundScale);

}

function resize(): void {
  const width = Math.max(1, viewport!.clientWidth);
  const height = Math.max(1, viewport!.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualitySettings[lightingQuality].pixelRatio));
  renderer.setSize(width, height, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(width, height);
}
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(viewport);
resize();

/** Render synchronously before capturing a PNG. */
export function renderFrame(): void {
  if (antialias) composer.render();
  else renderer.render(scene, camera);
}

let frameId = 0;
let lastFrame = performance.now();
function animate(now: number): void {
  frameId = requestAnimationFrame(animate);
  const delta = Math.min(Math.max((now - lastFrame) / 1000, 0), 0.05);
  lastFrame = now;
  if (!windPaused)
    windUniforms.time.value += delta * Math.max(0, windUniforms.speed.value);
  controls.update(delta);
  renderFrame();
}
frameId = requestAnimationFrame(animate);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    controls.dispose();
    grid.geometry.dispose();
    gridMaterial.dispose();
    ground.geometry.dispose();
    groundMaterial.dispose();
    directionalLight.shadow.map?.dispose();
    outputPass.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  });
}
