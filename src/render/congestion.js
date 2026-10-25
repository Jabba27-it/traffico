// Disegno della congestione: un anello intorno alla stazione che va dal verde
// al rosso col carico e, se la stazione è sovraccarica, un arco che si riempie
// fino alla sconfitta. Lo stesso, intorno ai veicoli fermi da troppo, per gli ingorghi.

import { STATION_RADIUS } from '../sim/stations.js';
import { stationLoad } from '../sim/congestion.js';

/** @typedef {import('../sim/stations.js').Station} Station */

const RING_RADIUS = STATION_RADIUS + 7;
const RING_WIDTH = 4;
const COUNTDOWN_COLOR = '#3d4047';
/** Raggio del cerchio d'allarme intorno a un veicolo fermo in un ingorgo. */
const JAM_RADIUS = 13;
const JAM_FILL = 'rgba(224, 69, 58, 0.25)';
const JAM_RING = 'rgb(224, 69, 58)';

/** Verde, giallo, rosso: il colore dell'anello in base al carico (0..1). */
const STOPS = [
  { at: 0, rgb: [72, 176, 90] },
  { at: 0.5, rgb: [242, 197, 61] },
  { at: 1, rgb: [224, 69, 58] },
];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Station[]} stations
 * @param {number} tolerance  secondi di sovraccarico che portano alla sconfitta
 * @param {number} time       secondi di gioco, per la pulsazione
 */
export function drawCongestion(ctx, stations, tolerance, time) {
  ctx.lineCap = 'round';
  ctx.lineWidth = RING_WIDTH;
  for (const s of stations) {
    const load = stationLoad(s);
    if (load === 0 && s.overload === 0) continue;
    const overloaded = load > 1;

    ctx.globalAlpha = overloaded ? 0.6 + 0.4 * Math.sin(time * 8) ** 2 : 1;
    ctx.strokeStyle = ringColor(Math.min(1, load));
    ctx.beginPath();
    ctx.arc(s.x, s.y, RING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (s.overload > 0) {
      const start = -Math.PI / 2;
      ctx.strokeStyle = COUNTDOWN_COLOR;
      ctx.beginPath();
      ctx.arc(s.x, s.y, RING_RADIUS, start, start + (s.overload / tolerance) * Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** @param {number} load  0..1 */
function ringColor(load) {
  for (let i = 1; i < STOPS.length; i++) {
    const a = STOPS[i - 1];
    const b = STOPS[i];
    if (load <= b.at) {
      const t = (load - a.at) / (b.at - a.at);
      const [r, g, bl] = a.rgb.map((c, k) => Math.round(c + (b.rgb[k] - c) * t));
      return `rgb(${r}, ${g}, ${bl})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1].rgb.join(', ')})`;
}

/**
 * Ingorghi in allarme: un cerchio rosso che pulsa intorno al veicolo fermo e
 * un arco che si riempie fino alla sconfitta, come per le stazioni piene.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number, progress: number}[]} jams
 * @param {number} time  secondi, per la pulsazione
 */
export function drawJams(ctx, jams, time) {
  ctx.lineCap = 'round';
  for (const j of jams) {
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(time * 8) ** 2;
    ctx.fillStyle = JAM_FILL;
    ctx.beginPath();
    ctx.arc(j.x, j.y, JAM_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = RING_WIDTH;
    ctx.strokeStyle = JAM_RING;
    ctx.beginPath();
    ctx.arc(j.x, j.y, JAM_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    const start = -Math.PI / 2;
    ctx.strokeStyle = COUNTDOWN_COLOR;
    ctx.beginPath();
    ctx.arc(j.x, j.y, JAM_RADIUS, start, start + j.progress * Math.PI * 2);
    ctx.stroke();
  }
}
