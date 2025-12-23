import * as THREE from "three";
import { scene, camera, controls, windUniforms, renderer } from "./three-setup.ts";
import { setupLeafUI, setupTreeUI } from './ui-setup.ts';
import { toast } from "./toast";
import { makeDebug } from "./debug.ts";
import { triggerDoubleGust } from "./wind";
import { createDefaultParams, createInitialUIState } from "./params";
import { createRegenerator } from "./regenerator";
import { createMaterials } from "./materials";
import { downloadGLTF } from "./exporter";
import { deletePresetFromLocal, listPresetNames, loadPresetFromLocal, savePresetToLocal } from "./presets";
import { hideLoadingIndicator, showLoadingIndicator } from "./loading-indicator";
import { deleteLeafGroupFromLocal, ensureDefaultLeafGroups, listLeafGroupNames, loadLeafGroupFromLocal, saveLeafGroupToLocal } from "./leaf-groups";
import type { LeafGroupParams } from "./types";
import { buildLeafCluster } from "./leaf-cluster";
import { buildLeafPreviewMeshes } from "./leaf-preview";

export function runApp() {
  const treeGroup = new THREE.Group();
  scene.add(treeGroup);
  const leafPreviewGroup = new THREE.Group();
  leafPreviewGroup.visible = false;
  scene.add(leafPreviewGroup);

  const debug = makeDebug(scene);
  const params = createDefaultParams();
  const uiState = createInitialUIState();
  const materials = createMaterials(params, windUniforms);

  let treePane: any;
  let leafPane: any;
  const refreshPane = () => {
    treePane?.refresh?.();
    leafPane?.refresh?.();
  };

  let leafPreviewDisposer: (() => void) | null = null;
  let currentRoute = "tree";

  const applyLeafGroupToDraft = (draft: LeafGroupParams, data: LeafGroupParams) => {
    draft.generations = data.generations;
    draft.angle = data.angle;
    draft.angleVariance = data.angleVariance;
    draft.scale = data.scale;
    draft.widthDecay = data.widthDecay;
    draft.initLength = data.initLength;
    draft.initThickness = data.initThickness;
    draft.flowerColor = data.flowerColor ?? draft.flowerColor;
    draft.flowerSize = data.flowerSize ?? draft.flowerSize;
    draft.leafColor = data.leafColor ?? draft.leafColor;
    draft.leafSize = data.leafSize;
    draft.budColor = data.budColor ?? draft.budColor;
    draft.budSize = Number.isFinite(data.budSize) ? data.budSize : draft.budSize;
    draft.flowerOutlineEnabled = data.flowerOutlineEnabled ?? draft.flowerOutlineEnabled;
    draft.flowerOutlineMirror = data.flowerOutlineMirror ?? draft.flowerOutlineMirror;
    draft.flowerOutlineGenerations = data.flowerOutlineGenerations ?? draft.flowerOutlineGenerations;
    draft.flowerOutlineAngle = data.flowerOutlineAngle ?? draft.flowerOutlineAngle;
    draft.flowerOutlineStep = data.flowerOutlineStep ?? draft.flowerOutlineStep;
    draft.flowerOutlinePremise = data.flowerOutlinePremise ?? draft.flowerOutlinePremise;
    const flowerOutlineSlots = 6;
    if (!draft.flowerOutlineRules) draft.flowerOutlineRules = [];
    while (draft.flowerOutlineRules.length < flowerOutlineSlots) {
      draft.flowerOutlineRules.push({ expression: "" });
    }
    for (let i = 0; i < flowerOutlineSlots; i++) {
      draft.flowerOutlineRules[i].expression = data.flowerOutlineRules?.[i]?.expression ?? "";
    }
    draft.budOutlineEnabled = data.budOutlineEnabled ?? draft.budOutlineEnabled;
    draft.budOutlineMirror = data.budOutlineMirror ?? draft.budOutlineMirror;
    draft.budOutlineGenerations = data.budOutlineGenerations ?? draft.budOutlineGenerations;
    draft.budOutlineAngle = data.budOutlineAngle ?? draft.budOutlineAngle;
    draft.budOutlineStep = data.budOutlineStep ?? draft.budOutlineStep;
    draft.budOutlinePremise = data.budOutlinePremise ?? draft.budOutlinePremise;
    if (!draft.budOutlineRules) draft.budOutlineRules = [];
    const budOutlineSlots = 6;
    while (draft.budOutlineRules.length < budOutlineSlots) {
      draft.budOutlineRules.push({ expression: "" });
    }
    for (let i = 0; i < budOutlineSlots; i++) {
      draft.budOutlineRules[i].expression = data.budOutlineRules?.[i]?.expression ?? "";
    }
    draft.leafBend = data.leafBend ?? 0;
    draft.outlineEnabled = data.outlineEnabled ?? draft.outlineEnabled;
    draft.outlineMirror = data.outlineMirror ?? draft.outlineMirror;
    draft.outlineGenerations = data.outlineGenerations ?? draft.outlineGenerations;
    draft.outlineAngle = data.outlineAngle ?? draft.outlineAngle;
    draft.outlineStep = data.outlineStep ?? draft.outlineStep;
    draft.outlinePremise = data.outlinePremise ?? draft.outlinePremise;
    draft.premise = data.premise;

    const ruleSlots = 6;
    const rules = data.rules ?? [];
    while (draft.rules.length < ruleSlots) draft.rules.push({ expression: "" });
    for (let i = 0; i < ruleSlots; i++) {
      draft.rules[i].expression = rules[i]?.expression ?? "";
    }

    const outlineRules = data.outlineRules ?? [];
    const outlineSlots = 6;
    if (!draft.outlineRules) draft.outlineRules = [];
    while (draft.outlineRules.length < outlineSlots) draft.outlineRules.push({ expression: "" });
    for (let i = 0; i < outlineSlots; i++) {
      draft.outlineRules[i].expression = outlineRules[i]?.expression ?? "";
    }
  };

  const { regenerate, updateColors } = createRegenerator({
    params,
    materials,
    treeGroup,
    renderer,
    windUniforms,
    debug,
    refreshPane,
    getLeafGroup: () => {
      if (!params.leafGroupName) return null;
      return uiState.leafGroupDraft;
    },
    onRegenerateStart: (info) => {
      if (info.streaming) showLoadingIndicator("3Dモデルを生成中...");
    },
    onRegenerateEnd: (info) => {
      if (info.streaming) hideLoadingIndicator();
      if (info.ok) {
        toast(`${info.targetGenerations}世代で生成が完了しました。`, "success");
      }
    },
    onRegenerateError: (error) => {
      if (error instanceof RangeError) {
        toast("世代数が多すぎて生成できませんでした。世代数を下げてください。", "error");
        return;
      }
      toast("生成に失敗しました。世代数やルールを見直してください。", "error");
    },
  });

  const renderLeafPreview = () => {
    leafPreviewGroup.clear();
    const cluster = buildLeafCluster(uiState.leafGroupDraft);
    leafPreviewDisposer?.();
    leafPreviewDisposer = null;
    const preview = buildLeafPreviewMeshes(
      cluster.leaves,
      cluster.flowers,
      cluster.buds,
      cluster.branches,
      cluster.leafGeometry,
      cluster.flowerGeometry,
      cluster.budGeometry,
      materials,
      windUniforms,
      uiState.leafGroupDraft.leafColor,
      uiState.leafGroupDraft.flowerColor,
      uiState.leafGroupDraft.budColor,
      params.branchColor
    );
    if (preview.branchMesh) leafPreviewGroup.add(preview.branchMesh);
    if (preview.leafMesh) leafPreviewGroup.add(preview.leafMesh);
    if (preview.flowerMesh) leafPreviewGroup.add(preview.flowerMesh);
    if (preview.budMesh) leafPreviewGroup.add(preview.budMesh);
    leafPreviewDisposer = preview.dispose;
  };

  const applyLeafGroupDraft = () => {
    renderLeafPreview();
    if (currentRoute === "tree") regenerate();
  };

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

  const refreshLeafGroupList = () => {
    uiState.leafGroupList = listLeafGroupNames();
    if (!params.leafGroupName && uiState.leafGroupList.length) {
      params.leafGroupName = uiState.leafGroupList[0];
    }
    uiState.__rebuildLeafGroupSelect?.();
    refreshPane();
  };

  const loadLeafGroupIntoDraft = (name: string) => {
    const data = loadLeafGroupFromLocal(name);
    if (!data) return false;
    applyLeafGroupToDraft(uiState.leafGroupDraft, data);
    return true;
  };

  const onLeafGroupSelected = () => {
    const name = (params.leafGroupName || "").trim();
    if (!name) return;
    if (!loadLeafGroupIntoDraft(name)) {
      toast("葉グループが見つかりません。", "error");
      return;
    }
    uiState.leafGroupNameInput = name;
    applyLeafGroupDraft();
    refreshPane();
  };

  const saveLeafGroupBrowser = () => {
    const name = (uiState.leafGroupNameInput || "").trim();
    if (!name) {
      toast("葉グループの保存名を入力してください。", "error");
      return;
    }
    saveLeafGroupToLocal(name, uiState.leafGroupDraft);
    params.leafGroupName = name;
    refreshLeafGroupList();
    toast(`葉グループ「${name}」を保存しました。`, "success");
  };

  const deleteLeafGroupBrowser = () => {
    const name = (params.leafGroupName || "").trim();
    if (!name) return;
    deleteLeafGroupFromLocal(name);
    if (params.leafGroupName === name) params.leafGroupName = "";
    refreshLeafGroupList();
    if (params.leafGroupName) loadLeafGroupIntoDraft(params.leafGroupName);
    applyLeafGroupDraft();
  };

  treePane = setupTreeUI(
    params,
    regenerate,
    updateColors,
    () => downloadGLTF(treeGroup),
    resetCamera,
    uiState,
    refreshPresetList,
    savePresetBrowser,
    loadPresetBrowser,
    deletePresetBrowser,
    () => triggerDoubleGust(windUniforms),
  );

  leafPane = setupLeafUI(
    params,
    uiState,
    refreshLeafGroupList,
    saveLeafGroupBrowser,
    deleteLeafGroupBrowser,
    onLeafGroupSelected,
    applyLeafGroupDraft,
  );
  leafPane.element.style.display = "none";

  const nav = document.createElement("div");
  nav.className = "route-nav";
  const treeBtn = document.createElement("button");
  treeBtn.textContent = "木";
  const leafBtn = document.createElement("button");
  leafBtn.textContent = "器官";
  nav.append(treeBtn, leafBtn);
  document.body.appendChild(nav);

  const setRoute = (route: string) => {
    window.location.hash = `#/${route}`;
  };
  const getRoute = () => {
    const raw = window.location.hash.replace(/^#\/?/, "");
    return raw === "leaf" ? "leaf" : "tree";
  };
  const updateNav = () => {
    treeBtn.classList.toggle("is-active", currentRoute === "tree");
    leafBtn.classList.toggle("is-active", currentRoute === "leaf");
  };
  const applyRoute = (route: string) => {
    currentRoute = route;
    const isLeaf = route === "leaf";
    treeGroup.visible = !isLeaf;
    debug.group.visible = !isLeaf;
    leafPreviewGroup.visible = isLeaf;
    treePane.element.style.display = isLeaf ? "none" : "";
    leafPane.element.style.display = isLeaf ? "" : "none";
    updateNav();
    if (isLeaf) {
      renderLeafPreview();
    } else {
      regenerate();
    }
  };

  treeBtn.addEventListener("click", () => setRoute("tree"));
  leafBtn.addEventListener("click", () => setRoute("leaf"));
  window.addEventListener("hashchange", () => {
    applyRoute(getRoute());
  });

  ensureDefaultLeafGroups();
  refreshLeafGroupList();
  if (params.leafGroupName) {
    loadLeafGroupIntoDraft(params.leafGroupName);
    uiState.leafGroupNameInput = params.leafGroupName;
  }

  applyRoute(getRoute());
}
