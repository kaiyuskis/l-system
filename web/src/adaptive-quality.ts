export type Quality = 'low' | 'medium' | 'high';
const levels: Quality[] = ['low','medium','high'];
/** Sustained samples change the budget; interaction only temporarily lowers it. */
export class AdaptiveQuality {
  private tier: number;
  private maximum: number;
  private slow = 0;
  private fast = 0;
  private changedAt = -Infinity;
  private interactionUntil = -Infinity;
  private interacting = false;
  constructor(maximum: Quality) { this.maximum = levels.indexOf(maximum); this.tier = this.maximum; }
  interaction(active: boolean, now: number) { this.interacting = active; this.interactionUntil = active ? Infinity : now + 800; }
  quality(now: number): Quality { return levels[(this.interacting || now < this.interactionUntil) ? Math.max(0,this.tier-1) : this.tier]; }
  sample(fps: number, now: number): Quality {
    if (!Number.isFinite(fps) || fps <= 0 || this.interacting || now < this.interactionUntil) return this.quality(now);
    this.slow = fps < 35 ? this.slow + 1 : 0;
    this.fast = fps > 55 ? this.fast + 1 : 0;
    if (now - this.changedAt >= 5000) {
      if (this.slow >= 2 && this.tier > 0) {this.tier--;this.changedAt=now;this.slow=this.fast=0;}
      else if (this.fast >= 5 && this.tier < this.maximum) {this.tier++;this.changedAt=now;this.slow=this.fast=0;}
    }
    return this.quality(now);
  }
}
