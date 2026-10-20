// Canvas a schermo intero, nitido sugli schermi ad alta densità.
// Il mondo di gioco ha dimensioni fisse e viene adattato allo schermo.

/**
 * @typedef {Object} View
 * @property {CanvasRenderingContext2D} ctx
 * @property {number} width    larghezza dello schermo in pixel CSS
 * @property {number} height   altezza dello schermo in pixel CSS
 * @property {number} dpr      pixel fisici per pixel CSS
 * @property {{width: number, height: number}} world
 * @property {number} scale    pixel CSS per unità di mondo
 * @property {number} offsetX  posizione dell'angolo del mondo sullo schermo
 * @property {number} offsetY
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{width: number, height: number}} world
 * @returns {View} si aggiorna da solo quando la finestra cambia dimensione
 */
export function setupCanvas(canvas, world) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  /** @type {View} */
  const view = { ctx, width: 0, height: 0, dpr: 1, world, scale: 1, offsetX: 0, offsetY: 0 };

  const resize = () => {
    view.dpr = window.devicePixelRatio || 1;
    view.width = canvas.clientWidth;
    view.height = canvas.clientHeight;
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
    view.scale = Math.min(view.width / world.width, view.height / world.height);
    view.offsetX = (view.width - world.width * view.scale) / 2;
    view.offsetY = (view.height - world.height * view.scale) / 2;
  };

  window.addEventListener('resize', resize);
  resize();
  return view;
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
