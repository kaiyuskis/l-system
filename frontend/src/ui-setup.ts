import { Pane } from 'tweakpane';
import * as THREE from "three";
import { scene, renderer, directionalLight, windUniforms } from './three-setup.ts';

const generationsMax = 15;

export function setupTreeUI(
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
        lastGenInt = currentInt;
        onRegenerate();
      }
    }
    p1.addBinding(params, "generations", { label: "世代", min: 0, max: generationsMax, step: 1 }).on("change", (ev) => {
      if (!ev.last) return;
      handleGenChange();
    });
    p1.addBinding(params, "angle", { label: "角度", min: 0, max: 180, step: 0.1 }).on("change", onFinish);
    p1.addBinding(params, "angleVariance", { label: "角度の偏差", min: 0, max: 45, step: 0.1 }).on("change", onFinish);
    p1.addBinding(params, 'seed', { label: 'シード値', min: 0, max: 100000, step: 1 }).on('change', onFinish);
    p1.addButton({ title: 'ランダムシード' }).on('click', () => {
      params.seed = Math.floor(Math.random() * 100000);
      onRegenerate();
    });
    p1.addBinding(params, "gravity", { label: "重力", min: -10, max: 10, step: 0.1 }).on("change", onFinish);
    p1.addBinding(params, "branchColor", { label: "枝の色" }).on("change", onUpdateColor);
    
    p1.addBlade({ view: "separator" });
    p1.addBinding(params, "scale", { label: '長さ減衰率(")', min: 0.0, max: 2.0, step: 0.01 }).on( "change", onFinish);
    p1.addBinding(params, 'widthDecay', { label: '太さ減衰率(!)', min: 0.5, max: 1.0, step: 0.01 }).on('change', onFinish);
    
    // タブ2: ルール
    const p3 = tab.pages[1];
    p3.addBinding(params, "generations", { label: "世代", min: 0, max: generationsMax, step: 1 }).on("change", (ev) => {
      if (!ev.last) return;
      handleGenChange();
    });

    p3.addBlade({ view: "separator" });
    p3.addBinding(params, "premise", { label: "初期状態" }).on("change", onFinish);
    params.rules.forEach((r: any, i: number) => {
      p3.addBinding(r, "expression", {label: `ルール${i + 1}`});
    });

    p3.addBlade({ view: "separator" });
    p3.addButton({ title: "生成" }).on("click", onRegenerate);

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
        { title: "光/霧" },
        { title: "デバッグ" },
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

    const debugTab = envTab.pages[2];
    debugTab.addBinding(params, 'debugBranches', { label: '枝のデバッグ表示' }).on('change', onRegenerate);
    debugTab.addBinding(params, 'debugLeaves', { label: '葉のデバッグ表示' }).on('change', onRegenerate);

    // モデル保存フォルダ
    const btnFolder = pane.addFolder({ title: 'モデルの保存', expanded: false });
    btnFolder.addButton({ title: 'モデルの保存 (.glb)' }).on('click', downloadGLTF);   

    return pane;
}

