import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "stats.js";

// Statsの初期化
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// シーン
export const scene = new THREE.Scene();
const fogColor = 0xdcebf5
scene.background = new THREE.Color(fogColor);
scene.fog = new THREE.Fog(fogColor, 20, 250);

// カメラ
export const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 10, 40);
camera.lookAt(0, 10, 0);

// レンダラー
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  app.appendChild(renderer.domElement);
}

// ライティング
const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x222222, 1.5); 
scene.add(hemiLight);

export const directionalLight = new THREE.DirectionalLight(0xffffff, 3.0);
directionalLight.position.set(10, 30, 20);
directionalLight.castShadow = true;

directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;

const d = 50;
directionalLight.shadow.camera.top = d;
directionalLight.shadow.camera.bottom = -d;
directionalLight.shadow.camera.left = -d;
directionalLight.shadow.camera.right = d;
directionalLight.shadow.bias = -0.0001;
directionalLight.shadow.radius = 4;
scene.add(directionalLight);

// 床
// グリッド
const gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0xdddddd);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

// 透明な床
const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// コントロール
export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 7, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.update();

// 風エフェクト用ユニフォーム
export const windUniforms = {
  time: { value: 0 },
  speed: { value: 1.0 },
  strength: { value: 0.0 },
  direction: { value: new THREE.Vector2(1.0, 0.5).normalize() },
};

// アニメーションループ
function animate() {
  stats.begin();
  requestAnimationFrame(animate);
  const delta = 0.01 * windUniforms.speed.value;
  windUniforms.time.value += delta;
  controls.update();
  renderer.render(scene, camera);
  stats.end();
}
animate();

// リサイズ処理
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
