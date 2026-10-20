// Canvas a schermo intero, nitido sugli schermi ad alta densità.
// La telecamera inquadra la parte visibile della città e la segue mentre si allarga.

/**
 * @typedef {Object} View
 * @property {CanvasRenderingContext2D} ctx
 * @property {number} width    larghezza dello schermo in pixel CSS
 * @property {number} height   altezza dello schermo in pixel CSS
 * @property {number} dpr      pixel fisici per pixel CSS
 * @property {number} scale    pixel CSS per unità di mondo
 * @property {number} offsetX  dove finisce sullo schermo l'origine del mondo
 * @property {number} offsetY
 */

/** Spazio intorno alla parte visibile, per intravedere cosa arriverà. */
const CAMERA_MARGIN = 0.03;

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {View} si aggiorna da solo quando la finestra cambia dimensione
 */
export function setupCanvas(canvas) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  /** @type {View} */
  const view = { ctx, width: 0, height: 0, dpr: 1, scale: 1, offsetX: 0, offsetY: 0 };

  const resize = () => {
    view.dpr = window.devicePixelRatio || 1;
    view.width = canvas.clientWidth;
    view.height = canvas.clientHeight;
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
  };

  window.addEventListener('resize', resize);
  resize();
  return view;
}

/**
 * Punta la telecamera sul rettangolo di mondo `rect`, centrato e intero sullo schermo.
 * @param {View} view
 * @param {import('../sim/view.js').Rect} rect
 */
export function fitCamera(view, rect) {
  view.scale = scaleFor(view, rect);
  view.offsetX = view.width / 2 - (rect.x + rect.width / 2) * view.scale;
  view.offsetY = view.height / 2 - (rect.y + rect.height / 2) * view.scale;
}

/**
 * Pixel CSS per unità di mondo inquadrando `rect`.
 * @param {View} view
 * @param {import('../sim/view.js').Rect} rect
 */
export function scaleFor(view, rect) {
  const w = rect.width * (1 + 2 * CAMERA_MARGIN);
  const h = rect.height * (1 + 2 * CAMERA_MARGIN);
  return Math.min(view.width / w, view.height / h);
}

/**
 * Da qui in poi si disegna in pixel CSS dello schermo.
 * @param {View} view
 */
export function useScreenSpace(view) {
  view.ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}

/**
 * Da qui in poi si disegna in unità di mondo.
 * @param {View} view
 */
export function useWorldSpace(view) {
  const s = view.dpr * view.scale;
  view.ctx.setTransform(s, 0, 0, s, view.dpr * view.offsetX, view.dpr * view.offsetY);
}

/**
 * Converte una posizione sullo schermo (relativa al canvas) in coordinate di mondo.
 * @param {View} view
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
export function screenToWorld(view, x, y) {
  return { x: (x - view.offsetX) / view.scale, y: (y - view.offsetY) / view.scale };
}
