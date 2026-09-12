import { setSceneTheme } from './three-setup.ts';
import { element } from './ui-setup.ts';
import { toast } from './toast.ts';
export function setupDisplay() {
  const mode = element<HTMLSelectElement>('theme-mode');
  const system = matchMedia('(prefers-color-scheme: dark)');
  try { const saved = localStorage.getItem('komorebi_theme'); if (saved && ['auto', 'light', 'dark'].includes(saved)) mode.value = saved; } catch { /* session preference */ }
  const theme = () => {
    const resolved = mode.value === 'auto' ? (system.matches ? 'dark' : 'light') : mode.value as 'light' | 'dark';
    document.documentElement.dataset.theme = resolved;
    setSceneTheme(resolved);
  };
  mode.addEventListener('change', () => { theme(); try { localStorage.setItem('komorebi_theme', mode.value); } catch { /* session preference */ } });
  system.addEventListener('change', theme); theme();
  const editor = element('editor');
  const toggle = element('toggle-editor');
  const setOpen = (open: boolean) => {
    editor.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('editor-open', open);
  };
  const mobile = matchMedia('(max-width: 760px)');
  const wind = document.querySelector<HTMLElement>('.wind-control')!;
  const growthPanel = wind.parentElement!;
  const adapt = () => {
    document.querySelector<HTMLDetailsElement>(".camera-tools")!.open = !mobile.matches;
    (mobile.matches ? document.querySelector('.display-settings')! : growthPanel).append(wind);
    setOpen(!mobile.matches);
  };
  mobile.addEventListener('change', adapt); adapt();
  toggle.addEventListener('click', () => setOpen(editor.hidden));
  element('close-editor').addEventListener('click', () => { setOpen(false); toggle.focus(); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && !element<HTMLDialogElement>('studio-dialog').open) setOpen(false); });
  const fullscreen = element('fullscreen');
  const syncFullscreen = () => {
    const active = !!document.fullscreenElement || document.body.classList.contains('fullscreen-fallback');
    fullscreen.setAttribute('aria-pressed', String(active));
    fullscreen.textContent = active ? '全画面を終了' : '全画面';
  };
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled) await document.documentElement.requestFullscreen();
      else { document.body.classList.toggle('fullscreen-fallback'); toast('この端末ではブラウザー内で表示領域を広げます。'); }
      syncFullscreen();
    } catch { toast('全画面表示を開始できませんでした。', 'error'); }
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  element<HTMLInputElement>('show-fps').addEventListener('change', event => {
    element('fps-counter').hidden = !(event.target as HTMLInputElement).checked;
  });
}
