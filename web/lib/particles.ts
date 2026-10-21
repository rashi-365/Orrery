export type Sprite = {
  active: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Particle radius, or how far a ring expands. */
  size: number;
  /** Starting radius of a ring. Unused by particles. */
  base: number;
  /** Timestamp (ms) at which the sprite starts. May be in the future. */
  startAt: number;
  duration: number;
};

/**
 * A fixed set of reusable sprites. All objects are created once up front; spawning and
 * expiring only change their fields, so animating never allocates.
 */
export class SpritePool {
  readonly items: Sprite[];
  private live = 0;

  constructor(capacity: number) {
    this.items = Array.from(
      { length: capacity },
      (): Sprite => ({
        active: false,
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 0,
        size: 0,
        base: 0,
        startAt: 0,
        duration: 0,
      }),
    );
  }

  /** Sprites in use, including ones that have not started yet. */
  get activeCount(): number {
    return this.live;
  }

  /** Takes a free sprite and fills it. Returns false if the pool is full. */
  spawn(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    size: number,
    base: number,
    startAt: number,
    duration: number,
  ): boolean {
    for (let i = 0; i < this.items.length; i++) {
      const sprite = this.items[i];
      if (sprite === undefined || sprite.active) continue;
      sprite.active = true;
      sprite.x0 = x0;
      sprite.y0 = y0;
      sprite.x1 = x1;
      sprite.y1 = y1;
      sprite.size = size;
      sprite.base = base;
      sprite.startAt = startAt;
      sprite.duration = duration;
      this.live += 1;
      return true;
    }
    return false;
  }

  /** Frees every sprite whose time is up. */
  expire(now: number): void {
    for (let i = 0; i < this.items.length; i++) {
      const sprite = this.items[i];
      if (sprite !== undefined && sprite.active && now >= sprite.startAt + sprite.duration) {
        sprite.active = false;
        this.live -= 1;
      }
    }
  }

  /** Sprites that have started and not yet been freed. */
  visibleCount(now: number): number {
    let count = 0;
    for (let i = 0; i < this.items.length; i++) {
      const sprite = this.items[i];
      if (sprite !== undefined && sprite.active && now >= sprite.startAt) count += 1;
    }
    return count;
  }
}

/** How far along a sprite is, from 0 to 1, clamped. */
export function spriteProgress(sprite: Sprite, now: number): number {
  if (sprite.duration <= 0) return 1;
  const progress = (now - sprite.startAt) / sprite.duration;
  return progress < 0 ? 0 : progress > 1 ? 1 : progress;
}

/** Number of brightness steps used when particles fade out. */
export const FADE_STEPS = 20;
/** A particle is at full brightness until this fraction of its journey, then fades out. */
export const FADE_START = 0.88;

/**
 * Brightness step from 0 to steps for a particle at the given progress: full until
 * FADE_START of the way, then fading to zero. Whole steps let colour strings be built once.
 */
export function fadeLevel(progress: number, steps: number): number {
  if (progress <= FADE_START) return steps;
  const fade = (1 - progress) / (1 - FADE_START);
  return Math.max(0, Math.round(fade * steps));
}
