// Gesto a due dita: allargare o stringere = zoom, muovere insieme = spostamento.
// Sul computer, per i test, la rotellina del mouse fa lo zoom.

/** @typedef {{x: number, y: number}} Point */

/**
 * @typedef {Object} PinchTarget
 * @property {(x: number, y: number) => Point} toWorld  da pixel del canvas a mondo
 * @property {() => number} zoom
 * @property {(zoom: number, anchor: Point, screen: Point) => void} zoomAround
 *   cambia zoom tenendo il punto di mondo `anchor` sotto la posizione `screen`
 */

/** Quanto zoom per ogni scatto di rotellina. */
const WHEEL_SPEED = 0.0015;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {PinchTarget} target
 */
export function attachPinch(canvas, target) {
  /** @type {Map<number, Point>} posizione sullo schermo di ogni dito appoggiato */
  const fingers = new Map();
  /** @type {{distance: number, zoom: number, anchor: Point} | null} */
  let start = null;

  /** @param {PointerEvent | WheelEvent} e */
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pair = () => {
    const [a, b] = [...fingers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };

  canvas.addEventListener('pointerdown', (e) => {
    fingers.set(e.pointerId, local(e));
    if (fingers.size === 2) {
      const { mid, distance } = pair();
      start = { distance, zoom: target.zoom(), anchor: target.toWorld(mid.x, mid.y) };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, local(e));
    if (!start || fingers.size < 2) return;
    const { mid, distance } = pair();
    // Il punto di mondo che era fra le dita resta fra le dita: così lo stesso
    // gesto fa zoom e spostamento insieme.
    target.zoomAround(start.zoom * (distance / start.distance), start.anchor, mid);
  });

  const lift = (/** @type {PointerEvent} */ e) => {
    fingers.delete(e.pointerId);
    if (fingers.size < 2) start = null;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = local(e);
      target.zoomAround(target.zoom() * Math.exp(-e.deltaY * WHEEL_SPEED), target.toWorld(p.x, p.y), p);
    },
    { passive: false },
  );
}
