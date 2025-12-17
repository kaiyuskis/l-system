import * as THREE from "three";
import { scene, camera, controls, windUniforms, renderer } from "./three-setup.ts";
import { setupUI } from './ui-setup.ts';
import { toast } from "./toast";
import { makeDebug } from "./debug.ts";
import { triggerDoubleGust } from "./wind";
import { createDefaultParams, createInitialUIState } from "./params";
import { createRegenerator } from "./regenerator";
import { loadTextures } from "./textures";
import { createMaterials } from "./materials";
import { downloadGLTF } from "./exporter";
import { deletePresetFromLocal, listPresetNames, loadPresetFromLocal, savePresetToLocal } from "./presets";

export function runApp() {
  const treeGroup = new THREE.Group();
  scene.add(treeGroup);

  const debug = makeDebug(scene);
  const params = createDefaultParams();
  const uiState = createInitialUIState();
  const textures = loadTextures();
  const materials = createMaterials(params, windUniforms, textures);

  let pane: any;
  const refreshPane = () => pane?.refresh?.();

  const { regenerate, updateColors, updateLeafTexture } = createRegenerator({
    params,
    materials,
    textures,
    treeGroup,
    renderer,
    windUniforms,
    debug,
    refreshPane,
  });

  const refreshPresetList = () => {
    uiState.presetList = listPresetNames();
    if (!uiState.presetSelected && uiState.presetList.length) {
      uiState.presetSelected = uiState.presetList[0];
    }
    uiState.__rebuildPresetSelect?.();
    refreshPane();
  };

  const savePresetBrowser = () => {
    const name = (uiState.presetName || "").trim();
    if (!name) {
      toast("保存名を入力してください。", "error");
      return;
    }
    savePresetToLocal(name, params);
    refreshPresetList();
    toast(`プリセット「${name}」を保存しました。`, "success");
  };

  const loadPresetBrowser = () => {
    const name = (uiState.presetSelected || "").trim();
    if (!name) {
      toast("読み込むプリセットを選択してください。", "error");
      return;
    }
    if (!loadPresetFromLocal(name, params)) {
      toast("プリセットが見つかりません。", "error");
      return;
    }
    updateColors();
    regenerate();
    refreshPane();
    toast(`プリセット「${name}」を読み込みました。`, "success");
  };

  const deletePresetBrowser = () => {
    const name = (uiState.presetSelected || "").trim();
    if (!name) return;

    deletePresetFromLocal(name);
    if (uiState.presetSelected === name) uiState.presetSelected = "";
    refreshPresetList();
  };

  const resetCamera = () => {
    camera.position.set(0, 10, 40);
    controls.target.set(0, 7, 0);
    controls.update();
  };

  pane = setupUI(
    params,
    regenerate,
    updateColors,
    updateLeafTexture,
    () => downloadGLTF(treeGroup),
    resetCamera,
    uiState,
    refreshPresetList,
    savePresetBrowser,
    loadPresetBrowser,
    deletePresetBrowser,
    () => triggerDoubleGust(windUniforms),
  );

  regenerate();
}
