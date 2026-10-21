// Il cerchio che pulsa dove il tutorial chiede di agire.

import { STYLE } from './style.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}} p
 * @param {number} time   secondi, per la pulsazione
 * @param {number} scale  ingrandimento, per restare visibile quando la vista è ampia
 */
export function drawHint(ctx, p, time, scale) {
  const t = (time * 1.2) % 1;
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = STYLE.hint;
  for (const phase of [0, 0.5]) {
    const k = (t + phase) % 1;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (10 + k * 26) * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
