// Disegno del terreno: colli sfumati, ville con gli alberi, mura tratteggiate,
// monumenti con una piccola icona, e i nomi di ville e monumenti.

import { STYLE } from './style.js';
import { traceSmoothClosed } from './roads.js';

/** @typedef {import('../sim/terrain.js').Terrain} Terrain */
/** @typedef {{x: number, y: number}} Point */

/** Distanza fra un albero e l'altro nelle ville. */
const TREE_SPACING = 15;

/**
 * Tutto ciò che sta sotto l'acqua e le strade.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Terrain} terrain
 */
export function drawGround(ctx, terrain) {
  for (const h of terrain.hills) drawHill(ctx, h);
  for (const v of terrain.villas) drawVilla(ctx, v.points);
  if (terrain.walls.length > 2) {
    ctx.beginPath();
    traceSmoothClosed(ctx, terrain.walls);
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = STYLE.wall;
    ctx.setLineDash([10, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const m of terrain.monuments) drawMonument(ctx, m);
}

/**
 * I nomi delle ville (al centro) e dei monumenti (sotto l'icona), sempre della
 * stessa grandezza sullo schermo anche quando la vista si allarga.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Terrain} terrain
 * @param {number} scale
 */
export function drawTerrainNames(ctx, terrain, scale) {
  ctx.textAlign = 'center';
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = 'rgba(239, 229, 211, 0.85)';
  ctx.font = `italic 600 ${10 * scale}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = STYLE.parkLabel;
  for (const v of terrain.villas) {
    if (!v.name) continue;
    const cx = v.points.reduce((a, p) => a + p.x, 0) / v.points.length;
    const cy = v.points.reduce((a, p) => a + p.y, 0) / v.points.length;
    ctx.strokeText(v.name, cx, cy);
    ctx.fillText(v.name, cx, cy);
  }
  ctx.font = `600 ${9 * scale}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = STYLE.monumentLabel;
  for (const m of terrain.monuments) {
    if (!m.name) continue;
    const y = m.y + (m.icon === 'circo' ? m.radius * 0.5 : m.radius) + 3;
    ctx.strokeText(m.name, m.x, y);
    ctx.fillText(m.name, m.x, y);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number, radius: number}} h
 */
function drawHill(ctx, h) {
  const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.radius);
  g.addColorStop(0, STYLE.hill);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
  ctx.fill();
  // Curve di livello, leggermente schiacciate e spostate: sembrano disegnate a mano.
  ctx.strokeStyle = STYLE.hillLine;
  ctx.lineWidth = 1;
  for (const k of [0.35, 0.6, 0.85]) {
    ctx.beginPath();
    ctx.ellipse(h.x + k * 3, h.y - k * 2, h.radius * k, h.radius * k * 0.82, 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} points
 */
function drawVilla(ctx, points) {
  ctx.beginPath();
  traceSmoothClosed(ctx, points);
  ctx.fillStyle = STYLE.park;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = STYLE.parkEdge;
  ctx.stroke();

  // Alberi su una griglia leggermente sfalsata, solo dentro la villa.
  ctx.save();
  ctx.beginPath();
  traceSmoothClosed(ctx, points);
  ctx.clip();
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  ctx.fillStyle = STYLE.parkTree;
  let row = 0;
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += TREE_SPACING * 0.85, row++) {
    for (let x = Math.min(...xs) + (row % 2) * (TREE_SPACING / 2); x <= Math.max(...xs); x += TREE_SPACING) {
      // Un po' di disordine, sempre uguale da un fotogramma all'altro.
      const jx = Math.sin(x * 12.9898 + y * 78.233) * 3;
      const jy = Math.cos(x * 39.346 + y * 11.135) * 3;
      ctx.beginPath();
      ctx.arc(x + jx, y + jy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Un monumento: una base color travertino e un'icona semplice e originale.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{icon: string, x: number, y: number, radius: number}} m
 */
function drawMonument(ctx, m) {
  const { x, y, radius: r } = m;
  ctx.beginPath();
  if (m.icon === 'circo') ctx.ellipse(x, y, r, r * 0.45, -0.25, 0, Math.PI * 2);
  else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = STYLE.monument;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = STYLE.monumentEdge;
  ctx.stroke();

  ctx.strokeStyle = STYLE.monumentIcon;
  ctx.fillStyle = STYLE.monumentIcon;
  ctx.lineWidth = 1.6;
  const s = r * 0.55;
  ctx.beginPath();
  switch (m.icon) {
    case 'circo': // la pista allungata con la spina al centro
      ctx.ellipse(x, y, r * 0.7, r * 0.22, -0.25, 0, Math.PI * 2);
      ctx.moveTo(x - r * 0.4 * Math.cos(-0.25), y - r * 0.4 * Math.sin(-0.25));
      ctx.lineTo(x + r * 0.4 * Math.cos(-0.25), y + r * 0.4 * Math.sin(-0.25));
      ctx.stroke();
      break;
    case 'castello': // torrione rotondo con merli
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.fillRect(x + Math.cos(a) * s - 1.2, y + Math.sin(a) * s - 1.2, 2.4, 2.4);
      }
      break;
    case 'terme': // grandi arcate
      ctx.rect(x - s, y - s * 0.6, s * 2, s * 1.2);
      ctx.stroke();
      ctx.beginPath();
      for (let k = -1; k <= 1; k++) ctx.arc(x + k * s * 0.62, y + s * 0.2, s * 0.25, Math.PI, 0);
      ctx.stroke();
      break;
    case 'altare': // gradinata con colonnato
      for (let k = 0; k < 3; k++) ctx.rect(x - s + k * s * 0.2, y + s * 0.5 - k * s * 0.35, (s - k * s * 0.2) * 2, s * 0.35);
      ctx.stroke();
      break;
    case 'cupola': // cupola su un tamburo
      ctx.arc(x, y + s * 0.2, s * 0.8, Math.PI, 0);
      ctx.rect(x - s * 0.8, y + s * 0.2, s * 1.6, s * 0.45);
      ctx.moveTo(x, y - s * 0.6);
      ctx.lineTo(x, y - s * 0.95);
      ctx.stroke();
      break;
    default: // colonne sotto un frontone
      ctx.moveTo(x - s, y - s * 0.35);
      ctx.lineTo(x, y - s * 0.85);
      ctx.lineTo(x + s, y - s * 0.35);
      ctx.closePath();
      for (let k = -2; k <= 2; k++) {
        ctx.moveTo(x + k * s * 0.42, y - s * 0.25);
        ctx.lineTo(x + k * s * 0.42, y + s * 0.6);
      }
      ctx.stroke();
  }
}
