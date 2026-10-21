// Acqua della mappa: fiumi (linee con una larghezza) e mare (aree chiuse).

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
 */

/** @typedef {River | Sea} Water */

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
 * Il fiume più largo fra quelli che toccano la spezzata (0 se nessuno).
 * @param {Water[]} waters
 * @param {Point[]} points
 */
export function widestWaterAlong(waters, points) {
  let widest = 0;
  for (const w of waters) {
    if (w.kind === 'river' && points.some((p) => riverDistance(w, p) < 0)) widest = Math.max(widest, w.width);
  }
  return widest;
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
 * Distanza dal contorno del mare, negativa se p è dentro.
 * @param {Sea} w
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

/**
 * Da che parte del primo fiume sta p: 1 o -1 (0 se il livello non ha fiumi).
 * Serve a tenere le stazioni di una stessa forma sulla stessa riva.
 * @param {Water[]} waters
 * @param {Point} p
 */
export function riverSide(waters, p) {
  const river = waters.find((w) => w.kind === 'river');
  if (!river) return 0;
  let best = Infinity;
  let side = 0;
  for (let i = 1; i < river.points.length; i++) {
    const a = river.points[i - 1];
    const b = river.points[i];
    const c = closestPointOnSegment(p, a, b);
    const d = distance(c, p);
    if (d < best) {
      best = d;
      side = Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) || 1;
    }
  }
  return side;
}
