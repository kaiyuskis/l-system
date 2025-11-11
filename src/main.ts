import './style.css';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { scene } from './three-setup.ts';
import { generateLSystemString, createLSystem3D } from './l-system.ts';

let ruleXController: import('lil-gui').Controller;
let currentPlant: THREE.Group | null = null;
let leafMesh: THREE.InstancedMesh | null = null;

const params = {
  premise: 'X(10, 0.2)',
  generations: 8,
  angle: 30.0,
  angleVariance: 10.0,
  turn: 137.5,
  turnVariance: 20.0,
  scale: 0.7,
  branchColor: '#8B4513',
  leafColor: '#228B22',
  leafSize: 0.5,
  ruleXDisplay: "", 
  ruleFDisplay: "No rule",
};

const vary = (base: number, variance: number) => {
  return base + (Math.random() * 2 - 1) * variance;
};

const hardcodedRules = {
  'X': (len: number, width: number, p: typeof params) => {
    const newLen = len * p.scale;
    const newWidth = width * p.scale;

    const angle1 = vary(p.angle, p.angleVariance);
    const turn1 = vary(p.turn, p.turnVariance);
    const angle2 = vary(p.angle, p.angleVariance);
    const turn2 = vary(p.turn, p.turnVariance);
    

    return `F(${len.toFixed(2)}, ${width.toFixed(2)})
[+(${angle1.toFixed(1)}) &(${turn1.toFixed(1)}) X(${newLen.toFixed(2)}, ${newWidth.toFixed(2)})L(${p.leafSize})]
[-(${angle2.toFixed(1)}) ^(${turn2.toFixed(1)}) X(${newLen.toFixed(2)}, ${newWidth.toFixed(2)})L(${p.leafSize})]`;
  },
};

function updateRuleDisplay() {
  params.ruleXDisplay = `F[+(${params.angle})&(${params.turn})X(len*${params.scale.toFixed(2)})L(${params.leafSize})]`;

  if (ruleXController) {
    ruleXController.updateDisplay();
  }
}

const textureLoader = new THREE.TextureLoader();
const leafTexture = textureLoader.load('leaf.png');
const leafPrototypeGeo = new THREE.PlaneGeometry(1, 1);
const leafPrototypeMat = new THREE.MeshStandardMaterial({
  map: leafTexture,
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  alphaTest: 0.5,
});

// 地面
const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = 0;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

function regenerateLSystem() {
  updateRuleDisplay();
  
  if (currentPlant) {
    scene.remove(currentPlant);
  }
  if (leafMesh) {
    scene.remove(leafMesh);
    leafMesh.dispose();
  }

  const rules = hardcodedRules;
  const leafMatrices: THREE.Matrix4[] = [];

  console.time('L-System Generation');
  const lSystemString = generateLSystemString(
    params.premise,
    rules,
    params.generations,
    params
  );
  console.timeEnd('L-System Generation');

  console.time('Branch Interpretation');
  currentPlant = createLSystem3D(
    lSystemString,
    params.angle,
    1.0,
    0.1,
    params.branchColor,
    leafMatrices
  );
  console.timeEnd('Branch Interpretation');
  scene.add(currentPlant);

  if (leafMatrices.length > 0) {
    console.time('Leaf Instancing');

    leafPrototypeMat.color.set(params.leafColor);

    leafMesh = new THREE.InstancedMesh(
      leafPrototypeGeo,
      leafPrototypeMat,
      leafMatrices.length
    );

    for (let i = 0; i < leafMatrices.length; i++) {
      leafMesh.setMatrixAt(i, leafMatrices[i]);
    }

    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;
    
    scene.add(leafMesh);
    console.timeEnd('Leaf Instancing');
  }
}

// GUI
const gui = new GUI();

const setupFolder = gui.addFolder('Setup');
setupFolder.add(params, 'premise').name('Premise').onFinishChange(regenerateLSystem);
setupFolder.add(params, 'generations', 0, 12, 0.1).name('Generations').onFinishChange(regenerateLSystem);
setupFolder.open();

const paramsFolder = gui.addFolder('Global Params (p.)');
paramsFolder.add(params, 'angle', 0, 90, 0.1).name('p.angle (Pitch)').onChange(updateRuleDisplay)  .onFinishChange(regenerateLSystem);
paramsFolder.add(params, 'angleVariance', 0, 45).name('p.angle (Variance)').onFinishChange(regenerateLSystem);
paramsFolder.add(params, 'turn', 0, 180, 0.1).name('p.turn (Twist)').onChange(updateRuleDisplay).onFinishChange(regenerateLSystem);
paramsFolder.add(params, 'turnVariance', 0, 90).name('p.turn (Variance)').onFinishChange(regenerateLSystem);
paramsFolder.add(params, 'scale', 0.5, 1.0, 0.01).name('p.scale').onChange(updateRuleDisplay).onFinishChange(regenerateLSystem);
paramsFolder.addColor(params, 'branchColor').name('Branch Color').onFinishChange(regenerateLSystem);
paramsFolder.addColor(params, 'leafColor').name('Leaf Color').onFinishChange(regenerateLSystem);
paramsFolder.add(params, 'leafSize', 0.1, 2.0, 0.01).name('Leaf Size').onChange(updateRuleDisplay).onFinishChange(regenerateLSystem);
paramsFolder.open();

const rulesFolder = gui.addFolder('Active Rules (Display Only)');
ruleXController = rulesFolder.add(params, 'ruleXDisplay').name('Rule: X').disable();

const textarea = document.createElement('textarea');
textarea.value = params.ruleXDisplay;
textarea.disabled = true;
textarea.style.height = '70px';
textarea.style.width = '100%';
textarea.style.resize = 'none';
textarea.style.fontFamily = 'monospace';

const inputElement = (ruleXController as any).$input as HTMLInputElement;
inputElement.parentNode?.replaceChild(textarea, inputElement);
(ruleXController as any).$input = textarea;

rulesFolder.add(params, 'ruleFDisplay').name('Rule: F').disable();
rulesFolder.open();

// gui.add({ generate: regenerateLSystem }, 'generate').name('Generate Plant');

updateRuleDisplay();
regenerateLSystem();