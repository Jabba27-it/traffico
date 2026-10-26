// Pop-up "Nuova stazione": resta finché non lo si tocca. Se ne arriva un altro
// prende il posto del precedente, così non si accumulano.

import { SHAPE_COLORS, traceShape } from '../render/stations.js';

/** @typedef {import('../sim/stations.js').Station} Station */

const ICON_SIZE = 28;

/**
 * @param {HTMLElement} parent
 * @param {Station} station
 */
export function showStationPopup(parent, station) {
  parent.querySelector('.station-popup')?.remove();
  const box = document.createElement('div');
  box.className = 'station-popup';

  const icon = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  icon.width = ICON_SIZE * dpr;
  icon.height = ICON_SIZE * dpr;
  icon.style.width = `${ICON_SIZE}px`;
  icon.style.height = `${ICON_SIZE}px`;
  const ctx = /** @type {CanvasRenderingContext2D} */ (icon.getContext('2d'));
  ctx.scale(dpr, dpr);
  ctx.beginPath();
  traceShape(ctx, station.shape, ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE * 0.4);
  ctx.fillStyle = SHAPE_COLORS[station.shape];
  ctx.fill();

  const text = document.createElement('div');
  const label = document.createElement('div');
  label.className = 'station-popup-label';
  label.textContent = { stadio: 'Nuovo stadio', porto: 'Nuovo porto', aeroporto: 'Nuovo aeroporto' }[station.kind ?? ''] ?? 'Nuova stazione';
  const name = document.createElement('div');
  name.className = 'station-popup-name';
  name.textContent = station.name ?? station.shape;
  text.append(label, name);
  if (station.bridgeGift) {
    const gift = document.createElement('div');
    gift.className = 'station-popup-label';
    gift.textContent = 'Riva nuova: +1 ponte';
    text.appendChild(gift);
  }

  const close = document.createElement('div');
  close.className = 'station-popup-close';
  close.textContent = '✕';

  box.append(icon, text, close);
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  box.addEventListener('click', () => box.remove());
  parent.appendChild(box);
}
