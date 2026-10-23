// Acqua della mappa: fiumi (linee con una larghezza), mare (aree chiuse dove non
// si costruisce) e baie (aree chiuse che si attraversano coi ponti).

import { closestPointOnSegment, distance } from './geometry.js';

/** @typedef {{x: number, y: number}} Point */

/**
 * @typedef {Object} River
 * @property {'river'} kind
 * @property {number} width
 * @property {Point[]} points  la linea centrale del fiume
 */

/**
 * @typedef {Object} Sea
 * @property {'sea'} kind
 * @property {Point[]} points  il contorno dell'area, chiuso da solo
 * @property {boolean} beach   true se la riva è una spiaggia (false per porti e baie)
 */

/**
 * Una baia o un porto dalla forma libera: si disegna come il mare ma si
 * attraversa coi ponti, come un fiume largo `width`.
 * @typedef {Object} Bay
 * @property {'bay'} kind
 * @property {Point[]} points  il contorno dell'area, chiuso da solo
 * @property {number} width    larghezza di riferimento per la lunghezza dei ponti
 */

/** @typedef {River | Sea | Bay} Water */

/**
 * Distanza di p dalla riva più vicina: negativa se p è in acqua.
 * @param {Water[]} waters
 * @param {Point} p
 */
export function distanceToWater(waters, p) {
  let best = Infinity;
  for (const w of waters) best = Math.min(best, w.kind === 'river' ? riverDistance(w, p) : seaDistance(w, p));
  return best;
}

/**
 * @param {Water[]} waters
 * @param {Point} p
 */
export function isInWater(waters, p) {
  return distanceToWater(waters, p) < 0;
}

/**
 * Lunghezza della parte in acqua della spezzata, misurata a piccoli passi.
 * @param {Water[]} waters
 * @param {Point[]} points
 */
export function lengthInWater(waters, points) {
  const SUBSTEPS = 8;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const step = distance(a, b) / SUBSTEPS;
    for (let k = 0; k < SUBSTEPS; k++) {
      const t = (k + 0.5) / SUBSTEPS;
      if (isInWater(waters, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) total += step;
    }
  }
  return total;
}

/**
 * Somma delle larghezze dei fiumi e delle baie che la spezzata tocca (0 se
 * nessuno): un ponte che passa dove una baia si apre sul fiume attraversa due
 * acque di fila.
 * @param {Water[]} waters
 * @param {Point[]} points
 */
export function riverWidthsAlong(waters, points) {
  let total = 0;
  for (const w of waters) {
    if (w.kind === 'river' && points.some((p) => riverDistance(w, p) < 0)) total += w.width;
    if (w.kind === 'bay' && points.some((p) => seaDistance(w, p) < 0)) total += w.width;
  }
  return total;
}

/**
 * true se la spezzata entra nel mare: lì non si costruiscono ponti.
 * @param {Water[]} waters
 * @param {Point[]} points
 */
export function touchesSea(waters, points) {
  return waters.some((w) => w.kind === 'sea' && points.some((p) => seaDistance(w, p) < 0));
}

/**
 * @param {River} w
 * @param {Point} p
 */
function riverDistance(w, p) {
  let best = Infinity;
  for (let i = 1; i < w.points.length; i++) {
    const c = closestPointOnSegment(p, w.points[i - 1], w.points[i]);
    best = Math.min(best, distance(c, p) - w.width / 2);
  }
  return best;
}

/**
 * Distanza dal contorno del mare o della baia, negativa se p è dentro.
 * @param {Sea | Bay} w
 * @param {Point} p
 */
function seaDistance(w, p) {
  let edge = Infinity;
  let inside = false;
  const pts = w.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    edge = Math.min(edge, distance(closestPointOnSegment(p, a, b), p));
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside ? -edge : edge;
}

/** Lato delle celle con cui si divide la mappa in terre separate dall'acqua. */
const LAND_CELL = 10;

/**
 * @typedef {Object} LandMap  la mappa divisa in terre: ogni isola o riva ha un numero
 * @property {number} cols
 * @property {number} rows
 * @property {Int32Array} labels  numero della terra di ogni cella, -1 per l'acqua
 */

/**
 * Divide il mondo in terre: celle di terra che si toccano (non in diagonale,
 * così un fiume stretto separa comunque) hanno lo stesso numero.
 * @param {Water[]} waters
 * @param {{width: number, height: number}} world
 * @returns {LandMap}
 */
export function landMap(waters, world) {
  const cols = Math.ceil(world.width / LAND_CELL);
  const rows = Math.ceil(world.height / LAND_CELL);
  const labels = new Int32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { x: (c + 0.5) * LAND_CELL, y: (r + 0.5) * LAND_CELL };
      labels[r * cols + c] = distanceToWater(waters, p) < 0 ? -1 : -2;
    }
  }
  let next = 0;
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== -2) continue;
    const stack = [start];
    labels[start] = next;
    while (stack.length) {
      const i = /** @type {number} */ (stack.pop());
      const c = i % cols;
      const neighbours = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols];
      for (const j of neighbours) {
        if (j < 0 || j >= labels.length || labels[j] !== -2) continue;
        labels[j] = next;
        stack.push(j);
      }
    }
    next++;
  }
  return { cols, rows, labels };
}

/**
 * Il numero della terra su cui sta p (-1 in acqua). Un punto sulla riva prende
 * la terra della cella di terra più vicina.
 * @param {LandMap} map
 * @param {Point} p
 */
export function landOf(map, p) {
  const c0 = Math.max(0, Math.min(map.cols - 1, Math.floor(p.x / LAND_CELL)));
  const r0 = Math.max(0, Math.min(map.rows - 1, Math.floor(p.y / LAND_CELL)));
  for (let d = 0; d <= 3; d++) {
    for (let r = r0 - d; r <= r0 + d; r++) {
      for (let c = c0 - d; c <= c0 + d; c++) {
        if (r < 0 || c < 0 || r >= map.rows || c >= map.cols) continue;
        const label = map.labels[r * map.cols + c];
        if (label >= 0) return label;
      }
    }
  }
  return -1;
}

/** @type {WeakMap<object, LandMap>} terre di ogni livello, calcolate una volta */
const landCache = new WeakMap();

/**
 * Le terre del livello (rive e isole), calcolate la prima volta che servono.
 * @param {{waters: Water[], world: {width: number, height: number}}} level
 */
export function landsOf(level) {
  let map = landCache.get(level);
  if (!map) {
    map = landMap(level.waters, level.world);
    landCache.set(level, map);
  }
  return map;
}

/** Celle sotto cui una terra è solo uno scoglio: lì non nascono stazioni. */
const SMALL_LAND = 150;

/**
 * Quante terre "vere" (rive e isole abbastanza grandi da avere stazioni) ci sono.
 * Per collegarle tutte servono almeno questo numero meno uno di ponti.
 * @param {{waters: Water[], world: {width: number, height: number}}} level
 */
export function countLands(level) {
  const map = landsOf(level);
  /** @type {Map<number, number>} */
  const cells = new Map();
  for (const l of map.labels) if (l >= 0) cells.set(l, (cells.get(l) ?? 0) + 1);
  return [...cells.values()].filter((n) => n >= SMALL_LAND).length;
}
