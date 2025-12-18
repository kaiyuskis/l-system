type ToastType = "info" | "success" | "error";

let container: HTMLDivElement | null = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement("div");
  container.className = "toast-container";
  document.body.appendChild(container);
  return container;
}

export function toast(message: string, type: ToastType = "info", durationMs?: number) {
  const c = ensureContainer();
  const duration = durationMs ?? (type === "error" ? 4800 : 2400);

  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;

  // たまり過ぎ防止（最大5個）
  while (c.children.length >= 5) c.removeChild(c.firstChild!);

  c.appendChild(el);

  window.setTimeout(() => {
    el.classList.add("hide");
    window.setTimeout(() => el.remove(), 220);
  }, duration);
}
