import { Pane } from 'tweakpane';
import * as THREE from "three";
import { scene, renderer, directionalLight, windUniforms } from './three-setup.ts';

const generationsMax = 12;

export function setupUI(
  params: any,
  onRegenerate: () => void,
  onUpdateColor: () => void,
  downloadGLTF: () => void,
  resetCamera: () => void,
  uiState: any,
  refreshPresetList: () => void,
  savePresetBrowser: () => void,
  loadPresetBrowser: () => void,
  deletePresetBrowser: () => void,
  triggerDoubleGust: () => void, 

) {
    const onFinish = (ev: any) => {
      if (ev.last) onRegenerate();
    };

    // メインパネル
    const pane = new Pane({ title: "L-System" });

    // メイン設定
    const foler = pane.addFolder({ title: "メイン設定", expanded: true });
    
    const tab = foler.addTab({
      pages: [
        { title: "基本設定" },
        { title: "器官設定" },
        { title: "ルール" },
      ]
    });

    // タブ1: 基本設定
    const p1 = tab.pages[0];
    p1.addBinding(params, 'growthMode', { label: '成長連動' }).on('change', onFinish);
    
    p1.addBlade({ view: "separator" });
    p1.addBinding(params, "maxLength", { label: "最大の長さ", min: 0.1, max: 2, step: 0.01 })
    .on("change", (ev) => {
      if (!params.growthMode) params.initLength = params.maxLength;
      onFinish(ev);
    });
    p1.addBinding(params, "initLength", { label: "現在の長さ", readonly: true })
    p1.addBinding(params, "maxThickness", { label: "最大の太さ", min: 0.01, max: 2, step: 0.01 })
    .on("change", (ev) => {
      if (!params.growthMode) params.initThickness = params.maxThickness;
      onFinish(ev);
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
    p1.addBinding(params, "angle", { label: "角度", min: 0, max: 180, step: 0.1 }).on("change", onFinish);
    p1.addBinding(params, "angleVariance", { label: "角度の偏差", min: 0, max: 45, step: 0.1 }).on("change", onFinish);
    p1.addBinding(params, 'seed', { label: 'シード値', min: 0, max: 100000, step: 1 }).on('change', onFinish);
    p1.addBinding(params, "gravity", { label: "重力", min: -10, max: 10, step: 0.1 }).on("change", onFinish);
    p1.addBinding(params, "branchColor", { label: "枝の色" }).on("change", onUpdateColor);
    
    p1.addBlade({ view: "separator" });
    p1.addBinding(params, "scale", { label: '長さ減衰率(")', min: 0.0, max: 2.0, step: 0.01 }).on( "change", onFinish);
    p1.addBinding(params, 'widthDecay', { label: '太さ減衰率(!)', min: 0.5, max: 1.0, step: 0.01 }).on('change', onFinish);
    
    // タブ2: 器官設定
    const p2 = tab.pages[1];
    p2.addBinding(params, 'flowerColor', { label: "花の色" }).on('change', onUpdateColor);
    p2.addBinding(params, 'flowerSize', { label: "花", min: 0, max: 5 }).on('change', onFinish);
    
    p2.addBlade({ view: 'separator' });
    p2.addBinding(params, 'leafColor', { label: "葉の色" }).on('change', onUpdateColor);
    p2.addBinding(params, 'leafSize', { label: "葉", min: 0, max: 5 }).on('change', onFinish);
    
    p2.addBlade({ view: 'separator'});
    p2.addBinding(params, 'budColor', { label: "つぼみの色" }).on('change', onUpdateColor);
    p2.addBinding(params, 'budSize', { label: "つぼみ", min: 0, max: 5 }).on('change', onFinish);
    
    // タブ3: ルール
    const p3 = tab.pages[2];
    p3.addBinding(params, "generations", { label: "世代", min: 0, max: generationsMax, step: 1 }).on("change", handleGenChange);

    p3.addBlade({ view: "separator" });
    p3.addBinding(params, "premise", { label: "初期状態" }).on("change", onFinish);
    params.rules.forEach((r: any, i: number) => {
      p3.addBinding(r, "expression", {label: `ルール${i + 1}`});
    });

    // プリセット保存フォルダ
    const presetFolder = pane.addFolder({ title: 'プリセット', expanded: false });

    presetFolder.addBinding(uiState, 'presetName', { label: '保存名' });

    const selectFolder = presetFolder.addFolder({ title: '選択', expanded: true });

    function makePresetOptions() {
      const opts: Record<string, string> = {};
      (uiState.presetList || []).forEach((name: string) => (opts[name] = name));
      if (Object.keys(opts).length === 0) opts["(なし)"] = "";
      return opts;
    }

    let presetSelectBinding: any = null;
    function rebuildPresetSelect() {
      if (presetSelectBinding) presetSelectBinding.dispose();
      presetSelectBinding = selectFolder.addBinding(uiState, 'presetSelected', {
        label: '選択',
        options: makePresetOptions(),
      });
    }

    // main.ts から呼べるように
    uiState.__rebuildPresetSelect = rebuildPresetSelect;

    rebuildPresetSelect();

    const actionFolder = presetFolder.addFolder({ title: '操作', expanded: true });

    actionFolder.addButton({ title: '一覧更新' }).on('click', () => {
      refreshPresetList();
    });

    actionFolder.addButton({ title: '保存' }).on('click', () => {
      savePresetBrowser();
    });

    actionFolder.addButton({ title: '読込' }).on('click', () => {
      loadPresetBrowser();
    });

    actionFolder.addButton({ title: '削除' }).on('click', () => {
      deletePresetBrowser();
    });

    // 生成結果表示フォルダ
    const generatedRules = pane.addFolder({ title: '生成されたルールの詳細', expanded: false });
    generatedRules.addBinding(params, 'resultInfo', { 
      label: '文字数', 
      readonly: true
    });
    generatedRules.addBinding(params, 'resultText', { 
      label: '文字列(1000文字まで)',
      multiline: true,
      rows: 8,
      readonly: true
    });

    // 環境設定フォルダ
    const envFolder = pane.addFolder({ title: '環境設定', expanded: false });

    envFolder.addButton({ title: 'カメラリセット' }).on('click', resetCamera);

    const envTab = envFolder.addTab({
      pages: [
        { title: "風" },
        { title: "ライティング/フォグ" },
      ]
    });

    const windTab = envTab.pages[0];
    windTab.addBinding(windUniforms.speed, 'value', { label: '風速', min: 0, max: 10, step: 0.01 });
    windTab.addBinding(windUniforms.strength, 'value', { label: '風の強さ', min: 0, max: 10, step: 0.01 });
    windTab.addBinding(windUniforms.direction.value, 'x', { label: '風向きX', min: -1, max: 1, step: 0.01 });
    windTab.addBinding(windUniforms.direction.value, 'y', { label: '風向きZ', min: -1, max: 1, step: 0.01 });
    windTab.addButton({ title: '突風を発生させる' }).on('click', () => {
      triggerDoubleGust();
    });

    const lightingTab = envTab.pages[1];
    lightingTab.addBinding(renderer, 'toneMappingExposure', { label: '露出 (Exposure)', min: 0, max: 2, step: 0.01 });
    lightingTab.addBinding(directionalLight, 'intensity', { label: '太陽光 (Sun)', min: 0, max: 5, step: 0.01 });

    lightingTab.addBlade({ view: 'separator'});
    lightingTab.addBinding(scene.fog as THREE.Fog, 'near', { label: 'フォグの開始距離', min: 0, max: 100, step: 1 });
    lightingTab.addBinding(scene.fog as THREE.Fog, 'far', { label: 'フォグの終了距離', min: 50, max: 500, step: 1 });

    // アクションフォルダ
    const btnFolder = pane.addFolder({ title: 'アクション', expanded: true });
    btnFolder.addButton({ title: "生成" }).on("click", onRegenerate);

    btnFolder.addBlade({ view: 'separator' });
    btnFolder.addButton({ title: 'ランダムシード' }).on('click', () => {
      params.seed = Math.floor(Math.random() * 100000);
      onRegenerate();
    });

    btnFolder.addBlade({ view: 'separator' });
    btnFolder.addButton({ title: 'モデルの保存 (.glb)' }).on('click', downloadGLTF);   

    

    return pane;
}