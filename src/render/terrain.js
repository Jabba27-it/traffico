// Disegno del terreno: colli sfumati, ville con gli alberi, mura tratteggiate,
// monumenti con una piccola icona, e i nomi di ville e monumenti.

import { STYLE } from './style.js';
import { traceSmoothClosed } from './roads.js';

/** @typedef {import('../sim/terrain.js').Terrain} Terrain */
/** @typedef {{x: number, y: number}} Point */

/** Distanza fra un albero e l'altro nelle ville. */
const TREE_SPACING = 15;

/**
 * Tutto ciò che sta sotto l'acqua e le strade (i monumenti no: vanno sopra l'acqua).
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
}

/**
 * I monumenti, dopo l'acqua: una riva disegnata morbida non li copre mai.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Terrain} terrain
 */
export function drawMonuments(ctx, terrain) {
  for (const m of terrain.monuments) drawMonument(ctx, m);
}

/** @typedef {{x: number, y: number, width: number, height: number}} Box */

/**
 * I nomi dei monumenti (sotto l'icona) e delle ville (al centro), sempre della
 * stessa grandezza sullo schermo anche quando la vista si allarga. Un nome non
 * si scrive sopra un altro né sopra stazioni, code e nomi delle stazioni: se il
 * suo posto è occupato prova sopra o di lato, e se non c'è spazio si salta.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Terrain} terrain
 * @param {number} scale
 * @param {Box[]} [taken]  spazio già occupato (stazioni e loro nomi)
 */
export function drawTerrainNames(ctx, terrain, scale, taken = []) {
  const placed = [...taken];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = 'rgba(239, 229, 211, 0.85)';

  const monumentFont = `600 ${9 * scale}px system-ui, sans-serif`;
  ctx.font = monumentFont;
  ctx.fillStyle = STYLE.monumentLabel;
  for (const m of terrain.monuments) {
    if (!m.name) continue;
    const w = ctx.measureText(m.name).width + 4 * scale;
    const h = 11 * scale;
    const below = (m.icon === 'circo' ? m.radius * 0.5 : m.radius) + 3 + h / 2;
    const gap = m.radius + 4 + w / 2;
    // sotto, sopra, a destra, a sinistra dell'icona
    const spots = [[0, below], [0, -m.radius - 3 - h / 2], [gap, 0], [-gap, 0]];
    writeWhereFree(ctx, m.name, m.x, m.y, spots, w, h, placed);
  }

  ctx.font = `italic 600 ${10 * scale}px system-ui, sans-serif`;
  ctx.fillStyle = STYLE.parkLabel;
  for (const v of terrain.villas) {
    if (!v.name) continue;
    const cx = v.points.reduce((a, p) => a + p.x, 0) / v.points.length;
    const cy = v.points.reduce((a, p) => a + p.y, 0) / v.points.length;
    const w = ctx.measureText(v.name).width + 4 * scale;
    const h = 12 * scale;
    // al centro, poi un po' più su o più giù dentro il parco
    writeWhereFree(ctx, v.name, cx, cy, [[0, 0], [0, -h], [0, h], [0, -2 * h], [0, 2 * h]], w, h, placed);
  }
}

/**
 * Scrive il testo nel primo posto libero fra quelli proposti e lo segna come occupato.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number[][]} spots  spostamenti [dx, dy] del centro del testo, in ordine di preferenza
 * @param {number} w
 * @param {number} h
 * @param {Box[]} placed
 */
function writeWhereFree(ctx, text, x, y, spots, w, h, placed) {
  for (const [dx, dy] of spots) {
    const box = { x: x + dx - w / 2, y: y + dy - h / 2, width: w, height: h };
    if (placed.some((b) => overlaps(b, box))) continue;
    placed.push(box);
    ctx.strokeText(text, x + dx, y + dy);
    ctx.fillText(text, x + dx, y + dy);
    return;
  }
}

/**
 * @param {Box} a
 * @param {Box} b
 */
function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
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
 * Serve anche al menu, per il monumento simbolo di ogni città.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{icon: string, x: number, y: number, radius: number}} m
 */
