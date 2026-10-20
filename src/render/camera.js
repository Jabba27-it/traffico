// Zoom e spostamento scelti dal giocatore, sopra la vista della città.
// A zoom 1 si vede tutta la parte visibile della città (e la telecamera la
// segue mentre si allarga); più vicino si inquadra solo un pezzo, sempre
// tenuto dentro la parte visibile.

/** @typedef {import('../sim/view.js').Rect} Rect */

export const MAX_ZOOM = 3;

/**
 * @typedef {Object} Camera
 * @property {number} zoom  1 = tutta la città visibile, fino a MAX_ZOOM
 * @property {number} cx    centro inquadrato, in coordinate di mondo
 * @property {number} cy
 */

/** @returns {Camera} */
export function createCamera() {
  return { zoom: 1, cx: 0, cy: 0 };
}

/**
 * Il rettangolo di mondo da inquadrare adesso.
 * @param {Camera} cam
 * @param {Rect} visible  la parte visibile della città
 * @returns {Rect}
 */
export function cameraRect(cam, visible) {
  if (cam.zoom <= 1) return visible;
  const width = visible.width / cam.zoom;
  const height = visible.height / cam.zoom;
  // Il centro resta dove l'ha messo il giocatore, ma l'inquadratura non esce dalla città.
  const cx = clamp(cam.cx, visible.x + width / 2, visible.x + visible.width - width / 2);
  const cy = clamp(cam.cy, visible.y + height / 2, visible.y + visible.height - height / 2);
  cam.cx = cx;
  cam.cy = cy;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/**
 * Cambia zoom tenendo fermo sullo schermo il punto di mondo `anchor`, che
 * deve finire nella posizione di schermo `screen` (es. il punto fra le dita).
 * @param {Camera} cam
 * @param {Rect} visible
 * @param {number} zoom
 * @param {{x: number, y: number}} anchor  punto di mondo
 * @param {{x: number, y: number}} screen  pixel CSS, relativi al canvas
 * @param {(rect: Rect) => number} scaleOf  pixel per unità di mondo inquadrando `rect`
 * @param {{width: number, height: number}} screenSize
 */
export function zoomAround(cam, visible, zoom, anchor, screen, scaleOf, screenSize) {
  const z = clamp(zoom, 1, MAX_ZOOM);
  if (z <= 1) {
    cam.zoom = 1;
    return;
  }
  const width = visible.width / z;
  const scale = scaleOf({ x: 0, y: 0, width, height: visible.height / z });
  cam.zoom = z;
  cam.cx = anchor.x - (screen.x - screenSize.width / 2) / scale;
  cam.cy = anchor.y - (screen.y - screenSize.height / 2) / scale;
}

/**
 * @param {number} v
 * @param {number} min
 * @param {number} max
 */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
