import { element } from "./ui-setup.ts";
import { validateParams, type PlantParams } from "./studio-state.ts";

type Proposal = {
  name: string;
  description: string;
  model: string;
  params: PlantParams;
};
export function setupAI(options: {
  getCurrent: () => PlantParams;
  apply: (proposal: Proposal) => void;
}) {
  let controller: AbortController | null = null;
  let proposal: Proposal | null = null;
  let checked = false;
  const submit = element<HTMLButtonElement>("ai-submit");
  const cancel = element<HTMLButtonElement>("ai-cancel");
  const feedback = element("ai-feedback");
  async function request(path: string, init?: RequestInit) {
    const response = await fetch(path, init);
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error(
        "AIのバックエンドに接続できません。接続設定を確認してください。",
      );
    const result = await response.json();
    if (!response.ok || typeof result.error === "string")
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "AIの処理に失敗しました。",
      );
    return result;
  }
  async function checkStatus() {
    const status = element("ai-status");
    status.textContent = "接続を確認しています…";
    try {
      const result = await request("/api/ai/status", {
        signal: AbortSignal.timeout(8000),
      });
      status.textContent = `${result.model} · ${result.message}`;
    } catch {
      status.textContent =
        "AIに接続できません。接続設定を確認して再確認してください。";
    }
  }
  element<HTMLDetailsElement>("ai-panel").addEventListener("toggle", () => {
    if (element<HTMLDetailsElement>("ai-panel").open && !checked) {
      checked = true;
      void checkStatus();
    }
  });
  element("ai-check").addEventListener("click", () => {
    void checkStatus();
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-ai-example]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        element<HTMLTextAreaElement>("ai-prompt").value =
          button.dataset.aiExample!;
        element<HTMLTextAreaElement>("ai-prompt").focus();
      }),
    );
  cancel.addEventListener("click", () => controller?.abort());
  element("ai-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (controller) return;
    const prompt = element<HTMLTextAreaElement>("ai-prompt").value.trim();
    if (!prompt) {
      feedback.textContent = "つくりたい樹木を言葉で入力してください。";
      return;
    }
    controller = new AbortController();
    submit.disabled = true;
    cancel.hidden = false;
    proposal = null;
    element("ai-result").hidden = true;
    feedback.textContent =
      "AIが樹木を考えています。初回はモデルの読み込みに時間がかかります…";
    feedback.classList.remove("is-error");
    try {
      const useCurrent = element<HTMLInputElement>("ai-use-current").checked;
      const result = await request("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt,
          ...(useCurrent ? { current: options.getCurrent() } : {}),
        }),
      });
      const params = validateParams(result.params);
      if (
        typeof result.name !== "string" ||
        typeof result.description !== "string" ||
        typeof result.model !== "string"
      )
        throw new Error("AIから正しい設定を受け取れませんでした。");
      proposal = {
        name: result.name,
        description: result.description,
        model: result.model,
        params,
      };
      element("ai-result-name").textContent = proposal.name;
      element("ai-result-description").textContent = proposal.description;
      element("ai-result").hidden = false;
      feedback.textContent =
        "樹木の設定ができました。表示して、さらに調整できます。";
    } catch (error) {
      feedback.textContent = controller.signal.aborted
        ? "生成をキャンセルしました。"
        : error instanceof Error
          ? error.message
          : "AIの生成に失敗しました。";
      feedback.classList.toggle("is-error", !controller.signal.aborted);
    } finally {
      controller = null;
      submit.disabled = false;
      cancel.hidden = true;
    }
  });
  element("ai-apply").addEventListener("click", () => {
    if (!proposal) return;
    options.apply(proposal);
    feedback.textContent =
      "樹木に反映しました。「元に戻す」で前の作品に戻れます。";
  });
  return () => controller?.abort();
}
