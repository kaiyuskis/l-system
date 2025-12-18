let indicatorEl: HTMLDivElement | null = null;

function ensureIndicator() {
  if (indicatorEl) return indicatorEl;

  const el = document.createElement("div");
  el.className = "loading-indicator";

  const spinner = document.createElement("div");
  spinner.className = "spinner";

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = "Loading...";

  el.appendChild(spinner);
  el.appendChild(label);
  document.body.appendChild(el);

  indicatorEl = el;
  return el;
}

export function showLoadingIndicator(message: string) {
  const el = ensureIndicator();
  const label = el.querySelector<HTMLDivElement>(".label");
  if (label) label.textContent = message;
  el.classList.add("is-visible");
}

export function hideLoadingIndicator() {
  if (!indicatorEl) return;
  indicatorEl.classList.remove("is-visible");
}
