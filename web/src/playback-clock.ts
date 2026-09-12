/** Monotonic animation clock. Paused wall time never advances the tree. */
export class PlaybackClock {
  progress = 0;
  paused = false;
  private last: number;
  private duration: number;
  constructor(now: number, duration: number) { this.last = now; this.duration = Math.max(1, duration); }
  advance(now: number, speed = 1) {
    if (!this.paused) this.progress = Math.min(1, this.progress + Math.max(0, now - this.last) * speed / this.duration);
    this.last = now;
    return this.progress;
  }
  pause() { this.paused = true; }
  resume(now: number) { this.last = now; this.paused = false; }
}
