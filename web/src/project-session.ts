import { createProject, updateProject, type Project } from './database.ts';
import { cloneParams, validateParams, type PlantParams } from './studio-state.ts';
type Pending = {data: PlantParams; thumbnail: string; name: string};
/** One writer per open project. New edits coalesce without blocking rendering. */
export class ProjectSession {
  project: Project | null = null;
  ready = false;
  failure: unknown = null;
  private epoch = 0;
  get version() { return this.epoch; }
  private pending: Pending | null = null;
  private running: Promise<void> | null = null;
  private changed: (session: ProjectSession) => void;
  constructor(changed: (session: ProjectSession) => void) { this.changed = changed; }
  open(project: Project | null) {
    this.epoch++; this.pending = null; this.project = project; this.ready = true; this.failure = null; this.changed(this);
  }
  block(error: unknown) { this.ready = false; this.failure = error; this.changed(this); }
  enqueue(data: PlantParams, thumbnail: string, name: string) {
    if (!this.ready || this.failure) return;
    if (!this.running && this.project && JSON.stringify(validateParams(this.project.data)) === JSON.stringify(validateParams(data)) && (this.project.thumbnail || !thumbnail)) return;
    this.pending = {data: cloneParams(data), thumbnail, name};
    this.drain();
  }
  private drain() {
    if (this.running || !this.pending || !this.ready || this.failure) return;
    const job = this.pending; this.pending = null;
    const epoch = this.epoch, project = this.project;
    this.running = (async () => {
      try {
        const result = project
          ? await updateProject(project.id, {expectedRevision: project.revision, data: job.data, thumbnail: job.thumbnail})
          : await createProject(job.name, job.data, job.thumbnail);
        if (epoch === this.epoch) { this.project = result; this.changed(this); }
      } catch (error) {
        if (epoch === this.epoch) { this.failure = error; this.pending ??= job; this.changed(this); }
      }
    })().finally(() => { this.running = null; this.drain(); });
  }
  async flush() {
    if (!this.ready) throw this.failure ?? new Error('保存先の読み込みが完了していません。');
    while (this.running) await this.running;
    if (this.failure) throw this.failure;
    return this.project;
  }
}
