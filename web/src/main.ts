import "./style.css";
import { bakeInstances } from "./export-model.ts";
import { generationEstimate } from "./generation-estimate.ts";
import { PlaybackClock } from "./playback-clock.ts";
import { prepareGrowth } from "./growth-transition.ts";

import * as THREE from "three";
import {
  scene,
  renderer,
  windUniforms,
  fitCamera,
  fitEnvironment,
  zoomCamera,
  setGridVisible,
  setEnvironmentVisible,
  setLightingQuality,
  setAdaptiveQuality,
  setAntialias,
  type LightingQuality,
  setAutoRotate,
  setWindPaused,
  renderFrame,
} from "./three-setup.ts";
import { SPRUCE_NEEDLES_PER_SHOOT } from "./botanical-organs.ts";
import { NEEDLES_PER_SHOOT } from "./pine-needles.ts";
import { requestGeometry } from "./geometry-client.ts";
import { buildTree, disposeTree, waitForTextures } from "./tree-renderer.ts";

import {
  builtinPresets,
  defaultParams,
  cloneParams,
  validateParams,
  readSavedPresets as readLegacyPresets,
  loadDraft as loadLegacyDraft,
  type PlantParams,
} from "./studio-state.ts";
import {
  setupUI,
  element,
  escapeHTML,
  openDialog,
  closeDialog,
  setToggle,
  refreshRange,
} from "./ui-setup.ts";
import { listProjects, getProject, createProject, updateProject, projectHistory, type Project } from "./database.ts";
import { ProjectSession } from "./project-session.ts";
import { setupDisplay } from "./display-settings.ts";
import { icon } from "./icons.ts";
import { toast } from "./toast.ts";

let params = cloneParams(defaultParams);
let selectedPreset: string | null = builtinPresets[0].id;
let projectName = "";

