// Keep a readable recovery path when WebGL or an application module cannot start.
void import("./main.ts").catch((error: unknown) => {
  console.error("Studio startup failed", error);
  const viewport = document.getElementById("viewport");
  if (viewport) {
    const notice = document.createElement("div");
    notice.className = "model-empty";
    notice.setAttribute("role", "alert");
    const title = document.createElement("strong");
    title.textContent = "3Dプレビューを起動できませんでした。";
    const detail = document.createElement("p");
    detail.textContent =
      "ブラウザーのハードウェアアクセラレーションを有効にして、ページを再読み込みしてください。";
    const reload = document.createElement("button");
    reload.className = "button button-dark";
    reload.textContent = "再読み込み";
    reload.style.pointerEvents = "auto";
    reload.addEventListener("click", () => window.location.reload());
    notice.append(title, detail, reload);
    viewport.replaceChildren(notice);
  }
  const status = document.getElementById("render-status");
  if (status) status.textContent = "プレビューを起動できません";
  const generate = document.getElementById(
    "generate",
  ) as HTMLButtonElement | null;
  if (generate) generate.disabled = true;
});
