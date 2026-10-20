import { WORLD_CENTER, WORLD_SIZE, type Vec } from "./mapMath";

/** The camera looks at world point (x, y), magnified by zoom. A zoom of 1 fits the whole map. */
export type Camera = { readonly x: number; readonly y: number; readonly zoom: number };
export type View = { readonly width: number; readonly height: number };
/** Pixels per millisecond. */
export type Velocity = { readonly x: number; readonly y: number };
export type HitTarget<T extends string = string> = {
  readonly id: T;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
};

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.25;
export const MAX_PAN_DISTANCE = 260;
export const INERTIA_TAU_MS = 325;
export const MOVING_THRESHOLD = 0.02;
export const INITIAL_CAMERA: Camera = { x: WORLD_CENTER, y: WORLD_CENTER, zoom: 1 };
export const ZERO_VELOCITY: Velocity = { x: 0, y: 0 };

const VIEW_MARGIN = 40;

/** Screen pixels per world unit. At zoom 1 the whole map fits the smaller side of the view. */
export function pixelsPerUnit(view: View, zoom: number): number {
  return (Math.min(view.width, view.height) / (WORLD_SIZE + VIEW_MARGIN)) * zoom;
}

export function worldToScreen(point: Vec, camera: Camera, view: View): Vec {
  const scale = pixelsPerUnit(view, camera.zoom);
  return {
    x: view.width / 2 + (point.x - camera.x) * scale,
    y: view.height / 2 + (point.y - camera.y) * scale,
  };
}

export function screenToWorld(point: Vec, camera: Camera, view: View): Vec {
  const scale = pixelsPerUnit(view, camera.zoom);
  return {
    x: camera.x + (point.x - view.width / 2) / scale,
    y: camera.y + (point.y - view.height / 2) / scale,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomBy(camera: Camera, factor: number): Camera {
  return { ...camera, zoom: clampZoom(camera.zoom * factor) };
}

/** Keeps the camera centre within a limited distance of the map centre. */
export function clampPan(camera: Camera): Camera {
  const limit = (value: number) =>
    Math.min(WORLD_CENTER + MAX_PAN_DISTANCE, Math.max(WORLD_CENTER - MAX_PAN_DISTANCE, value));
  return { ...camera, x: limit(camera.x), y: limit(camera.y) };
}

/** Moves the camera so the map follows a drag of the given size in screen pixels. */
export function panBy(camera: Camera, dxPixels: number, dyPixels: number, view: View): Camera {
  const scale = pixelsPerUnit(view, camera.zoom);
  return clampPan({ ...camera, x: camera.x - dxPixels / scale, y: camera.y - dyPixels / scale });
}

/** Exponential slowdown for the glide after a drag is released. */
export function decayVelocity(velocity: Velocity, dtMs: number): Velocity {
  const factor = Math.exp(-dtMs / INERTIA_TAU_MS);
  return { x: velocity.x * factor, y: velocity.y * factor };
}

export function isMoving(velocity: Velocity): boolean {
  return Math.hypot(velocity.x, velocity.y) > MOVING_THRESHOLD;
}

/** Smooths the drag speed by blending the latest movement into the previous estimate. */
export function blendVelocity(
  previous: Velocity,
  dxPixels: number,
  dyPixels: number,
  dtMs: number,
  weight = 0.7,
): Velocity {
  if (dtMs <= 0) return previous;
  return {
    x: weight * (dxPixels / dtMs) + (1 - weight) * previous.x,
    y: weight * (dyPixels / dtMs) + (1 - weight) * previous.y,
  };
}

/** The nearest target whose circle (plus some slack) contains the point, or null. */
export function hitTest<T extends string>(
  targets: readonly HitTarget<T>[],
  point: Vec,
  slack = 4,
): T | null {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance <= target.radius + slack && distance < bestDistance) {
      best = target.id;
      bestDistance = distance;
    }
  }
  return best;
}
