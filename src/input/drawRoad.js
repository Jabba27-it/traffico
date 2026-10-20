// Gesti sulle strade:
// - trascina = strada: raccoglie i punti del dito e, al rilascio, li passa
//   alla simulazione che crea strade e incroci;
// - pressione lunga = rimuovi: il pezzo di strada sotto il dito si evidenzia
//   e, al rilascio, viene rimosso. Allontanando il dito si annulla.

import { distance } from '../sim/geometry.js';
import { STATION_RADIUS } from '../sim/stations.js';

/** @typedef {import('../sim/graph.js').RoadGraph} RoadGraph */
/** @typedef {import('../sim/roadEditing.js').RoadPiece} RoadPiece */
/** @typedef {{x: number, y: number}} Point */

/**
 * @typedef {Object} RoadEditor
 * @property {(points: Point[], snapRadius: number) => void} build
 * @property {(x: number, y: number) => RoadPiece | null} findPiece
 * @property {(piece: RoadPiece) => void} remove
 * @property {() => boolean} active  false quando i gesti sulle strade sono sospesi
 */

/** Distanza minima fra due punti campionati del tratto. */
const SAMPLE_SPACING = 24;
/** Entro questa distanza un estremo del tratto si aggancia a una strada esistente. */
const SNAP_RADIUS = 28;
/** Quanto a lungo il dito deve restare fermo per rimuovere, in millisecondi. */
const HOLD_TIME = 450;
/** Il dito è "fermo" se non si sposta più di così. */
const HOLD_TOLERANCE = 10;
/** Allontanando il dito di così dal punto premuto la rimozione si annulla. */
const CANCEL_DISTANCE = 40;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {RoadGraph} graph
 * @param {(x: number, y: number) => Point} toWorld  da pixel del canvas a coordinate di mondo
 * @param {RoadEditor} editor
 * @returns {{ preview: () => Point[], removal: () => RoadPiece | null, finger: () => Point | null }}
 *   i punti del tratto in corso, il pezzo che sta per essere rimosso e la posizione del dito
 */
export function attachRoadDrawing(canvas, graph, toWorld, editor) {
  /** @type {number | null} */
  let activePointer = null;
  /** @type {Point[]} */
  let points = [];
  /** @type {Point | null} */
  let cursor = null;
  /** @type {Point | null} dove è iniziata la pressione */
  let pressedAt = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let holdTimer = null;
  /** @type {RoadPiece | null} */
  let removal = null;
  let removalCancelled = false;

  /** @param {PointerEvent} e */
  const toPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return toWorld(e.clientX - r.left, e.clientY - r.top);
  };

  canvas.addEventListener('pointerdown', (e) => {
    // Un dito solo: i gesti a più dita arriveranno più avanti.
    if (activePointer !== null || !editor.active()) return;
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = toPoint(e);
    const snap =
      graph.findNodeNear(p.x, p.y, STATION_RADIUS + 8, true) ??
      graph.findNodeNear(p.x, p.y, SNAP_RADIUS) ??
      graph.findEdgeNear(p.x, p.y, SNAP_RADIUS);
    points = [snap ? { x: snap.x, y: snap.y } : p];
    cursor = p;
    pressedAt = p;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (!pressedAt) return;
      removal = editor.findPiece(pressedAt.x, pressedAt.y);
    }, HOLD_TIME);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointer) return;
    const p = toPoint(e);
    cursor = p;
    if (removal || removalCancelled) {
      if (pressedAt && distance(p, pressedAt) > CANCEL_DISTANCE) {
        removal = null;
        removalCancelled = true;
      }
      return;
    }
    if (holdTimer && pressedAt && distance(p, pressedAt) > HOLD_TOLERANCE) stopHold();
    if (distance(p, points[points.length - 1]) >= SAMPLE_SPACING) points.push(p);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activePointer) return;
    if (removal) {
      editor.remove(removal);
    } else if (!removalCancelled) {
      const p = toPoint(e);
      if (distance(p, points[points.length - 1]) >= SAMPLE_SPACING / 2) points.push(p);
      editor.build(points, SNAP_RADIUS);
    }
    reset();
  });

  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activePointer) reset();
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function stopHold() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  }

  function reset() {
    stopHold();
    activePointer = null;
    points = [];
    cursor = null;
    pressedAt = null;
    removal = null;
    removalCancelled = false;
  }

  return {
    // Mentre si aspetta la pressione lunga, con il dito ancora fermo, niente anteprima.
    preview: () =>
      cursor && points.length && !removal && !removalCancelled && !(holdTimer && points.length === 1)
        ? [...points, cursor]
        : [],
    removal: () => removal,
    finger: () => cursor,
  };
}
