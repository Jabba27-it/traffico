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
 * @property {(x: number, y: number, radius: number) => RoadPiece | null} findPiece
 * @property {(piece: RoadPiece) => void} remove
 * @property {() => boolean} active  false quando i gesti sulle strade sono sospesi
 */

// Le distanze legate al dito sono in pixel dello schermo, così valgono a
// qualsiasi zoom; quelle legate alla forma della strada sono in unità di mondo.

/** Distanza minima fra due punti campionati del tratto (mondo). */
const SAMPLE_SPACING = 24;
/** Aggancio minimo di un estremo a una strada esistente (mondo)... */
const SNAP_RADIUS = 28;
/** ...ma mai meno di così sullo schermo: circa la punta di un dito (pixel). */
const SNAP_PX = 22;
/** Quanto a lungo il dito deve restare fermo per rimuovere, in millisecondi. */
const HOLD_TIME = 450;
/** Il dito è "fermo" se non si sposta più di così (pixel). */
const HOLD_TOLERANCE_PX = 10;
/** Allontanando il dito di così dal punto premuto la rimozione si annulla (pixel). */
const CANCEL_PX = 40;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {RoadGraph} graph
 * @param {(x: number, y: number) => Point} toWorld  da pixel del canvas a coordinate di mondo
 * @param {() => number} worldPerPixel  quante unità di mondo vale un pixel, con lo zoom attuale
 * @param {RoadEditor} editor
 * @returns {{ preview: () => Point[], removal: () => RoadPiece | null, finger: () => Point | null }}
 *   i punti del tratto in corso, il pezzo che sta per essere rimosso e la posizione del dito
 */
export function attachRoadDrawing(canvas, graph, toWorld, worldPerPixel, editor) {
  /** @type {Set<number>} tutte le dita appoggiate */
  const touching = new Set();
  /** Con due dita si fa zoom: niente strade finché non si alzano tutte. */
  let multiTouch = false;
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

  const snapRadius = () => Math.max(SNAP_RADIUS, SNAP_PX * worldPerPixel());

  canvas.addEventListener('pointerdown', (e) => {
    touching.add(e.pointerId);
    canvas.setPointerCapture(e.pointerId);
    // Secondo dito: la strada o la rimozione in corso si annulla e parte lo zoom.
    if (touching.size > 1) {
      multiTouch = true;
      reset();
      return;
    }
    if (multiTouch || !editor.active()) return;
    activePointer = e.pointerId;
    const p = toPoint(e);
    const snap =
      graph.findNodeNear(p.x, p.y, Math.max(STATION_RADIUS + 8, snapRadius()), true) ??
      graph.findNodeNear(p.x, p.y, snapRadius()) ??
      graph.findEdgeNear(p.x, p.y, snapRadius());
    points = [snap ? { x: snap.x, y: snap.y } : p];
    cursor = p;
    pressedAt = p;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (!pressedAt) return;
      removal = editor.findPiece(pressedAt.x, pressedAt.y, snapRadius());
    }, HOLD_TIME);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointer) return;
    const p = toPoint(e);
    cursor = p;
    const px = worldPerPixel();
    if (removal || removalCancelled) {
      if (pressedAt && distance(p, pressedAt) > CANCEL_PX * px) {
        removal = null;
        removalCancelled = true;
      }
      return;
    }
    if (holdTimer && pressedAt && distance(p, pressedAt) > HOLD_TOLERANCE_PX * px) stopHold();
    if (distance(p, points[points.length - 1]) >= SAMPLE_SPACING) points.push(p);
  });

  canvas.addEventListener('pointerup', (e) => {
    lift(e);
    if (e.pointerId !== activePointer) return;
    if (removal) {
      editor.remove(removal);
    } else if (!removalCancelled) {
      const p = toPoint(e);
      if (distance(p, points[points.length - 1]) >= SAMPLE_SPACING / 2) points.push(p);
      editor.build(points, snapRadius());
    }
    reset();
  });

  canvas.addEventListener('pointercancel', (e) => {
    lift(e);
    if (e.pointerId === activePointer) reset();
  });

  /** @param {PointerEvent} e */
  function lift(e) {
    touching.delete(e.pointerId);
    if (touching.size === 0) multiTouch = false;
  }

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
