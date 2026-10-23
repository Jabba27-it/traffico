// Schermata iniziale: nome del gioco ed elenco dei livelli con stelle e record.

import { starsHtml } from './hud.js';
import { loadRecord } from './records.js';
import { drawMonument } from '../render/terrain.js';

/** Lato in pixel del monumento simbolo disegnato in ogni scheda. */
const ICON_SIZE = 64;

/**
 * @typedef {Object} LevelEntry  una riga di levels/indice.json
 * @property {string} file
 * @property {string} name
 * @property {string} description
 * @property {string} icon  icona del monumento simbolo della città (come i monumenti sulla mappa)
 */

/** Nome provvisorio: quello vero, originale, è ancora da scegliere. */
export const GAME_TITLE = 'Traffico';

/**
 * @param {HTMLElement} parent
 * @param {LevelEntry[]} levels
 * @param {(file: string) => void} onPick
 */
export function showMenu(parent, levels, onPick) {
  const root = document.createElement('div');
  root.className = 'menu';

  const title = document.createElement('h1');
  title.textContent = GAME_TITLE;
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Scegli una città';
  root.append(title, subtitle);

  for (const level of levels) {
    const record = loadRecord(level.file);
    const card = document.createElement('button');
    card.className = 'menu-card';
    const name = document.createElement('div');
    name.className = 'menu-name';
    name.textContent = level.name;
    const description = document.createElement('div');
    description.className = 'menu-description';
    description.textContent = level.description;
    const result = document.createElement('div');
    result.className = 'menu-record';
    result.innerHTML = `${starsHtml(record.stars, record.platinum || undefined)} <span>${record.score > 0 ? `Record ${record.score}` : 'Mai giocato'}</span>`;
    card.append(name, description, result);
    if (level.icon) card.appendChild(monumentIcon(level.icon));
    card.addEventListener('click', () => onPick(level.file));
    root.appendChild(card);
  }
  parent.appendChild(root);
}

/**
 * Il monumento simbolo della città, disegnato come sulla mappa ma più grande.
 * @param {string} icon
 */
function monumentIcon(icon) {
  const canvas = document.createElement('canvas');
  canvas.className = 'menu-icon';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.height = ICON_SIZE * dpr;
  canvas.style.width = canvas.style.height = `${ICON_SIZE}px`;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawMonument(ctx, { icon, x: ICON_SIZE / 2, y: ICON_SIZE / 2, radius: ICON_SIZE / 2 - 3 });
  return canvas;
}

/**
 * Legge e controlla levels/indice.json.
 * @param {any} json
 * @returns {LevelEntry[]}
 */
export function parseIndex(json) {
  if (!Array.isArray(json?.livelli)) throw new Error('levels/indice.json deve avere una lista "livelli"');
  return json.livelli.map((/** @type {any} */ l, /** @type {number} */ i) => {
    if (typeof l?.file !== 'string' || !/^[a-z0-9_-]+$/.test(l.file)) {
      throw new Error(`Livello ${i + 1} dell'indice: "file" deve essere un nome come "roma"`);
    }
    return { file: l.file, name: String(l.nome ?? l.file), description: String(l.descrizione ?? ''), icon: String(l.icona ?? '') };
  });
}