type Snapshot = { params: PlantParams; preset: string | null; name: string };
const past: Snapshot[] = [];
const future: Snapshot[] = [];
let editBatch = false;
let tree: THREE.Group | null = null;
let generationTimer = 0;
let playbackTimer = 0;
let playing = false;
let busy = false;
let activeRun = 0;
let revision = 0;
let needsFit = true;
let view: "perspective" | "front" | "top" = "perspective";
let grid = true;
let environment = true;
let rotating = false;
let wind = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let generationLimit = 10;
let geometryController: AbortController | null = null;
let exportBusy = false;
let lastSuccessful: PlantParams | null = null;
let finishGrowth: (() => void) | null = null;
let growthSettled: Promise<void> = Promise.resolve();
let antialias = true;
let pauseGrowth: (() => number) | null = null;
let resumeGrowth: (() => void) | null = null;
let playbackSpeed = 1;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function snapshot(): Snapshot {
  return {
    params: cloneParams(params),
    preset: selectedPreset,
    name: projectName,
  };
}
function remember() {
  past.push(snapshot());
  if (past.length > 40) past.shift();
  future.length = 0;
  ui.history(past.length > 0, false);
}
function sync() {
  generationLimit = params.growthModel !== "lsystem" ? 16 : Math.min(generationLimit, 10);
  ui.sync(params);
  updateGenerationLimit();
  ui.selection(selectedPreset, projectName || undefined);
  ui.history(past.length > 0, future.length > 0);
}
function restore(state: Snapshot) {
  stopPlayback();
  params = cloneParams(state.params);
  selectedPreset = state.preset;
  projectName = state.name;
  editBatch = false;
  needsFit = true;
  sync();
  schedule(0);
}
function selectPreset(id: string) {
  const preset = builtinPresets.find((item) => item.id === id);
  if (!preset) return;
  stopPlayback();
  remember();
  params = cloneParams(preset.params);
  selectedPreset = id;
  projectName = "";
  editBatch = false;
  needsFit = true;
  sync();
  schedule(0);
}
function change(key: keyof PlantParams, value: PlantParams[keyof PlantParams]) {
  stopPlayback();
  if (!editBatch) {
    remember();
    editBatch = true;
  }
  params = { ...params, [key]: value };
  if (key === "growthModel") {
    const species = builtinPresets.find(item => item.id === value);
    params.generations = Math.min(params.generations, value === "lsystem" ? 10 : 16);
    if (species) {
      params.leafTextureKey = species.params.leafTextureKey;
      selectedPreset = species.id;
    } else {
      selectedPreset = null;
      if (params.rules.every(rule => !rule.expression.trim() || rule.expression.trim().startsWith("#"))) {
        params.premise = "FFA";
        params.rules = [{expression:'A=F[+(50)L][-(50)L][!"+A][!"-A]'}];
      }
    }
    needsFit = true;
  }
  sync();
  schedule(key === "generations" ? 0 : key === "rules" || key === "premise" ? 550 : 180);
}
function schedule(delay = 180) {
  if (!playing && resumeGrowth) finishGrowth?.();
  clearTimeout(generationTimer);
  revision++;
  geometryController?.abort();
  generationTimer = window.setTimeout(() => {
    void regenerate();
  }, delay);
}
function updateGenerationLimit() {
  const timeline = element<HTMLInputElement>("timeline-generation");
  if (timeline.dataset.scrubbing || (playing && finishGrowth)) return;
  let estimate = document.getElementById("generation-estimate");
  if (!estimate) {
    estimate = document.createElement("small");
    estimate.id = "generation-estimate";
    estimate.className = "generation-estimate";
    timeline.parentElement!.append(estimate);
  }
  estimate.textContent = generationEstimate(params);
  timeline.max = String(Math.max(generationLimit, params.generations, 1));
  timeline.value = String(params.generations);
  refreshRange(timeline);
  document.querySelector<HTMLElement>(".timeline-label .muted")!.textContent =
    `/ ${timeline.max}`;

}
async function regenerate(): Promise<boolean> {
  const run = ++activeRun;
  const thisRevision = revision;
  busy = true;
  if (!playing) ui.busy(true);
  ui.error("");
  // Give the browser a painted loading state before bounded CPU/GPU work.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => window.setTimeout(resolve, 0)),
  );
  if (thisRevision !== revision || run !== activeRun) {
    if (run === activeRun) {
      busy = false;
      ui.busy(false);
    }
    return false;
  }
  let nextTree: THREE.Group | null = null;
  try {
    const start = performance.now();
    const validated = validateParams(params);
    const saveEpoch = projectSession.version;
    geometryController?.abort();
    const controller = new AbortController();
    geometryController = controller;
    const data = await requestGeometry(validated, controller.signal);
    if (thisRevision !== revision || run !== activeRun) return false;
    nextTree = buildTree(data, validated);
    // Finish the visible extension before replacing its topology. Rapid slider
    // edits coalesce to the latest revision without jumping to a hidden endpoint.
    await growthSettled;
    if (thisRevision !== revision || run !== activeRun) {
      disposeTree(nextTree);
      nextTree = null;
      return false;
    }
    generationLimit = data.meta.generationLimit;
    finishGrowth?.();
    const height = new THREE.Box3()
      .setFromObject(nextTree)
      .getSize(new THREE.Vector3()).y;
    const previousTree = tree;
    const previousParams = lastSuccessful;
    const onlyAgeChanged = previousParams && previousParams.generations !== validated.generations &&
      JSON.stringify({ ...previousParams, generations: 0 }) === JSON.stringify({ ...validated, generations: 0 });
    const canMorph = previousTree && onlyAgeChanged && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (canMorph) {
      nextTree.visible = false;
    }
    scene.add(nextTree);
    tree = nextTree;
    nextTree = null;
    lastSuccessful = cloneParams(validated);
    if (!playing) {
      fitEnvironment(tree);
      if (needsFit) {
        fitCamera(tree, view);
        needsFit = false;
      }
    }
    const saveRendered = () => {
      if (projectSession.version === saveEpoch && (playing || JSON.stringify(validateParams(params)) === JSON.stringify(validated)))
        projectSession.enqueue(validated, captureThumbnail(), projectName || filename());
    };
    if (canMorph) {
      const growing = validated.generations > previousParams!.generations;
      const large = growing ? tree : previousTree!;
      const small = growing ? previousTree! : tree;
      const morph = prepareGrowth(large, small);
      morph.update(growing ? 0 : 1);
      large.visible = true;
      small.visible = false;
      const playbackTransition = playing;

      const duration = playbackTransition ? 1100 : Math.min(1600, 650 + Math.abs(validated.generations - previousParams!.generations) * 80);
      const clock = new PlaybackClock(performance.now(), duration);
      let displayedAge = previousParams!.generations;
      let frame = 0;
      const current = tree;
      let resolveGrowth!: () => void;
      growthSettled = new Promise<void>(resolve => { resolveGrowth = resolve; });
      finishGrowth = () => {
        cancelAnimationFrame(frame);
        morph.finish();
        current.visible = true;
        disposeTree(previousTree);
        finishGrowth = null;
        pauseGrowth = null; resumeGrowth = null;
        resolveGrowth();
        element("growth-status").hidden = true;
        if (!playing) element("model-empty").hidden = current.children.length > 0;
        saveRendered();
      };
      element("growth-status").hidden = false;
      const animate = (now: number) => {
        const progress = clock.advance(now, playbackTransition ? playbackSpeed : 1);
        morph.update(growing ? progress : 1 - progress, !playbackTransition);
        const eased = playbackTransition ? progress : THREE.MathUtils.smoothstep(progress, 0, 1);
        const displayed = previousParams!.generations + (validated.generations - previousParams!.generations) * eased;
        displayedAge = displayed;
        element("growth-status").textContent = `表示 ${displayed.toFixed(2)} 世代`;
        if (playing && !element<HTMLInputElement>("timeline-generation").dataset.scrubbing) {
          const timeline = element<HTMLInputElement>("timeline-generation");
          timeline.value = String(displayed);
          refreshRange(timeline);
          element("generation-value").textContent = displayed.toFixed(2);
          element<HTMLInputElement>("generation-number").value = displayed.toFixed(2);
        }
        if (progress >= 1) finishGrowth?.();
        else frame = requestAnimationFrame(animate);
      };
      pauseGrowth = () => { clock.pause(); cancelAnimationFrame(frame); return displayedAge; };
      resumeGrowth = () => { clock.resume(performance.now()); frame = requestAnimationFrame(animate); };
      frame = requestAnimationFrame(animate);
    } else if (previousTree) disposeTree(previousTree);
    ui.metrics(
      data.meta.branches,
      validated.leafTextureKey === "pine_needles" ? data.leaves.count * NEEDLES_PER_SHOOT : validated.leafTextureKey === "spruce_needles" ? data.leaves.count * SPRUCE_NEEDLES_PER_SHOOT : data.leaves.count + data.flowers.count + data.buds.count,
      height,
      performance.now() - start,
      data.meta.preview,
      data.meta.symbolCount,
    );
    if (finishGrowth) element("model-empty").hidden = true;
    element("metric-organ-label").textContent = ["pine_needles", "spruce_needles"].includes(validated.leafTextureKey) ? "針葉" : "葉・花";
    updateGenerationLimit();
    if (!canMorph) saveRendered();
    editBatch = false;
    busy = false;
    ui.busy(false);
    if (playing) {
      if (validated.generations >= generationLimit) {
        void growthSettled.then(() => {
          if (thisRevision === revision && playing) { stopPlayback(); sync(); }
        });
      } else {
        // Fetch/build the next generation while the current one is extending.
        // regenerate waits for growthSettled before swapping visible geometry.
        playbackTimer = window.setTimeout(() => {
          if (!playing) return;
          params.generations = Math.min(generationLimit, validated.generations + 1);
          schedule(0);
        }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1100 / playbackSpeed : 0);
      }
    }
    return true;
  } catch (error) {
    if (nextTree) disposeTree(nextTree);
    if (run !== activeRun || thisRevision !== revision) return false;
    ui.error(message(error));
    editBatch = false;
    stopPlayback();
    return false;
  } finally {
    if (run === activeRun) {
      busy = false;
      ui.busy(false);
    }
  }
}
function stopPlayback() {
  const wasPlaying = playing;
  if (playing) {
    revision++;
    clearTimeout(generationTimer);
    geometryController?.abort();
    activeRun++; busy = false; ui.busy(false);
    if (pauseGrowth) {const age=pauseGrowth();params.generations = params.growthModel === "lsystem" ? (lastSuccessful?.generations ?? params.generations) : age;}
    else if (lastSuccessful) params.generations = lastSuccessful.generations;
  }
  playing = false;
  clearTimeout(playbackTimer);
  ui?.playing(false);
  if (wasPlaying) {
    projectSession.enqueue(validateParams(params),captureThumbnail(),projectName || filename());
    sync();
    if (tree) fitEnvironment(tree);
  }
}
function togglePlayback() {
  if (playing) {
    stopPlayback();
    return;
  }
  if (busy && !tree) return;
  remember();
  playing = true;
  ui.playing(true);
  element("model-empty").hidden = true;
  if (tree) fitEnvironment(tree);
  if (resumeGrowth) {
    resumeGrowth();
    const endpoint = lastSuccessful!.generations;
    if (endpoint >= generationLimit) { void growthSettled.then(() => { if (playing) stopPlayback(); }); }
    else { params.generations = Math.min(generationLimit, endpoint + 1); schedule(0); }
    return;
  }
  params.generations = params.generations >= generationLimit ? 1 : Math.min(generationLimit, params.generations + 1);
  schedule(0);
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function filename() {
  return (
    projectName ||
    builtinPresets.find((preset) => preset.id === selectedPreset)?.name ||
    "komorebi"
  ).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}
async function ensureCurrentTree(): Promise<boolean> {
  if (!playing && resumeGrowth) finishGrowth?.();
  clearTimeout(generationTimer);
  while (busy)
    await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
  const current = (
    JSON.stringify(lastSuccessful) === JSON.stringify(params) ||
    (await regenerate())
  );
  finishGrowth?.();
  return current;
}
function captureThumbnail(): string {
  if (!tree) return "";
  renderFrame();
  const canvas = document.createElement("canvas");
  canvas.width = 192; canvas.height = 144;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(renderer.domElement, 0, 0, 192, 144);
  const thumbnail = canvas.toDataURL("image/png");
  return thumbnail.length <= 100_000 ? thumbnail : "";
}
function showSave(copy = false) {
  openDialog(copy ? "別作品として保存" : "作品を保存", `<form id="save-form"><label for="save-name">作品名</label><input id="save-name" class="text-input" maxlength="80" required value="${escapeHTML(projectName || filename())}"/><p id="save-feedback" role="status"></p><div class="dialog-actions"><button class="button" type="submit">保存</button><button class="button" type="button" id="save-copy">別作品として保存</button></div></form>`);
  element("save-copy").addEventListener("click", () => showSave(true));
  element("save-form").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      stopPlayback();
      if (!(await ensureCurrentTree())) throw new Error("生成エラーを修正してください。");
      const name = element<HTMLInputElement>("save-name").value.trim();
      let saved: Project;
      if (copy) saved = await createProject(name, validateParams(params), captureThumbnail());
      else {
        const current = await projectSession.flush();
        saved = current ? await updateProject(current.id, {expectedRevision: current.revision, name, data: validateParams(params), thumbnail: captureThumbnail()}) : await createProject(name, validateParams(params), captureThumbnail());
      }
      if (saved.id !== projectSession.project?.id) { past.length = 0; future.length = 0; }
      projectSession.open(saved); projectName = saved.name; sync(); closeDialog(); toast("保存しました。", "success");
    } catch (error) { element("save-feedback").textContent = message(error); }
  });
}
async function openProject(project: Project) {
  stopPlayback();
  projectSession.open(project);
  past.length = 0; future.length = 0; restore({params: validateParams(project.data), preset: null, name: project.name});
  closeDialog();
}
async function showHistory(project: Project) {
  try {
    const history = await projectHistory(project.id);
    openDialog("作品の履歴", `<p class="dialog-description">復元前の状態も履歴に残ります。</p><div class="library-list">${history.map(item => `<div class="library-item"><span>版 ${item.revision} · ${new Date(item.savedAt).toLocaleString("ja-JP")} · ${Number(item.data.generations.toFixed(2))} 世代</span><button class="button" data-revision="${item.revision}">復元</button></div>`).join("")}</div><p id="history-feedback" role="status"></p>`);
    document.querySelectorAll<HTMLButtonElement>("[data-revision]").forEach(button => button.addEventListener("click", async () => {
      try {
        const restored = await updateProject(project.id, {expectedRevision: project.revision, restoreRevision: Number(button.dataset.revision), deleted: false});
        await openProject(restored); toast("履歴から復元しました。", "success");
      } catch (error) { element("history-feedback").textContent = message(error); }
    }));
  } catch (error) { toast(message(error), "error"); }
}
async function showLibrary() {
  stopPlayback();
  try {
    await projectSession.flush().catch(() => null);
    const saved = await listProjects();
    openDialog("マイライブラリ", `<div class="library-filters"><input class="text-input" id="library-search" type="search" placeholder="作品名・樹種を検索" aria-label="作品を検索"/><label><input id="library-trash" type="checkbox"/>ごみ箱</label></div><div id="library-items" class="library-list"></div><p id="library-feedback" role="status"></p><div class="dialog-actions"><button class="button" id="library-new">新しい作品</button><button class="button" id="library-migrate">旧ブラウザー保存を取り込む</button><button class="button" id="library-import">JSONを読み込む</button></div>`);
    const render = () => {
      const query = element<HTMLInputElement>("library-search").value.toLowerCase();
      const trash = element<HTMLInputElement>("library-trash").checked;
      const filtered = saved.filter(item => item.deleted === trash && `${item.name} ${item.data.growthModel} ${builtinPresets.find(preset => preset.params.growthModel === item.data.growthModel)?.name ?? ""}`.toLowerCase().includes(query));
      element("library-items").innerHTML = filtered.map((item, index) => `<article class="library-item project-card">${item.thumbnail ? `<img src="${escapeHTML(item.thumbnail)}" alt="${escapeHTML(item.name)}のプレビュー" width="96" height="72"/>` : ""}<div><strong>${escapeHTML(item.name)}</strong><small>${Number(item.data.generations.toFixed(2))} 世代 · 版 ${item.revision}</small><div class="project-actions">${trash ? `<button class="button" data-operation="restore" data-index="${index}">削除を取り消す</button>` : `<button class="button" data-operation="open" data-index="${index}">ひらく</button><button class="button" data-operation="copy" data-index="${index}">複製</button><button class="button" data-operation="rename" data-index="${index}">名前変更</button><button class="button" data-operation="history" data-index="${index}">履歴</button><button class="button" data-operation="delete" data-index="${index}">ごみ箱へ</button>`}</div></div></article>`).join("") || '<p>作品がありません。</p>';
      document.querySelectorAll<HTMLButtonElement>("[data-operation]").forEach(button => button.addEventListener("click", async () => {
        const item = filtered[Number(button.dataset.index)];
        try {
          switch (button.dataset.operation) {
            case "open": await openProject(await getProject(item.id)); return;
            case "copy": await createProject(`${item.name.slice(0,75)} コピー`, item.data, item.thumbnail); break;
            case "history": await showHistory(item); return;
            case "rename": {
              openDialog("作品名を変更", `<form id="rename-form"><input id="rename-name" aria-label="作品名" class="text-input" required maxlength="80" value="${escapeHTML(item.name)}"/><button class="button">変更</button><p id="rename-feedback" role="status"></p></form>`);
              element("rename-form").addEventListener("submit", async event => {
                event.preventDefault();
                try { const updated = await updateProject(item.id, {expectedRevision:item.revision, name:element<HTMLInputElement>("rename-name").value}); if (projectSession.project?.id === item.id) {projectSession.open(updated);projectName=updated.name;sync();} await showLibrary(); }
                catch(error) {element("rename-feedback").textContent=message(error);}
              }); return;
            }
            default: {
              const updated = await updateProject(item.id, {expectedRevision:item.revision, deleted:button.dataset.operation === "delete"});
              if (projectSession.project?.id === item.id) { if (updated.deleted) projectSession.block(new Error("この作品はごみ箱にあります。復元するか別作品として保存してください。")); else projectSession.open(updated); }
            }
          }
          await showLibrary();
        } catch(error) { element("library-feedback").textContent = message(error); }
      }));
    };
    element("library-search").addEventListener("input",render); element("library-trash").addEventListener("change",render); render();
    element("library-new").addEventListener("click",() => {stopPlayback();projectSession.open(null);past.length=0;future.length=0;restore({params:cloneParams(defaultParams),preset:builtinPresets[0].id,name:""});closeDialog();});
    element("library-import").addEventListener("click",()=>element<HTMLInputElement>("import-file").click());
    element("library-migrate").addEventListener("click",async()=> {
      try {let count=0;for(const item of readLegacyPresets()) {if(saved.some(p=>p.name===item.name))continue;await createProject(item.name,item.data);count++;}await showLibrary();toast(`${count}件を取り込みました。`);}catch(error){toast(message(error),"error");}
    });
  } catch(error) {toast(message(error),"error");}
}
function showExport() {
  openDialog(
    "モデルを書き出す",
    `<p class="dialog-description">用途に合わせてファイル形式を選択してください。</p><button class="export-option" data-export="png">${icon("image")}<span><strong>プレビュー画像</strong><small>いまの視点と背景を、そのまま画像に。</small></span><b>PNG</b></button><button class="export-option" data-export="glb">${icon("cube")}<span><strong>Blender用 3Dモデル</strong><small>GLB：材質・テクスチャを同梱。BlenderのglTF 2.0読み込みに対応。</small></span><b>GLB</b></button><button class="export-option" data-export="json">${icon("code")}<span><strong>ルールと設定</strong><small>バックアップや、別のブラウザーでの再編集に。</small></span><b>JSON</b></button><p class="control-help">葉・針葉も編集可能なメッシュで保存します。密度が高いほど容量と処理時間が増えます。風のアニメーションは含みません。高さはモデル内の相対単位です。</p><div class="dialog-actions"><button class="button button-quiet" id="export-import">${icon("upload")}JSONを読み込む</button></div>`,
    "EXPORT",
  );
  element("export-import").addEventListener("click", () =>
    element<HTMLInputElement>("import-file").click(),
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-export]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        void exportFile(button.dataset.export!, button);
      }),
    );
}
async function exportFile(format: string, button: HTMLButtonElement) {
  if (exportBusy) return;
  stopPlayback();
  exportBusy = true;
  button.disabled = true;
  try {
    if (!(await ensureCurrentTree()))
      throw new Error("生成ルールのエラーを修正してから書き出してください。");
    if (format === "json") {
      const payload = {
        format: "komorebi-lsystem",
        version: 1,
        name: filename(),
        params: validateParams(params),
      };
      saveBlob(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
        `${filename()}.json`,
      );
    } else {
      if (!tree?.children.length)
        throw new Error(
          "まだ樹木がありません。世代を進めてから書き出してください。",
        );
      await waitForTextures();
      if (format === "png") {
        renderFrame();
        const blob = await new Promise<Blob>((resolve, reject) =>
          renderer.domElement.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error("画像の書き出しに失敗しました。")),
            "image/png",
          ),
        );
        saveBlob(blob, `${filename()}.png`);
      } else {
        const { GLTFExporter } =
          await import("three/examples/jsm/exporters/GLTFExporter.js");
        // Bake taper into ordinary geometry only for export. The display stays instanced.
        const exportParams = cloneParams(lastSuccessful!);
        const exported = buildTree(
          await requestGeometry(exportParams, undefined, true),
          exportParams,
        );
        let result: ArrayBuffer | { [key: string]: unknown };
        try {
          exported.name = filename();
          bakeInstances(exported);
          exported.traverse((object) => {
            if (object instanceof THREE.Mesh)
              object.geometry.deleteAttribute("aThickness");
          });
          result = await new GLTFExporter().parseAsync(exported, {
            binary: true,
            maxTextureSize: 1024,
          });
        } finally {
          disposeTree(exported);
        }
        if (!(result instanceof ArrayBuffer))
          throw new Error("3Dモデルの書き出しに失敗しました。");
        saveBlob(
          new Blob([result], { type: "model/gltf-binary" }),
          `${filename()}.glb`,
        );
      }
    }
    closeDialog();
    toast(`${format.toUpperCase()}を書き出しました。`, "success");
  } catch (error) {
    toast(message(error), "error", 5500);
  } finally {
    exportBusy = false;
    button.disabled = false;
  }
}
function showHelp() {
  openDialog(
    "ルールから、自然を描く。",
    `<p class="dialog-description">L-system は、文字を繰り返し置き換えることで、植物のような枝分かれをつくる仕組みです。ここでは自由な植物のスケッチを楽しめます。</p><ol class="help-steps"><li>「はじめの一粒」から植物を選びます。</li><li>「かたち」「質感」で表情を整えます。</li><li>下の再生ボタンで、世代ごとの成長を観察。</li><li>気に入った樹木は保存、または書き出し。</li></ol><h3 class="help-heading">ルールの基本</h3><div class="help-grid"><code>F / f</code><span>枝を描いて前進 / 描かずに前進</span><code>L K M</code><span>葉 / 花 / つぼみを配置</span><code>+ -</code><span>左右に回転</span><code>&amp; ^</code><span>前後に傾く</span><code>/ \\</code><span>枝の軸を中心に回転</span><code>[ ]</code><span>現在位置を保存 / その位置に戻る</span><code>! &quot;</code><span>太さ / 長さを減衰</span><code>|</code><span>180度向きを変える</span><code>F(2)</code><span>長さ2の枝。+(30) は30度回転。括弧内では四則演算も使えます。</span></div><p class="control-help">例：公理を A、ルールを A=F[+A][-A] にすると、二股の枝が繰り返し生まれます。文字を消すルール A= も使えます。# で始まる行はコメントです。</p><h3 class="help-heading">便利な操作</h3><p class="control-help">F：樹木全体を表示　Space：成長を再生 / 停止<br>Ctrl / ⌘ + Z：元に戻す　Shift を加えるとやり直し<br>Ctrl / ⌘ + S：保存　Ctrl / ⌘ + Enter：生成<br>スマートフォン：1本指で回転、2本指で移動・拡大</p><p class="control-help">保存データはサーバーのデータベースに保管され、同じサーバーに接続した端末間で共有されます。バックアップにはJSON書き出しを使ってください。プリセットは樹木の形を楽しむための表現で、生物学的な成長を正確に再現するものではありません。</p>`,
    "A LITTLE FIELD GUIDE",
  );
}
function action(name: string) {
  switch (name) {
    case "scrub-generation":
      stopPlayback();
      clearTimeout(generationTimer);
      revision++;
      geometryController?.abort();
      break;
    case "generate":
      stopPlayback();
      schedule(0);
      break;
    case "reset":
      selectPreset(selectedPreset ?? builtinPresets[0].id);
      break;
    case "randomize":
      change("seed", crypto.getRandomValues(new Uint32Array(1))[0]);
      break;
    case "undo": {
      const state = past.pop();
      if (state) {
        future.push(snapshot());
        restore(state);
      }
      break;
    }
    case "redo": {
      const state = future.pop();
      if (state) {
        past.push(snapshot());
        restore(state);
      }
      break;
    }
    case "save":
      showSave();
      break;
    case "open-library":
      showLibrary();
      break;
    case "export":
      showExport();
      break;
    case "help":
      showHelp();
      break;
    case "fit-camera":
      if (tree) fitCamera(tree, view);
      break;
    case "zoom-in":
      zoomCamera(0.75);
      break;
    case "zoom-out":
      zoomCamera(1 / 0.75);
      break;
    case "view-perspective":
    case "view-front":
    case "view-top":
      view = name.replace("view-", "") as typeof view;
      ["perspective", "front", "top"].forEach((item) =>
        setToggle(`view-${item}`, item === view),
      );
      if (tree) fitCamera(tree, view);
      break;
    case "toggle-environment":
      environment = !environment;
      setEnvironmentVisible(environment);
      setToggle(name, environment);
      break;
    case "toggle-grid":
      grid = !grid;
      setGridVisible(grid);
      setToggle(name, grid);
      break;
    case "toggle-antialias":
      antialias = !antialias;
      setAntialias(antialias);
      setToggle(name, antialias);
      try { localStorage.setItem("komorebi_antialias", String(antialias)); } catch { /* Session only. */ }
      break;
    case "toggle-rotate":
      rotating = !rotating;
      setAutoRotate(rotating);
      setToggle(name, rotating);
      break;
    case "toggle-wind":
      wind = !wind;
      setWindPaused(!wind);
      windUniforms.strength.value = wind
        ? Number(element<HTMLInputElement>("wind-strength").value)
        : 0;
      setToggle(name, wind);
      break;
    case "play-growth":
      togglePlayback();
      break;
  }
}
const ui = setupUI({ change, preset: selectPreset, action });
element<HTMLSelectElement>("playback-speed").addEventListener("change", event => {playbackSpeed=Number((event.target as HTMLSelectElement).value);});
try { antialias = localStorage.getItem("komorebi_antialias") !== "false"; } catch { /* Session only. */ }
setAntialias(antialias);
setToggle("toggle-antialias", antialias);
setToggle("toggle-environment", environment);
setToggle("toggle-grid", grid);
const qualityControl = element<HTMLSelectElement>("lighting-quality");
try {
  const saved = localStorage.getItem("komorebi_lighting_quality");
  if (saved === "auto" || saved === "low" || saved === "medium" || saved === "high") qualityControl.value = saved;
} catch { /* Rendering remains available without browser storage. */ }
setAdaptiveQuality(qualityControl.value === "auto");
  if(qualityControl.value !== "auto") setLightingQuality(qualityControl.value as LightingQuality);
