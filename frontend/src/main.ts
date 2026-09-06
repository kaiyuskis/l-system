import "./style.css";
import * as THREE from "three";
import {
  scene,
  renderer,
  windUniforms,
  fitCamera,
  setGridVisible,
  setAutoRotate,
  setWindPaused,
  renderFrame,
} from "./three-setup.ts";
import {
  generateLSystemString,
  createLSystemData,
  parseRules,
  LSYSTEM_LIMITS,
} from "./l-system.ts";
import { buildTree, disposeTree, waitForTextures } from "./tree-renderer.ts";
import { setSeed } from "./rng.ts";
import {
  builtinPresets,
  defaultParams,
  cloneParams,
  validateParams,
  readSavedPresets,
  writeSavedPreset,
  deleteSavedPreset,
  loadDraft,
  saveDraft,
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
import { icon } from "./icons.ts";
import { toast } from "./toast.ts";

let params = cloneParams(defaultParams);
let selectedPreset: string | null = builtinPresets[0].id;
let projectName = "";
let draftWarning = "";
try {
  const draft = loadDraft();
  if (draft) {
    params = draft;
    selectedPreset =
      builtinPresets.find(
        (preset) =>
          JSON.stringify(preset.params.rules) === JSON.stringify(params.rules),
      )?.id ?? null;
  }
} catch (error) {
  draftWarning = message(error);
}

type Snapshot = { params: PlantParams; preset: string | null; name: string };
const past: Snapshot[] = [];
const future: Snapshot[] = [];
let editBatch = false;
let tree: THREE.Group | null = null;
let generationTimer = 0;
let playbackTimer = 0;
let playing = false;
let busy = false;
let revision = 0;
let needsFit = true;
let view: "perspective" | "front" | "top" = "perspective";
let grid = true;
let rotating = false;
let wind = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let generationLimit = 10;
let limitKey = "";
let exportBusy = false;
let lastSuccessful: PlantParams | null = null;

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
  ui.sync(params);
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
  sync();
  schedule(key === "rules" || key === "premise" ? 550 : 180);
}
function schedule(delay = 180) {
  clearTimeout(generationTimer);
  revision++;
  generationTimer = window.setTimeout(() => {
    void regenerate();
  }, delay);
}
function updateGenerationLimit() {
  const key = JSON.stringify([params.premise, params.rules]);
  if (key !== limitKey) {
    const rules = parseRules(params.rules);
    generationLimit = 0;
    for (let generation = 0; generation <= 10; generation++) {
      try {
        const str = generateLSystemString(params.premise, rules, generation);
        if (
          (str.match(/F/g)?.length ?? 0) > LSYSTEM_LIMITS.maxBranches ||
          (str.match(/[LKM]/g)?.length ?? 0) > LSYSTEM_LIMITS.maxOrgans
        )
          break;
        generationLimit = generation;
      } catch {
        break;
      }
    }
    limitKey = key;
  }
  const timeline = element<HTMLInputElement>("timeline-generation");
  timeline.max = String(Math.max(generationLimit, params.generations, 1));
  timeline.value = String(params.generations);
  refreshRange(timeline);
  document.querySelector<HTMLElement>(".timeline-label .muted")!.textContent =
    `/ ${timeline.max}`;
  document.querySelector<HTMLElement>(".timeline-ticks")!.innerHTML =
    Array.from(
      { length: Math.min(6, Number(timeline.max)) + 1 },
      (_, index) => {
        const value = Math.round(
          (index * Number(timeline.max)) / Math.min(6, Number(timeline.max)),
        );
        return `<span>${value === 0 ? "種" : value}</span>`;
      },
    ).join("");
}
async function regenerate(): Promise<boolean> {
  const thisRevision = revision;
  busy = true;
  ui.busy(true);
  ui.error("");
  // Give the browser a painted loading state before bounded CPU/GPU work.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => window.setTimeout(resolve, 0)),
  );
  if (thisRevision !== revision) {
    busy = false;
    return false;
  }
  let nextTree: THREE.Group | null = null;
  try {
    const start = performance.now();
    const validated = validateParams(params);
    const rules = parseRules(validated.rules);
    const str = generateLSystemString(
      validated.premise,
      rules,
      validated.generations,
    );
    setSeed(validated.seed);
    const ratio = validated.growthMode
      ? Math.min(validated.generations / 10, 1)
      : 1;
    const data = createLSystemData(str, {
      initLen: validated.maxLength * ratio,
      initWid: validated.maxThickness * ratio * ratio,
      scale: validated.scale,
      widthDecay: validated.widthDecay,
      angle: validated.angle,
      angleVariance: validated.angleVariance,
      gravity: validated.gravity,
      leafSize: validated.leafSize,
      flowerSize: validated.flowerSize,
      budSize: validated.budSize,
    });
    nextTree = buildTree(data, validated);
    const height = new THREE.Box3()
      .setFromObject(nextTree)
      .getSize(new THREE.Vector3()).y;
    scene.add(nextTree);
    if (tree) disposeTree(tree);
    tree = nextTree;
    nextTree = null;
    lastSuccessful = cloneParams(validated);
    if (needsFit) {
      fitCamera(tree, view);
      needsFit = false;
    }
    ui.metrics(
      data.branches.length,
      data.leaves.length + data.flowers.length + data.buds.length,
      height,
      performance.now() - start,
      str,
    );
    updateGenerationLimit();
    try {
      saveDraft(validated);
      element("autosave-status").textContent =
        "このブラウザーに作業内容を自動保存";
    } catch (error) {
      element("autosave-status").textContent =
        "自動保存できません。JSONで書き出せます";
      if (!draftWarning) {
        draftWarning = message(error);
        toast(draftWarning, "error", 5500);
      }
    }
    editBatch = false;
    busy = false;
    ui.busy(false);
    if (playing) {
      if (params.generations >= generationLimit) stopPlayback();
      else
        playbackTimer = window.setTimeout(() => {
          params.generations++;
          sync();
          schedule(0);
        }, 1100);
    }
    return true;
  } catch (error) {
    if (nextTree) disposeTree(nextTree);
    busy = false;
    ui.busy(false);
    ui.error(message(error));
    editBatch = false;
    stopPlayback();
    return false;
  }
}
function stopPlayback() {
  playing = false;
  clearTimeout(playbackTimer);
  ui?.playing(false);
}
function togglePlayback() {
  if (playing) {
    stopPlayback();
    return;
  }
  if (busy) return;
  remember();
  playing = true;
  ui.playing(true);
  params.generations = 0;
  sync();
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
  clearTimeout(generationTimer);
  while (busy)
    await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
  return (
    JSON.stringify(lastSuccessful) === JSON.stringify(params) ||
    (await regenerate())
  );
}
function showSave() {
  openDialog(
    "この樹木に、名前を。",
    `<p class="dialog-description">いまのルールと設定をマイライブラリに保存します。保存先は、このブラウザーの中です。</p><form id="save-form"><label class="dialog-field-label" for="save-name">作品名</label><input class="text-input" id="save-name" name="name" maxlength="80" required placeholder="例：風にゆれるシラカバ" value="${escapeHTML(projectName || `${builtinPresets.find((p) => p.id === selectedPreset)?.name || "樹木"}のスケッチ`)}"/><p id="save-feedback" class="control-help" role="status"></p><div class="dialog-actions"><button type="button" class="button button-quiet" id="save-cancel">キャンセル</button><button class="button button-dark" type="submit">${icon("save")}ライブラリに保存</button></div></form>`,
    "SAVE YOUR SPECIMEN",
  );
  element("save-cancel").addEventListener("click", closeDialog);
  element<HTMLInputElement>("save-name").focus();
  element<HTMLInputElement>("save-name").select();
  let overwriteName = "";
  element("save-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = element<HTMLInputElement>("save-name").value.trim();
    try {
      validateParams(params);
      parseRules(params.rules);
      stopPlayback();
      if (!(await ensureCurrentTree()))
        throw new Error("生成ルールのエラーを修正してから保存してください。");
      if (
        readSavedPresets().some((item) => item.name === name) &&
        overwriteName !== name
      ) {
        overwriteName = name;
        element("save-feedback").textContent =
          "同じ名前の作品があります。もう一度「保存」を押すと置き換えます。";
        return;
      }
      writeSavedPreset(name, params);
      projectName = name;
      sync();
      closeDialog();
      toast(`「${name}」を保存しました。`, "success");
    } catch (error) {
      element("save-feedback").textContent = message(error);
    }
  });
}
function showLibrary() {
  try {
    const saved = readSavedPresets();
    openDialog(
      "マイライブラリ",
      `<p class="dialog-description">また育てたくなる、あなたの樹木たち。ルールと設定から同じかたちを再現できます。</p><div class="library-list">${saved.length ? saved.map((item, index) => `<div class="library-item"><div><strong>${escapeHTML(item.name)}</strong><small>${new Date(item.savedAt).toLocaleDateString("ja-JP")} · ${item.data.generations} 世代 · seed ${item.data.seed}</small></div><button class="button" data-load="${index}">ひらく</button><button class="icon-button" data-delete="${index}" aria-label="${escapeHTML(item.name)}を削除">${icon("trash")}</button></div>`).join("") : `<div class="library-empty">${icon("sprout")}まだ、小さな空の庭です。<br>お気に入りのかたちができたら、保存してみましょう。</div>`}</div><div class="dialog-actions"><button class="button button-quiet" id="library-import">${icon("upload")}JSONを読み込む</button><button class="button button-dark" id="library-save">${icon("save")}いまの樹木を保存</button></div>`,
      "YOUR COLLECTION",
    );
    element("library-import").addEventListener("click", () =>
      element<HTMLInputElement>("import-file").click(),
    );
    element("library-save").addEventListener("click", showSave);
    document
      .querySelectorAll<HTMLButtonElement>("[data-load]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          const item = saved[Number(button.dataset.load)];
          remember();
          restore({
            params: item.data,
            preset:
              builtinPresets.find(
                (p) =>
                  JSON.stringify(p.params.rules) ===
                  JSON.stringify(item.data.rules),
              )?.id ?? null,
            name: item.name,
          });
          closeDialog();
          toast(`「${item.name}」を読み込みました。`, "success");
        }),
      );
    document
      .querySelectorAll<HTMLButtonElement>("[data-delete]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          const item = saved[Number(button.dataset.delete)];
          if (button.dataset.confirm !== "true") {
            button.dataset.confirm = "true";
            button.innerHTML = icon("check");
            button.title = "もう一度押すと削除します";
            toast("もう一度チェックを押すと、この作品を削除します。");
            return;
          }
          try {
            deleteSavedPreset(item.name);
            showLibrary();
            toast(`「${item.name}」を削除しました。`);
          } catch (error) {
            toast(message(error), "error");
          }
        }),
      );
  } catch (error) {
    toast(message(error), "error", 6000);
  }
}
function showExport() {
  openDialog(
    "あなたの樹木を、外へ。",
    `<p class="dialog-description">作品を画像として残したり、3D制作に使ったり。用途に合わせて書き出せます。</p><button class="export-option" data-export="png">${icon("image")}<span><strong>プレビュー画像</strong><small>いまの視点と背景を、そのまま画像に。</small></span><b>PNG</b></button><button class="export-option" data-export="glb">${icon("cube")}<span><strong>3Dモデル</strong><small>樹木とテクスチャを、ひとつのファイルに。</small></span><b>GLB</b></button><button class="export-option" data-export="json">${icon("code")}<span><strong>ルールと設定</strong><small>バックアップや、別のブラウザーでの再編集に。</small></span><b>JSON</b></button><p class="control-help">3Dモデルには風のアニメーションを含みません。高さはモデル内の相対単位です。</p><div class="dialog-actions"><button class="button button-quiet" id="export-import">${icon("upload")}JSONを読み込む</button></div>`,
    "TAKE IT WITH YOU",
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
  const cloneGeometries: THREE.BufferGeometry[] = [];
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
        const exported = tree.clone(true);
        exported.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry = object.geometry.clone();
          object.geometry.deleteAttribute("aThickness");
          cloneGeometries.push(object.geometry);
        });
        const result = await new GLTFExporter().parseAsync(exported, {
          binary: true,
          maxTextureSize: 1024,
        });
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
    cloneGeometries.forEach((geometry) => geometry.dispose());
    exportBusy = false;
    button.disabled = false;
  }
}
function showHelp() {
  openDialog(
    "ルールから、自然を描く。",
    `<p class="dialog-description">L-system は、文字を繰り返し置き換えることで、植物のような枝分かれをつくる仕組みです。ここでは自由な植物のスケッチを楽しめます。</p><ol class="help-steps"><li>「はじめの一粒」から植物を選びます。</li><li>「かたち」「質感」で表情を整えます。</li><li>下の再生ボタンで、世代ごとの成長を観察。</li><li>気に入った樹木は保存、または書き出し。</li></ol><h3 class="help-heading">ルールの基本</h3><div class="help-grid"><code>F / f</code><span>枝を描いて前進 / 描かずに前進</span><code>L K M</code><span>葉 / 花 / つぼみを配置</span><code>+ -</code><span>左右に回転</span><code>&amp; ^</code><span>前後に傾く</span><code>/ \\</code><span>枝の軸を中心に回転</span><code>[ ]</code><span>現在位置を保存 / その位置に戻る</span><code>! &quot;</code><span>太さ / 長さを減衰</span><code>|</code><span>180度向きを変える</span><code>F(2)</code><span>長さ2の枝。+(30) は30度回転。括弧内では四則演算も使えます。</span></div><p class="control-help">例：公理を A、ルールを A=F[+A][-A] にすると、二股の枝が繰り返し生まれます。文字を消すルール A= も使えます。# で始まる行はコメントです。</p><h3 class="help-heading">便利な操作</h3><p class="control-help">F：樹木全体を表示　Space：成長を再生 / 停止<br>Ctrl / ⌘ + Z：元に戻す　Shift を加えるとやり直し<br>Ctrl / ⌘ + S：保存　Ctrl / ⌘ + Enter：生成<br>スマートフォン：1本指で回転、2本指で移動・拡大</p><p class="control-help">保存データはこのブラウザー内に保管されます。バックアップにはJSON書き出しを使ってください。プリセットは樹木の形を楽しむための表現で、生物学的な成長を正確に再現するものではありません。</p>`,
    "A LITTLE FIELD GUIDE",
  );
}
function action(name: string) {
  switch (name) {
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
    case "view-perspective":
    case "view-front":
    case "view-top":
      view = name.replace("view-", "") as typeof view;
      ["perspective", "front", "top"].forEach((item) =>
        setToggle(`view-${item}`, item === view),
      );
      if (tree) fitCamera(tree, view);
      break;
    case "toggle-grid":
      grid = !grid;
      setGridVisible(grid);
      setToggle(name, grid);
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
      parseRules(imported.rules);
      // Validate expansion and geometry before replacing any user settings.
      const str = generateLSystemString(
        imported.premise,
        parseRules(imported.rules),
        imported.generations,
      );
      setSeed(imported.seed);
      createLSystemData(str, {
        initLen: imported.maxLength,
        initWid: imported.maxThickness,
        scale: imported.scale,
        widthDecay: imported.widthDecay,
        angle: imported.angle,
        angleVariance: imported.angleVariance,
        gravity: imported.gravity,
        flowerSize: imported.flowerSize,
        leafSize: imported.leafSize,
        budSize: imported.budSize,
      });
      remember();
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
if (draftWarning) toast(draftWarning, "error", 6500);
schedule(0);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearTimeout(generationTimer);
    clearTimeout(playbackTimer);
    if (tree) disposeTree(tree);
  });
