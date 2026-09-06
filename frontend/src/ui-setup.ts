import { icon, plantIllustration } from "./icons.ts";
import { builtinPresets, type PlantParams } from "./studio-state.ts";

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node as T;
}
export function escapeHTML(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function refreshIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-icon]").forEach((node) => {
    node.innerHTML = icon(node.dataset.icon!);
  });
}
export function refreshRange(input: HTMLInputElement) {
  const amount =
    (Number(input.value) - Number(input.min)) /
    (Number(input.max) - Number(input.min));
  input.style.setProperty(
    "--range-progress",
    `${Math.max(0, Math.min(100, amount * 100))}%`,
  );
}
export type UIActions = {
  change: (
    key: keyof PlantParams,
    value: PlantParams[keyof PlantParams],
  ) => void;
  preset: (id: string) => void;
  action: (name: string) => void;
};
function slider(
  key: keyof PlantParams,
  label: string,
  min: number,
  max: number,
  step: number,
  unit = "",
  hints?: [string, string],
) {
  return `<div class="control-row"><div class="control-label"><label for="range-${key}">${label}</label><span class="control-value"><input class="number-input" type="number" id="number-${key}" data-param="${key}" min="${min}" max="${max}" step="${step}" aria-label="${label}の数値"/><span class="unit">${unit}</span></span></div><input type="range" id="range-${key}" data-param="${key}" min="${min}" max="${max}" step="${step}" aria-label="${label}"/>${hints ? `<div class="range-extents"><span>${hints[0]}</span><span>${hints[1]}</span></div>` : ""}</div>`;
}
function color(key: keyof PlantParams, label: string) {
  return `<label class="color-row" for="color-${key}">${label}<span class="color-input-wrap"><span data-color-value="${key}"></span><input type="color" id="color-${key}" data-param="${key}"/></span></label>`;
}
export function setupUI(actions: UIActions) {
  element("preset-grid").innerHTML = builtinPresets
    .map(
      (preset, index) =>
        `<button class="preset-card" data-preset="${preset.id}" aria-label="${escapeHTML(preset.name)}のプリセット" aria-pressed="false" title="${escapeHTML(preset.description)}">${plantIllustration(index)}<span class="preset-check">${icon("check")}</span><strong>${escapeHTML(preset.name)}</strong><small>${escapeHTML(preset.tag)}</small></button>`,
    )
    .join("");
  element("panel-shape").innerHTML =
    `<section class="control-section"><div class="control-heading">枝のシルエット<button class="section-reset" data-action="reset" title="選択中のプリセットに戻す">${icon("refresh")}リセット</button></div>${slider("angle", "枝の広がり", 0, 180, 1, "°", ["まっすぐ", "広がる"])}${slider("maxLength", "枝の長さ", 0.1, 3, 0.01)}${slider("maxThickness", "幹の太さ", 0.005, 1, 0.005)}${slider("angleVariance", "自然なゆらぎ", 0, 45, 0.5, "°")}</section><section class="control-section"><div class="control-heading">かたちの個性 ${icon("dice")}</div><label class="control-label" for="seed">ランダムシード</label><div class="seed-field"><input class="text-input" type="number" id="seed" data-param="seed" min="0" max="4294967295" step="1"/><button class="icon-button" data-action="randomize" title="別のかたちを試す" aria-label="別のかたちを試す">${icon("dice")}</button></div><p class="control-help">同じシードなら、いつでも同じかたちに。</p></section><section class="control-section"><div class="control-heading">成長のふるまい</div>${slider("scale", "枝の長さの減衰", 0, 2, 0.01)}${slider("widthDecay", "枝の太さの減衰", 0, 1, 0.01)}${slider("gravity", "重力", -10, 10, 0.01)}<label class="toggle-row" for="growth-mode">世代に合わせて幹も成長<input type="checkbox" id="growth-mode" data-param="growthMode"/></label><p class="control-help">オフにすると、幹の長さと太さを保ったまま枝分かれします。</p></section>`;
  element("panel-appearance").innerHTML =
    `<section class="control-section"><div class="control-heading">葉の表情 ${icon("leaf")}</div><div class="control-row"><label class="control-label" for="leaf-texture">葉のかたち</label><select id="leaf-texture" data-param="leafTextureKey"><option value="leaf_default">楕円の葉</option><option value="leaf_maple">モミジの葉</option></select></div>${color("leafColor", "葉の色")}${slider("leafSize", "葉の大きさ", 0, 5, 0.05)}</section><section class="control-section"><div class="control-heading">花とつぼみ</div>${color("flowerColor", "花の色")}${slider("flowerSize", "花の大きさ", 0, 5, 0.05)}${color("budColor", "つぼみの色")}${slider("budSize", "つぼみの大きさ", 0, 5, 0.05)}<p class="control-help">花は K、つぼみは M を生成ルールに加えると咲きます。大きさを 0 にすると非表示になります。</p></section><section class="control-section"><div class="control-heading">樹皮</div>${color("branchColor", "幹と枝の色")}</section>`;
  element("panel-rules").innerHTML =
    `<section class="control-section"><div class="control-heading">L-system エディター ${icon("code")}</div><div class="control-row"><label class="control-label" for="premise">はじめの文字列（公理）</label><input id="premise" class="text-input" data-param="premise" spellcheck="false" maxlength="250000"/></div><label class="control-label" for="rules-editor">枝分かれのルール <span>1行に1つ</span></label><textarea id="rules-editor" class="rule-editor" spellcheck="false" aria-describedby="rule-guidance" maxlength="100000"></textarea><div class="rule-help" id="rule-guidance"><code>A=F[+A][-A]</code><br>世代が進むたび、左の文字を右の文字列に置き換えます。<br><code>F</code> 枝を伸ばす　<code>L</code> 葉　<code>K</code> 花<br><code>[ ]</code> 枝分かれ　<code>+ −</code> 向きを変える<br><button class="text-link" data-action="help">記号と書き方を詳しく見る ${icon("arrow")}</button></div></section><section class="control-section"><div class="control-heading">展開された文字列 <span id="symbol-count">0 文字</span></div><pre class="result-string" id="result-string">—</pre><p class="control-help">先頭 1,000 文字を表示。複雑すぎるルールは、画面の停止を防ぐため生成を制限します。</p></section>`;
  refreshIcons();
  document
    .querySelectorAll<HTMLButtonElement>("[data-preset]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        actions.preset(button.dataset.preset!),
      ),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        actions.action(button.dataset.action!),
      ),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-tab]")
    .forEach((button, index, buttons) => {
      button.addEventListener("click", () =>
        buttons.forEach((tab) => {
          const active = tab === button;
          tab.setAttribute("aria-selected", String(active));
          tab.tabIndex = active ? 0 : -1;
          element(`panel-${tab.dataset.tab}`).hidden = !active;
        }),
      );
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index +
                  (event.key === "ArrowRight" ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[next].click();
        buttons[next].focus();
      });
    });
  document
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-param]")
    .forEach((input) => {
      input.addEventListener(
        input.type === "range" || input.type === "color" ? "input" : "change",
        () => {
          if (!input.checkValidity()) {
            input.reportValidity();
            return;
          }
          const value =
            input.type === "checkbox"
              ? (input as HTMLInputElement).checked
              : ["range", "number"].includes(input.type)
                ? Number(input.value)
                : input.value;
          actions.change(input.dataset.param as keyof PlantParams, value);
        },
      );
    });
  element<HTMLTextAreaElement>("rules-editor").addEventListener(
    "input",
    (event) =>
      actions.change(
        "rules",
        (event.target as HTMLTextAreaElement).value
          .split("\n")
          .map((expression) => ({ expression })),
      ),
  );
  element<HTMLInputElement>("timeline-generation").addEventListener(
    "input",
    (event) =>
      actions.change(
        "generations",
        Number((event.target as HTMLInputElement).value),
      ),
  );
  [
    "undo",
    "redo",
    "help",
    "open-library",
    "save",
    "export",
    "generate",
    "fit-camera",
    "view-perspective",
    "view-front",
    "view-top",
    "toggle-grid",
    "toggle-rotate",
    "toggle-wind",
    "play-growth",
  ].forEach((id) =>
    element(id).addEventListener("click", () => actions.action(id)),
  );
  element("close-dialog").addEventListener("click", closeDialog);
  element<HTMLDialogElement>("studio-dialog").addEventListener(
    "click",
    (event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = element("studio-dialog").getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        closeDialog();
    },
  );
  return {
    sync(params: PlantParams) {
      document
        .querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-param]")
        .forEach((input) => {
          const value = params[input.dataset.param as keyof PlantParams];
          if (input.type === "checkbox")
            (input as HTMLInputElement).checked = Boolean(value);
          else if (document.activeElement !== input) {
            if (
              input instanceof HTMLInputElement &&
              (input.type === "range" || input.type === "number")
            ) {
              input.min = String(Math.min(Number(input.min), Number(value)));
              input.max = String(Math.max(Number(input.max), Number(value)));
            }
            input.value = String(value);
          }
          if (input.type === "range") refreshRange(input as HTMLInputElement);
        });
      document
        .querySelectorAll<HTMLElement>("[data-color-value]")
        .forEach((node) => {
          node.textContent = String(
            params[node.dataset.colorValue as keyof PlantParams],
          ).toUpperCase();
        });
      const rules = element<HTMLTextAreaElement>("rules-editor");
      if (document.activeElement !== rules)
        rules.value = params.rules.map((rule) => rule.expression).join("\n");
      const timeline = element<HTMLInputElement>("timeline-generation");
      timeline.value = String(params.generations);
      refreshRange(timeline);
      element("generation-value").textContent = String(params.generations);
    },
    selection(id: string | null, customName?: string) {
      const index = builtinPresets.findIndex((preset) => preset.id === id);
      const preset = builtinPresets[index];
      document
        .querySelectorAll<HTMLButtonElement>("[data-preset]")
        .forEach((button) => {
          const active = button.dataset.preset === id;
          button.classList.toggle("selected", active);
          button.setAttribute("aria-pressed", String(active));
        });
      element("specimen-name").textContent =
        customName || preset?.name || "あなただけの樹木";
      element("specimen-latin").textContent =
        preset?.latinName || "A study in branching";
      element("specimen-number").textContent =
        index >= 0 ? String(index + 1).padStart(2, "0") : "∞";
      element("project-name").textContent =
        customName || `${preset?.name || "樹木"}のスケッチ`;
    },
    busy(value: boolean) {
      element("busy-indicator").hidden = !value;
      element("viewport").setAttribute("aria-busy", String(value));
      element<HTMLButtonElement>("generate").disabled = value;
      element("generate-label").textContent = value
        ? "樹木を育てています…"
        : "樹木を生成する";
      element("render-status").textContent = value
        ? "生成中"
        : "プレビュー更新済み";
    },
    error(message: string) {
      element("generation-error").textContent = message;
      element("generation-error").hidden = !message;
      element("rules-editor").setAttribute(
        "aria-invalid",
        String(Boolean(message)),
      );
      if (message)
        element("render-status").textContent = "設定を確認してください";
    },
    metrics(
      branches: number,
      organs: number,
      height: number,
      ms: number,
      str: string,
    ) {
      element("metric-branches").textContent = branches.toLocaleString("ja-JP");
      element("metric-organs").textContent = organs.toLocaleString("ja-JP");
      element("metric-height").textContent = height.toFixed(2);
      element("metric-time").textContent = `${Math.round(ms)} ms`;
      element("symbol-count").textContent =
        `${str.length.toLocaleString("ja-JP")} 文字`;
      element("result-string").textContent =
        str.slice(0, 1000) + (str.length > 1000 ? "\n…" : "");
      element("model-empty").hidden = branches + organs > 0;
    },
    history(undo: boolean, redo: boolean) {
      element<HTMLButtonElement>("undo").disabled = !undo;
      element<HTMLButtonElement>("redo").disabled = !redo;
    },
    playing(value: boolean) {
      element("play-growth").innerHTML = icon(value ? "pause" : "play");
      element("play-growth").classList.toggle("playing", value);
      element("play-growth").setAttribute(
        "aria-label",
        value ? "成長を一時停止" : "成長を再生",
      );
      element("play-growth").title = value ? "成長を一時停止" : "成長を再生";
    },
  };
}
export function openDialog(
  title: string,
  content: string,
  eyebrow = "BOTANICAL STUDIO",
) {
  element("dialog-title").textContent = title;
  element("dialog-eyebrow").textContent = eyebrow;
  element("dialog-content").innerHTML = content;
  const dialog = element<HTMLDialogElement>("studio-dialog");
  dialog.setAttribute("aria-labelledby", "dialog-title");
  if (!dialog.open) dialog.showModal();
}
export function closeDialog() {
  element<HTMLDialogElement>("studio-dialog").close();
}
export function setToggle(id: string, value: boolean) {
  element(id).classList.toggle("active", value);
  element(id).setAttribute("aria-pressed", String(value));
}
