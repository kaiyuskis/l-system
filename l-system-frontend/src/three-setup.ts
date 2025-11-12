import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'stats.js';

// Statsを初期化
export const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// --- シーン ---
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

// --- カメラ ---
const frustumSize = 50;
const aspect = window.innerWidth / window.innerHeight;

export const camera = new THREE.OrthographicCamera(
  frustumSize * aspect / -2, // left
  frustumSize * aspect / 2,  // right
  frustumSize / 2,           // top
  frustumSize / -2,          // bottom
  -100,                       // near
  1000                       // far
);
camera.position.set(10, 15, 25);
camera.lookAt(0, 0, 0);

// --- レンダラー ---
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.appendChild(renderer.domElement);
}

// --- ライト ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(15, 25, 15);
directionalLight.target.position.set(0, 10, 0);
directionalLight.castShadow = true;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);
scene.add(directionalLight.target);

// --- コントロール ---
export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 10, 0);
controls.update();

// --- アニメーションループ ---
function animate() {
  stats.begin();

  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);

  stats.end();
}
animate(); // ループを開始

// --- リサイズ対応 ---
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = frustumSize * aspect / -2;
  camera.right = frustumSize * aspect / 2;
  camera.top = frustumSize / 2;
  camera.bottom = frustumSize / -2;

  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});