export function setupLeafUI(
  params: any,
  uiState: any,
  refreshLeafGroupList: () => void,
  saveLeafGroupBrowser: () => void,
  deleteLeafGroupBrowser: () => void,
  onLeafGroupSelected: () => void,
  applyLeafGroupDraft: () => void,
) {
    const pane = new Pane({ title: "Leaf Generator" });

    const leafFolder = pane.addFolder({ title: '葉ジェネレータ', expanded: true });
    const leafTab = leafFolder.addTab({
      pages: [
        { title: "基本設定" },
        { title: "ルール" },
        { title: "輪郭" },
        { title: "保存/選択" },
      ]
    });

    const leafDraft = uiState.leafGroupDraft;
    const leafOnFinish = (ev: any) => {
      if (ev?.last) applyLeafGroupDraft();
    };

    const lf1 = leafTab.pages[0];
    lf1.addBinding(leafDraft, "generations", { label: "世代", min: 0, max: generationsMax, step: 1 }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "angle", { label: "角度", min: 0, max: 180, step: 0.1 }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "angleVariance", { label: "角度の偏差", min: 0, max: 45, step: 0.1 }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "initLength", { label: "初期の長さ", min: 0.05, max: 2, step: 0.01 }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "initThickness", { label: "初期の太さ", min: 0.01, max: 1, step: 0.01 }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "scale", { label: '長さ減衰率(")', min: 0.0, max: 2.0, step: 0.01 }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, 'widthDecay', { label: '太さ減衰率(!)', min: 0.5, max: 1.0, step: 0.01 }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "leafColor", { label: "葉色" }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "leafSize", { label: "葉サイズ", min: 0, max: 5 }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "flowerColor", { label: "花色" }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "flowerSize", { label: "花サイズ", min: 0, max: 5 }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "budColor", { label: "芽色" }).on("change", leafOnFinish);
    lf1.addBinding(leafDraft, "budSize", { label: "芽サイズ", min: 0, max: 5 }).on("change", leafOnFinish);
    lf1.addButton({ title: "葉グループを適用" }).on("click", applyLeafGroupDraft);

    const lf2 = leafTab.pages[1];
    lf2.addBinding(leafDraft, "premise", { label: "初期状態" }).on("change", leafOnFinish);
    leafDraft.rules.forEach((r: any, i: number) => {
      lf2.addBinding(r, "expression", { label: `ルール${i + 1}` }).on("change", leafOnFinish);
    });
    lf2.addBlade({ view: "separator" });
    lf2.addButton({ title: "葉グループを適用" }).on("click", applyLeafGroupDraft);

    const lf3 = leafTab.pages[2];
    lf3.addBinding(leafDraft, "outlineEnabled", { label: "輪郭を有効" }).on("change", leafOnFinish);
    lf3.addBinding(leafDraft, "outlineMirror", { label: "左右ミラー" }).on("change", leafOnFinish);
    lf3.addBinding(leafDraft, "leafBend", { label: "3D反り(Bend)", min: 0, max: 2, step: 0.01 }).on("change", leafOnFinish);
    lf3.addBinding(leafDraft, "outlineGenerations", { label: "輪郭世代", min: 0, max: 6, step: 1 }).on("change", leafOnFinish);
    lf3.addBinding(leafDraft, "outlineAngle", { label: "輪郭角度", min: 0, max: 180, step: 0.1 }).on("change", leafOnFinish);
    lf3.addBinding(leafDraft, "outlineStep", { label: "輪郭ステップ", min: 0.05, max: 1, step: 0.01 }).on("change", leafOnFinish);
    lf3.addBinding(leafDraft, "outlinePremise", { label: "輪郭初期" }).on("change", leafOnFinish);
    leafDraft.outlineRules.forEach((r: any, i: number) => {
      lf3.addBinding(r, "expression", { label: `輪郭ルール${i + 1}` }).on("change", leafOnFinish);
    });
    lf3.addBlade({ view: "separator" });
    lf3.addButton({ title: "輪郭を適用" }).on("click", applyLeafGroupDraft);

    const flowerOutline = lf3.addFolder({ title: "花の輪郭", expanded: false });
    flowerOutline.addBinding(leafDraft, "flowerOutlineEnabled", { label: "輪郭を有効" }).on("change", leafOnFinish);
    flowerOutline.addBinding(leafDraft, "flowerOutlineMirror", { label: "左右ミラー" }).on("change", leafOnFinish);
    flowerOutline.addBinding(leafDraft, "flowerOutlineGenerations", { label: "輪郭世代", min: 0, max: 6, step: 1 }).on("change", leafOnFinish);
    flowerOutline.addBinding(leafDraft, "flowerOutlineAngle", { label: "輪郭角度", min: 0, max: 180, step: 0.1 }).on("change", leafOnFinish);
    flowerOutline.addBinding(leafDraft, "flowerOutlineStep", { label: "輪郭ステップ", min: 0.05, max: 1, step: 0.01 }).on("change", leafOnFinish);
    flowerOutline.addBinding(leafDraft, "flowerOutlinePremise", { label: "輪郭初期" }).on("change", leafOnFinish);
    (leafDraft.flowerOutlineRules ?? []).forEach((r: any, i: number) => {
      flowerOutline.addBinding(r, "expression", { label: `輪郭ルール${i + 1}` }).on("change", leafOnFinish);
    });
    flowerOutline.addBlade({ view: "separator" });
    flowerOutline.addButton({ title: "輪郭を適用" }).on("click", applyLeafGroupDraft);

    const budOutline = lf3.addFolder({ title: "芽の輪郭", expanded: false });
    budOutline.addBinding(leafDraft, "budOutlineEnabled", { label: "輪郭を有効" }).on("change", leafOnFinish);
    budOutline.addBinding(leafDraft, "budOutlineMirror", { label: "左右ミラー" }).on("change", leafOnFinish);
    budOutline.addBinding(leafDraft, "budOutlineGenerations", { label: "輪郭世代", min: 0, max: 6, step: 1 }).on("change", leafOnFinish);
    budOutline.addBinding(leafDraft, "budOutlineAngle", { label: "輪郭角度", min: 0, max: 180, step: 0.1 }).on("change", leafOnFinish);
    budOutline.addBinding(leafDraft, "budOutlineStep", { label: "輪郭ステップ", min: 0.05, max: 1, step: 0.01 }).on("change", leafOnFinish);
    budOutline.addBinding(leafDraft, "budOutlinePremise", { label: "輪郭初期" }).on("change", leafOnFinish);
    (leafDraft.budOutlineRules ?? []).forEach((r: any, i: number) => {
      budOutline.addBinding(r, "expression", { label: `輪郭ルール${i + 1}` }).on("change", leafOnFinish);
    });
    budOutline.addBlade({ view: "separator" });
    budOutline.addButton({ title: "輪郭を適用" }).on("click", applyLeafGroupDraft);

    const lf4 = leafTab.pages[3];
    lf4.addBinding(uiState, "leafGroupNameInput", { label: "保存名" });

    const selectLeafFolder = lf4.addFolder({ title: "選択", expanded: true });
    function makeLeafGroupOptions() {
      const opts: Record<string, string> = {};
      (uiState.leafGroupList || []).forEach((name: string) => (opts[name] = name));
      if (Object.keys(opts).length === 0) opts["(なし)"] = "";
      return opts;
    }
    let leafGroupSelectBinding: any = null;
    function rebuildLeafGroupSelect() {
      if (leafGroupSelectBinding) leafGroupSelectBinding.dispose();
      leafGroupSelectBinding = selectLeafFolder.addBinding(params, "leafGroupName", {
        label: "使用グループ",
        options: makeLeafGroupOptions(),
      });
      leafGroupSelectBinding.on("change", () => {
        onLeafGroupSelected();
      });
    }
    uiState.__rebuildLeafGroupSelect = rebuildLeafGroupSelect;
    rebuildLeafGroupSelect();

    const leafActionFolder = lf4.addFolder({ title: "操作", expanded: true });
    leafActionFolder.addButton({ title: "一覧更新" }).on("click", () => {
      refreshLeafGroupList();
    });
    leafActionFolder.addButton({ title: "保存" }).on("click", () => {
      saveLeafGroupBrowser();
    });
    leafActionFolder.addButton({ title: "削除" }).on("click", () => {
      deleteLeafGroupBrowser();
    });

    return pane;
}
