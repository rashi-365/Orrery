/** Eases a 0 to 1 progress so it starts fast and settles gently. Clamps outside 0 to 1. */
export function easeOutCubic(progress: number): number {
  const clamped = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  return 1 - (1 - clamped) ** 3;
}

/** The value part-way from one number to another along the eased curve. */
export function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * easeOutCubic(progress);
}
