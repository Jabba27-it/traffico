// Canvas a schermo intero, nitido sugli schermi ad alta densità.

/**
 * @typedef {Object} View
 * @property {CanvasRenderingContext2D} ctx
 * @property {number} width   larghezza in pixel CSS
 * @property {number} height  altezza in pixel CSS
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {View} si aggiorna da solo quando la finestra cambia dimensione
 */
export function setupCanvas(canvas) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  /** @type {View} */
  const view = { ctx, width: 0, height: 0 };

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    view.width = canvas.clientWidth;
    view.height = canvas.clientHeight;
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.height * dpr);
    // Da qui in poi si disegna in pixel CSS.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  window.addEventListener('resize', resize);
  resize();
  return view;
}
