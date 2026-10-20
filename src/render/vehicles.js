// Disegno dei veicoli visti dall'alto: automobili, furgoni e autobus orientati
// nel senso di marcia, col colore della forma di destinazione e la forma sul tetto.

import { SHAPE_COLORS, traceShape } from './stations.js';

/** @typedef {import('../sim/vehicles.js').Vehicle} Vehicle */

const GLASS = 'rgba(30, 34, 44, 0.55)';
const OUTLINE = 'rgba(30, 34, 44, 0.35)';
const ROOF_MARK = '#ffffff';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Vehicle[]} vehicles
 */
export function drawVehicles(ctx, vehicles) {
  for (const v of vehicles) {
    const { x, y, dx, dy } = v.pose;
    ctx.save();
    // Asse x locale = senso di marcia: il muso del veicolo è verso +x.
    ctx.transform(dx, dy, -dy, dx, x, y);
    drawBody(ctx, v);
    ctx.restore();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Vehicle} v
 */
function drawBody(ctx, v) {
  const { length: L, width: W, name } = v.type;
  const color = SHAPE_COLORS[v.shape];
  const half = L / 2;

  ctx.fillStyle = color;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(-half, -W / 2, L, W, name === 'auto' ? 2.5 : 1.5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = GLASS;
  if (name === 'autobus') {
    // Parabrezza davanti e una fila di finestrini sui lati.
    ctx.fillRect(half - 2.2, -W / 2 + 1, 1.4, W - 2);
    for (let i = 0; i < 4; i++) {
      const wx = -half + 2 + i * 3.8;
      ctx.fillRect(wx, -W / 2 + 0.6, 2.6, 0.9);
      ctx.fillRect(wx, W / 2 - 1.5, 2.6, 0.9);
    }
  } else if (name === 'furgone') {
    // Cabina davanti, cassone dietro.
    ctx.fillRect(half - 3.6, -W / 2 + 1, 1.6, W - 2);
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(half - 4.8, -W / 2);
    ctx.lineTo(half - 4.8, W / 2);
    ctx.stroke();
  } else {
    // Parabrezza e lunotto.
    ctx.fillRect(half - 3.4, -W / 2 + 1, 1.6, W - 2);
    ctx.fillRect(-half + 1.4, -W / 2 + 1.2, 1.2, W - 2.4);
  }

  // La forma di destinazione sul tetto.
  const roofX = name === 'furgone' ? -1.5 : name === 'autobus' ? -1 : -0.6;
  ctx.fillStyle = ROOF_MARK;
  ctx.beginPath();
  traceShape(ctx, v.shape, roofX, 0, W * 0.32);
  ctx.fill();
}
