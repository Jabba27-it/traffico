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
  for (const v of terrain.villas) {
    // Si controlla il contorno come si vede, arrotondato: col poligono a spigoli
    // vivi, vicino agli angoli il divieto arrivava ben oltre il verde.
    const outline = smoothOutline(v.points);
    if (insidePolygon(outline, p) || (margin > 0 && edgeDistance(outline, p) < margin)) return 'villa';
  }
  return null;
}

/** @type {WeakMap<Point[], Point[]>} contorni arrotondati già calcolati */
const outlines = new WeakMap();
/** Punti per ogni curva del contorno arrotondato. */
const OUTLINE_STEPS = 8;

/**
 * Il contorno di una villa come si disegna: ogni lato passa per il punto medio e
 * gira attorno al vertice con una curva (come traceSmoothClosed in src/render/roads.js).
 * @param {Point[]} points
 * @returns {Point[]}
 */
export function smoothOutline(points) {
  const cached = outlines.get(points);
  if (cached) return cached;
  const n = points.length;
  const mid = (/** @type {number} */ i) => ({ x: (points[i % n].x + points[(i + 1) % n].x) / 2, y: (points[i % n].y + points[(i + 1) % n].y) / 2 });
  /** @type {Point[]} */
  const out = [];
  for (let i = 1; i <= n; i++) {
    const a = mid(i - 1);
    const c = points[i % n];
    const b = mid(i);
    for (let k = 0; k < OUTLINE_STEPS; k++) {
      const t = k / OUTLINE_STEPS;
      out.push({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });
    }
  }
  outlines.set(points, out);
  return out;
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