qualityControl.addEventListener("change", () => {
  setAdaptiveQuality(qualityControl.value === "auto");
  if(qualityControl.value !== "auto") setLightingQuality(qualityControl.value as LightingQuality);
  try { localStorage.setItem("komorebi_lighting_quality", qualityControl.value); } catch { /* Session only. */ }
});

sync();
setToggle("toggle-wind", wind);
setWindPaused(!wind);
windUniforms.strength.value = wind ? 0.8 : 0;
element<HTMLInputElement>("wind-strength").addEventListener(
  "input",
  (event) => {
    const input = event.target as HTMLInputElement;
    refreshRange(input);
    wind = Number(input.value) > 0;
    setWindPaused(!wind);
    setToggle("toggle-wind", wind);
    windUniforms.strength.value = Number(input.value);
  },
);
refreshRange(element<HTMLInputElement>("wind-strength"));
element<HTMLInputElement>("import-file").addEventListener(
  "change",
  async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_000_000)
        throw new Error("設定ファイルは1MB以下にしてください。");
      const raw: unknown = JSON.parse(await file.text());
      let data = raw;
      let name = file.name.replace(/\.json$/i, "");
      if (raw && typeof raw === "object" && "params" in raw) {
        const record = raw as Record<string, unknown>;
        if (record.format !== "komorebi-lsystem" || record.version !== 1)
          throw new Error(
            "この設定ファイルの形式またはバージョンには対応していません。",
          );
        data = record.params;
        if (typeof record.name === "string") name = record.name.slice(0, 80);
      }
      const imported = validateParams(data);
      await requestGeometry(imported);
      stopPlayback();
      past.length = 0; future.length = 0;
      projectSession.open(null);
      restore({ params: imported, preset: null, name });
      closeDialog();
      toast("設定ファイルを読み込みました。", "success");
    } catch (error) {
      toast(message(error), "error", 5500);
    } finally {
      input.value = "";
    }
  },
);
window.addEventListener("keydown", (event) => {
  const editing =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable);
  const modifier = event.ctrlKey || event.metaKey;
  if (element<HTMLDialogElement>("studio-dialog").open) return;
  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    showSave();
    return;
  }
  if (modifier && event.key === "Enter") {
    event.preventDefault();
    action("generate");
    return;
  }
  if (editing) return;
  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    action(event.shiftKey ? "redo" : "undo");
  } else if (modifier && event.key.toLowerCase() === "y") {
    event.preventDefault();
    action("redo");
  } else if (
    event.code === "Space" &&
    !(event.target instanceof HTMLButtonElement)
  ) {
    event.preventDefault();
    action("play-growth");
  } else if (event.key.toLowerCase() === "f") action("fit-camera");
});
setupDisplay();
const projectSession = new ProjectSession(session => {
  const status = element("autosave-status");
  if (session.failure) {
    status.textContent = message(session.failure);
    element("retry-project").hidden = false;
  } else {
    status.textContent = session.project ? `作品に自動保存 · 版 ${session.project.revision}` : "新しい作品";
    element("retry-project").hidden = true;
    if (session.project) {
      projectName = session.project.name;
      try {localStorage.setItem("komorebi_project_id",session.project.id);}catch{/* Pointer only. */}
    } else {try {localStorage.removeItem("komorebi_project_id");}catch{/* Pointer only. */}}
  }
});
const retry = document.createElement("button");retry.id="retry-project";retry.className="button";retry.textContent="保存先を再読み込み";retry.hidden=true;element("autosave-status").after(retry);
async function initializeProject() {
  const loadRevision=revision;
  projectSession.ready = false;
  try {
    let id: string|null=null;try{id=localStorage.getItem("komorebi_project_id");}catch{/* No pointer. */}
    const saved = id ? await getProject(id) : (await listProjects()).find(p=>p.id === "legacy-draft" && !p.deleted) ?? null;
    if(revision !== loadRevision) throw new Error("読み込み中に編集されました。編集内容は別作品として保存できます。保存先の再読み込みで最新版を開きます。");
    if(saved?.deleted) throw new Error("この作品はごみ箱にあります。ライブラリから復元できます。");
    projectSession.open(saved);
    past.length = 0; future.length = 0;
    if(saved){params=validateParams(saved.data);projectName=saved.name;selectedPreset=null;}
    else {const legacy=loadLegacyDraft();if(legacy)params=legacy;}
    sync();schedule(0);
  } catch(error) {projectSession.block(error);toast(message(error),"error");sync();schedule(0);}
}
retry.addEventListener("click", () => {
  stopPlayback();
  openDialog("保存先を再読み込み", '<p class="dialog-description">最新版を開くと、現在の編集内容を置き換えます。手元の編集を残す場合は、別作品として保存してください。</p><div class="dialog-actions"><button class="button" id="reload-latest">最新版を開く</button><button class="button" id="recover-copy">別作品として保存</button></div>');
  element("reload-latest").addEventListener("click", () => { closeDialog(); void initializeProject(); });
  element("recover-copy").addEventListener("click", () => showSave(true));
});
void initializeProject();
if (import.meta.hot)
  import.meta.hot.dispose(() => {

    geometryController?.abort();
    clearTimeout(generationTimer);
    clearTimeout(playbackTimer);
    finishGrowth?.();
    if (tree) disposeTree(tree);
  });
