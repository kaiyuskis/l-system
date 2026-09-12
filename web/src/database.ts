import { validateParams, type PlantParams, type SavedPreset } from './studio-state.ts';
export class DatabaseError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, data === undefined ? {signal: AbortSignal.timeout(15000)} : {
    signal: AbortSignal.timeout(15000),
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new DatabaseError(detail?.error ?? 'データベースに接続できません。サーバーを確認してください。', response.status);
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

export interface Project { id: string; name: string; data: PlantParams; thumbnail: string; revision: number; deleted: boolean; savedAt: number }
export type ProjectUpdate = { expectedRevision: number; data?: PlantParams; name?: string; thumbnail?: string; deleted?: boolean; restoreRevision?: number };
export const listProjects = () => api<Project[]>('projects');
export const getProject = (id: string) => api<Project>(`projects/${encodeURIComponent(id)}`);
export const projectHistory = (id: string) => api<Project[]>(`projects/${encodeURIComponent(id)}/history`);
export const createProject = (name: string, data: PlantParams, thumbnail = '') => api<Project>('projects', {name, data: validateParams(data), thumbnail});
export const updateProject = (id: string, update: ProjectUpdate) => api<Project>(`projects/${encodeURIComponent(id)}`, update);
