// Calcoli geometrici puri su punti e segmenti.

/** @typedef {{x: number, y: number}} Point */

/**
 * @param {Point} a
 * @param {Point} b
 */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Punto d'incontro fra i segmenti p1-p2 e p3-p4, oppure null.
 * `t` e `u` dicono a che frazione di ciascun segmento cade l'incontro (0..1).
 * @param {Point} p1
 * @param {Point} p2
 * @param {Point} p3
 * @param {Point} p4
 * @returns {{x: number, y: number, t: number, u: number} | null}
 */
export function segmentIntersection(p1, p2, p3, p4) {
  const rx = p2.x - p1.x;
  const ry = p2.y - p1.y;
  const sx = p4.x - p3.x;
  const sy = p4.y - p3.y;
  const d = rx * sy - ry * sx;
  if (Math.abs(d) < 1e-9) return null; // paralleli
  const qx = p3.x - p1.x;
  const qy = p3.y - p1.y;
  const t = (qx * sy - qy * sx) / d;
  const u = (qx * ry - qy * rx) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * rx, y: p1.y + t * ry, t, u };
}

/**
 * Punto del segmento a-b più vicino a p.
 * @param {Point} p
 * @param {Point} a
 * @param {Point} b
 * @returns {{x: number, y: number, t: number}}
 */
export function closestPointOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy, t };
}