export function drawMonument(ctx, m) {
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
  // Sulla mappa le icone sono piccole; nel menu sono grandi e il tratto cresce con loro.
  ctx.lineWidth = Math.max(1.6, r * 0.11);
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
    case 'grattacielo': // visto dall'alto: tre piani che si restringono e l'antenna
      for (const k of [1, 0.66, 0.33]) ctx.rect(x - s * k, y - s * k, s * k * 2, s * k * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'stadio': // tribune ovali e il diamante del campo
      ctx.ellipse(x, y, s, s * 0.75, 0, 0, Math.PI * 2);
      ctx.moveTo(x, y - s * 0.45);
      ctx.lineTo(x + s * 0.45, y);
      ctx.lineTo(x, y + s * 0.45);
      ctx.lineTo(x - s * 0.45, y);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'statua': { // figura con la fiaccola alzata e la corona a raggi
      const hx = x - s * 0.1;
      const hy = y - s * 0.4;
      ctx.moveTo(x - s * 0.45, y + s * 0.95);
      ctx.lineTo(hx - s * 0.2, y - s * 0.2);
      ctx.lineTo(hx + s * 0.2, y - s * 0.2);
      ctx.lineTo(x + s * 0.3, y + s * 0.95);
      ctx.closePath();
      ctx.moveTo(hx + s * 0.17, hy);
      ctx.arc(hx, hy, s * 0.17, 0, Math.PI * 2);
      ctx.moveTo(hx + s * 0.15, y - s * 0.15);
      ctx.lineTo(x + s * 0.45, y - s * 0.9);
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * (1.1 + k * 0.2);
        ctx.moveTo(hx + Math.cos(a) * s * 0.24, hy + Math.sin(a) * s * 0.24);
        ctx.lineTo(hx + Math.cos(a) * s * 0.42, hy + Math.sin(a) * s * 0.42);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + s * 0.48, y - s * 1.0, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'vele': // tre gusci a vela, uno dietro l'altro
      for (let k = 0; k < 3; k++) {
        const bx = x - s * 0.8 + k * s * 0.6;
        ctx.moveTo(bx, y + s * 0.5);
        ctx.quadraticCurveTo(bx + s * 0.1, y - s * (0.5 + k * 0.15), bx + s * 0.75, y - s * (0.6 + k * 0.15));
        ctx.quadraticCurveTo(bx + s * 0.55, y, bx + s * 0.6, y + s * 0.5);
      }
      ctx.moveTo(x - s, y + s * 0.5);
      ctx.lineTo(x + s, y + s * 0.5);
      ctx.stroke();
      break;
    case 'aereo': // sagoma vista dall'alto: fusoliera, ali e coda
      ctx.moveTo(x, y - s);
      ctx.lineTo(x, y + s);
      ctx.moveTo(x - s * 0.9, y + s * 0.05);
      ctx.lineTo(x, y - s * 0.3);
      ctx.lineTo(x + s * 0.9, y + s * 0.05);
      ctx.moveTo(x - s * 0.4, y + s * 0.85);
      ctx.lineTo(x, y + s * 0.65);
      ctx.lineTo(x + s * 0.4, y + s * 0.85);
      ctx.stroke();
      break;
    case 'anfiteatro': // anello ovale con le arcate, un lato più basso
      ctx.ellipse(x, y, s * 1.05, s * 0.8, 0, 0, Math.PI * 2);
      ctx.moveTo(x + s * 0.55, y);
      ctx.ellipse(x, y, s * 0.55, s * 0.36, 0, 0, Math.PI * 2);
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5;
        ctx.moveTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.42);
        ctx.lineTo(x + Math.cos(a) * s * 1.0, y + Math.sin(a) * s * 0.76);
      }
      ctx.stroke();
      break;
    case 'cristo': // figura a braccia aperte su un piedistallo
      ctx.arc(x, y - s * 0.75, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.95, y - s * 0.42);
      ctx.lineTo(x + s * 0.95, y - s * 0.42);
      ctx.moveTo(x, y - s * 0.55);
      ctx.lineTo(x - s * 0.18, y + s * 0.55);
      ctx.lineTo(x + s * 0.18, y + s * 0.55);
      ctx.closePath();
      ctx.moveTo(x - s * 0.35, y + s * 0.8);
      ctx.lineTo(x + s * 0.35, y + s * 0.8);
      ctx.stroke();
      break;
    case 'moschea': // cupola su una base e due minareti appuntiti
      ctx.arc(x, y + s * 0.15, s * 0.5, Math.PI, 0);
      ctx.rect(x - s * 0.6, y + s * 0.15, s * 1.2, s * 0.5);
      for (const k of [-1, 1]) {
        ctx.moveTo(x + k * s * 0.9, y + s * 0.65);
        ctx.lineTo(x + k * s * 0.9, y - s * 0.55);
        ctx.lineTo(x + k * s * 0.9, y - s * 0.95);
      }
      ctx.moveTo(x, y - s * 0.35);
      ctx.lineTo(x, y - s * 0.6);
      ctx.stroke();
      break;
    case 'torre': // torre tonda col tetto a punta
      ctx.rect(x - s * 0.35, y - s * 0.2, s * 0.7, s * 0.95);
      ctx.moveTo(x - s * 0.5, y - s * 0.2);
      ctx.lineTo(x, y - s * 0.95);
      ctx.lineTo(x + s * 0.5, y - s * 0.2);
      ctx.closePath();
      ctx.moveTo(x - s * 0.12, y + s * 0.15);
      ctx.lineTo(x - s * 0.12, y + s * 0.4);
      ctx.moveTo(x + s * 0.12, y + s * 0.15);
      ctx.lineTo(x + s * 0.12, y + s * 0.4);
      ctx.stroke();
      break;
    case 'forme': // le tre forme delle stazioni
      ctx.arc(x - s * 0.55, y + s * 0.35, s * 0.32, 0, Math.PI * 2);
      ctx.rect(x + s * 0.25, y + s * 0.05, s * 0.6, s * 0.6);
      ctx.moveTo(x - s * 0.3, y - s * 0.15);
      ctx.lineTo(x, y - s * 0.75);
      ctx.lineTo(x + s * 0.3, y - s * 0.15);
      ctx.closePath();
      ctx.fill();
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
