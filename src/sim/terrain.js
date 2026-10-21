// Terreno della città: ville (parchi storici) e monumenti, dove non si costruisce,
// colli, dove i veicoli rallentano, e le mura, solo decorative.

import { closestPointOnSegment, distance } from './geometry.js';

/** @typedef {{x: number, y: number}} Point */

/**
 * @typedef {Object} Terrain
 * @property {{name: string, points: Point[]}[]} villas      parchi storici: niente strade né stazioni
 * @property {{name: string, x: number, y: number, radius: number}[]} hills  colli: si va più piano
 * @property {{name: string, icon: string, x: number, y: number, radius: number}[]} monuments  da aggirare
 * @property {Point[]} walls  contorno delle mura (decorativo)
 */

/** @returns {Terrain} */
export function emptyTerrain() {
  return { villas: [], hills: [], monuments: [], walls: [] };
}

/**
 * Se in p non si può costruire, il perché; altrimenti null.
 * @param {Terrain} terrain
 * @param {Point} p
 * @param {number} [margin]  quanto stare lontani dal bordo
 * @returns {'villa' | 'monument' | null}
 */
export function obstacleAt(terrain, p, margin = 0) {
  for (const m of terrain.monuments) if (distance(m, p) < m.radius + margin) return 'monument';
  for (const v of terrain.villas) if (insidePolygon(v.points, p) || (margin > 0 && edgeDistance(v.points, p) < margin)) return 'villa';
  return null;
}

/**
 * Quanto è ripido il terreno in p: 0 in pianura, fino a 1 in cima a un colle.
 * @param {Terrain} terrain
 * @param {Point} p
 */
export function hillAt(terrain, p) {
  let best = 0;
  for (const h of terrain.hills) {
    const d = distance(h, p);
    if (d < h.radius) best = Math.max(best, 1 - d / h.radius);
  }
  return best;
}

/**
 * @param {Point[]} pts
 * @param {Point} p
 */
function insidePolygon(pts, p) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * @param {Point[]} pts
 * @param {Point} p
 */
function edgeDistance(pts, p) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) best = Math.min(best, distance(closestPointOnSegment(p, pts[i], pts[j]), p));
  return best;
}
