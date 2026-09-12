import { validateParams, type PlantParams, type SavedPreset } from './studio-state.ts';
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error ?? 'データベースに接続できません。サーバーを確認してください。');
  }
  return response.json();
}
export async function readSavedPresets(): Promise<SavedPreset[]> {
  const saved = await api<SavedPreset[]>('library');
  return saved.map(item => ({ ...item, data: validateParams(item.data) }));
}
export async function writeSavedPreset(name: string, params: PlantParams) {
  await api('library', { name, data: validateParams(params) });
}
export async function deleteSavedPreset(name: string) { await api('library/delete', { name }); }
export async function loadDraft(): Promise<PlantParams | null> {
  const draft = await api<unknown>('draft');
  return draft === null ? null : validateParams(draft);
}
export async function saveDraft(params: PlantParams) { await api('draft', validateParams(params)); }
