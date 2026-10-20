// Gesto "trascina = strada": raccoglie i punti del dito e, al rilascio,
// li passa al grafo che crea strade e incroci.

import { buildRoad } from '../sim/roadBuilder.js';
import { distance } from '../sim/geometry.js';

/** @typedef {import('../sim/graph.js').RoadGraph} RoadGraph */
/** @typedef {{x: number, y: number}} Point */

/** Distanza minima fra due punti campionati del tratto. */
const SAMPLE_SPACING = 24;
/** Entro questa distanza un estremo del tratto si aggancia a una strada esistente. */
const SNAP_RADIUS = 22;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {RoadGraph} graph
 * @returns {{ preview: () => Point[] }} i punti del tratto in corso, per l'anteprima
 */
export function attachRoadDrawing(canvas, graph) {
  /** @type {number | null} */
  let activePointer = null;
  /** @type {Point[]} */
  let points = [];
  /** @type {Point | null} */
  let cursor = null;

  /** @param {PointerEvent} e */
  const toPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    // Un dito solo: i gesti a più dita arriveranno più avanti.
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = toPoint(e);
    const snap = graph.findNodeNear(p.x, p.y, SNAP_RADIUS) ?? graph.findEdgeNear(p.x, p.y, SNAP_RADIUS);
    points = [snap ? { x: snap.x, y: snap.y } : p];
    cursor = p;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointer) return;
    const p = toPoint(e);
    cursor = p;
    if (distance(p, points[points.length - 1]) >= SAMPLE_SPACING) points.push(p);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activePointer) return;
    const p = toPoint(e);
    if (distance(p, points[points.length - 1]) >= SAMPLE_SPACING / 2) points.push(p);
    buildRoad(graph, points, SNAP_RADIUS);
    reset();
  });

  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activePointer) reset();
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function reset() {
    activePointer = null;
    points = [];
    cursor = null;
  }

  return {
    preview: () => (cursor && points.length ? [...points, cursor] : []),
  };
}
