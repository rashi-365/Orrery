/** Frames slower than this miss a 60 frames-per-second budget by a visible margin. */
export const SLOW_FRAME_MS = 20;

export type FrameSummary = {
  readonly frames: number;
  readonly fps: number;
  readonly avgMs: number;
  readonly p95Ms: number;
  readonly worstMs: number;
  readonly slowFrames: number;
};

/** Keeps the most recent frame durations in a fixed buffer and summarises them. */
export class FrameMeter {
  private readonly samples: Float32Array;
  private count = 0;
  private next = 0;

  constructor(capacity = 240) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("capacity must be a positive integer");
    }
    this.samples = new Float32Array(capacity);
  }

  /** Records one frame duration in milliseconds. Does not allocate. */
  record(frameMs: number): void {
    this.samples[this.next] = frameMs;
    this.next = (this.next + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count += 1;
  }

  reset(): void {
    this.count = 0;
    this.next = 0;
  }

  /** Statistics over the recorded frames, or null if there are none. */
  summary(): FrameSummary | null {
    if (this.count === 0) return null;
    const sorted = Float32Array.from(this.samples.subarray(0, this.count)).sort();
    let sum = 0;
    let slow = 0;
    for (let i = 0; i < sorted.length; i++) {
      const value = sorted[i] ?? 0;
      sum += value;
      if (value > SLOW_FRAME_MS) slow += 1;
    }
    const average = sum / sorted.length;
    // Nearest-rank 95th percentile, in integer arithmetic to avoid rounding surprises.
    const rank = Math.max(0, Math.ceil((95 * sorted.length) / 100) - 1);
    return {
      frames: sorted.length,
      fps: average > 0 ? 1000 / average : 0,
      avgMs: average,
      p95Ms: sorted[rank] ?? 0,
      worstMs: sorted[sorted.length - 1] ?? 0,
      slowFrames: slow,
    };
  }
}
