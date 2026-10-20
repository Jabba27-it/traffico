// Acqua della mappa: per ora fiumi, cioè linee con una larghezza.

import { closestPointOnSegment, distance } from './geometry.js';

/** @typedef {{x: number, y: number}} Point */

/**
 * @typedef {Object} River
 * @property {'river'} kind
 * @property {number} width
 * @property {Point[]} points  la linea centrale del fiume
 */

/** @typedef {River} Water */

/**
 * Distanza di p dalla riva più vicina: negativa se p è in acqua.
 * @param {Water[]} waters
 * @param {Point} p
 */
export function distanceToWater(waters, p) {
  let best = Infinity;
  for (const w of waters) {
    for (let i = 1; i < w.points.length; i++) {
      const c = closestPointOnSegment(p, w.points[i - 1], w.points[i]);
      best = Math.min(best, distance(c, p) - w.width / 2);
    }
  }
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
    if (points.some((p) => distanceToWater([w], p) < 0)) widest = Math.max(widest, w.width);
  }
  return widest;
}
