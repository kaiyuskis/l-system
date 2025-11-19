import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import Stats from "stats.js";

// Statsの初期化
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// シーン、カメラ
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

const frustumSize = 20;
const aspect = window.innerWidth / window.innerHeight;
export const camera = new THREE.OrthographicCamera(
  (frustumSize * aspect) / -2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  frustumSize / -2,
  -100,
  1000
);
camera.position.set(10, 15, 25);
camera.lookAt(0, 0, 0);

// レンダラー
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  app.appendChild(renderer.domElement);
}

// ライト
const ambientLight = new THREE.AmbientLight(0xa0a0a0);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(15, 25, 15);
directionalLight.target.position.set(0, 0, 0);
directionalLight.castShadow = true;
directionalLight.shadow.camera.top = 100;
directionalLight.shadow.camera.bottom = -100;
directionalLight.shadow.camera.left = -100;
directionalLight.shadow.camera.right = 100;
directionalLight.shadow.mapSize.width = 4096;
directionalLight.shadow.mapSize.height = 4096;
scene.add(directionalLight);
scene.add(directionalLight.target);

// 地面
const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// コントロール
export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

// GLTFローダー
export const loader = new GLTFLoader();

// アニメーションループ
function animate() {
  stats.begin();
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  stats.end();
}
animate();

// リサイズ処理
window.addEventListener("resize", () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (frustumSize * aspect) / -2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = frustumSize / -2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
