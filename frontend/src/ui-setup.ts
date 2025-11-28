import { Pane } from 'tweakpane';
import * as THREE from "three";
import { scene, renderer, directionalLight } from './three-setup.ts';

const generationsMax = 12;

export function setupUI(
  params: any,
  onRegenerate: () => void,
  onUpdateColor: () => void,
  downloadGLTF: () => void,
  savePreset: () => void,
  loadPreset: () => void,
  resetCamera: () => void,

) {
    const pane = new Pane({ title: "L-System" });
    
    const tab = pane.addTab({
      pages: [
        { title: "基本設定" },
        { title: "器官設定" },
        { title: "ルール" },
      ]
    });
    
    const p1 = tab.pages[0];
    p1.addBinding(params, 'growthMode', { label: '成長連動' }).on('change', onRegenerate);
    
    p1.addBlade({ view: "separator" });
    p1.addBinding(params, "maxLength", { label: "最大の長さ", min: 0.1, max: 2, step: 0.01 }).on("change", () => {
      params.initLength = params.maxLength;
      onRegenerate();
    });
    p1.addBinding(params, "initLength", { label: "現在の長さ", readonly: true })
    p1.addBinding(params, "maxThickness", { label: "最大の太さ", min: 0.01, max: 2, step: 0.01 }).on("change", () => {
      params.initThickness = params.maxThickness;
      onRegenerate();
    });
    p1.addBinding(params, "initThickness", { label: "現在の太さ", readonly: true })
    
    p1.addBlade({ view: "separator" });
    let lastGenInt = Math.floor(params.generations);
    function handleGenChange() {
      const currentInt = Math.floor(params.generations);
      
      if (currentInt !== lastGenInt) {
        console.log(`世代変更: ${lastGenInt} -> ${currentInt}`);
        lastGenInt = currentInt;
        onRegenerate();
      }
    }
    p1.addBinding(params, "generations", { label: "世代", min: 0, max: generationsMax, step: 1 }).on("change", handleGenChange);
    p1.addBinding(params, "angle", { label: "角度", min: 0, max: 180, step: 0.1 }).on("change", onRegenerate);
    p1.addBinding(params, "angleVariance", { label: "角度の偏差", min: 0, max: 45, step: 0.1 }).on("change", onRegenerate);
    p1.addBinding(params, 'seed', { label: 'シード値', min: 0, max: 100000, step: 1 }).on('change', onRegenerate);
    p1.addBinding(params, "gravity", { label: "重力", min: -15, max: 15, step: 0.1 }).on("change", onRegenerate);
    p1.addBinding(params, "branchColor", { label: "枝の色" }).on("change", onUpdateColor);
    
    p1.addBlade({ view: "separator" });
    p1.addBinding(params, "scale", { label: '長さ減衰率(")', min: 0.0, max: 2.0, step: 0.01 }).on( "change", onRegenerate);
    p1.addBinding(params, 'widthDecay', { label: '太さ減衰率(!)', min: 0.5, max: 1.0, step: 0.01 }).on('change', onRegenerate);
    
    p1.addBlade({ view: "separator" });
    p1.addBinding(params, 'resultInfo', { 
      label: '文字数', 
      readonly: true
    });
    p1.addBinding(params, 'resultText', { 
      label: '文字列(1000文字まで)',
      multiline: true,
      rows: 8,
      readonly: true
    });
    
    const p2 = tab.pages[1];
    p2.addBinding(params, 'flowerColor').on('change', onUpdateColor);
    p2.addBinding(params, 'flowerSize', { label: "花", min: 0, max: 5 }).on('change', onRegenerate);
    
    p2.addBlade({ view: 'separator' });
    p2.addBinding(params, 'leafColor').on('change', onUpdateColor);
    p2.addBinding(params, 'leafSize', { label: "葉", min: 0, max: 5 }).on('change', onRegenerate);
    
    p2.addBlade({ view: 'separator'});
    p2.addBinding(params, 'budColor').on('change', onUpdateColor);
    p2.addBinding(params, 'budSize', { label: "つぼみ", min: 0, max: 5 }).on('change', onRegenerate);
    
    const p3 = tab.pages[2];
    p3.addBinding(params, "generations", { label: "世代", min: 0, max: generationsMax, step: 1 }).on("change", handleGenChange);

    p3.addBlade({ view: "separator" });
    p3.addBinding(params, "premise", { label: "初期状態" }).on("change", onRegenerate);
    params.rules.forEach((r: any, i: number) => {
      p3.addBinding(r, "expression", {label: `ルール${i + 1}`});
    });

    const envFolder = pane.addFolder({ title: '環境設定', expanded: false });

    envFolder.addButton({ title: 'カメラリセット' }).on('click', resetCamera);

    envFolder.addBlade({ view: 'separator'});
    envFolder.addBinding(renderer, 'toneMappingExposure', {
      label: '露出 (Exposure)',
      min: 0,
      max: 2,
      step: 0.01
    });
    envFolder.addBinding(directionalLight, 'intensity', {
      label: '太陽光 (Sun)',
      min: 0,
      max: 5,
      step: 0.1
    });

    envFolder.addBlade({ view: 'separator'});
    envFolder.addBinding(scene.fog as THREE.Fog, 'near', {
      label: 'フォグの開始距離',
      min: 0,
      max: 100,
    });
    envFolder.addBinding(scene.fog as THREE.Fog, 'far', {
      label: 'フォグの終了距離',
      min: 50,
      max: 500,
    });
    
    const btnFolder = pane.addFolder({ title: 'アクション' });
    btnFolder.addButton({ title: "生成" }).on("click", onRegenerate);

    btnFolder.addBlade({ view: 'separator' });
    btnFolder.addButton({ title: 'ランダムシード' }).on('click', () => {
      params.seed = Math.floor(Math.random() * 100000);
      pane.refresh();
      onRegenerate();
    });

    btnFolder.addBlade({ view: 'separator' });
    btnFolder.addButton({ title: '保存 (.glb)' }).on('click', downloadGLTF);   
    
    btnFolder.addBlade({ view: 'separator' });
    btnFolder.addButton({ title: 'プリセット保存' }).on('click', savePreset);
    btnFolder.addButton({ title: 'プリセット読み込み' }).on('click', loadPreset);

    return pane;
}