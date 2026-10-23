// Schermata iniziale: nome del gioco ed elenco delle città, tutto in una schermata
// del telefono senza scorrere: per ogni città le stelle del livello e due tasti,
// Livello e Sandbox (col record della sandbox).

import { starsHtml } from './hud.js';
import { loadRecord, SANDBOX_SUFFIX } from './records.js';
import { drawMonument } from '../render/terrain.js';

/** Lato in pixel del monumento simbolo disegnato in ogni scheda. */
const ICON_SIZE = 46;

/**
 * @typedef {Object} LevelEntry  una riga di levels/indice.json
 * @property {string} file
 * @property {string} name
 * @property {string} description
 * @property {string} icon  icona del monumento simbolo della città (come i monumenti sulla mappa)
 * @property {boolean} sandbox  se la città si può giocare anche in sandbox (voce "sandbox", di base sì)
 */

/** Nome provvisorio: quello vero, originale, è ancora da scegliere. */
export const GAME_TITLE = 'Traffico';

/**
 * @param {HTMLElement} parent
 * @param {LevelEntry[]} levels
 * @param {(file: string, sandbox: boolean) => void} onPick  sandbox true se si sceglie la sandbox
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
    const card = document.createElement('div');
    card.className = 'menu-card';
    if (level.icon) card.appendChild(monumentIcon(level.icon));
    // Nome e stelle del livello sulla stessa riga (il tutorial non ha stelle).
    const head = document.createElement('div');
    head.className = 'menu-head';
    const name = document.createElement('span');
    name.className = 'menu-name';
    name.textContent = level.name;
    head.appendChild(name);
    if (level.sandbox) {
      const stars = document.createElement('span');
      stars.className = 'menu-stars';
      stars.innerHTML = starsHtml(record.stars, record.platinum || undefined);
      head.appendChild(stars);
    }
    card.title = level.description;
    card.appendChild(head);
    // Due tasti separati: il livello con le stelle, e la sandbox che va avanti
    // finché non si perde, col suo record.
    const modes = document.createElement('div');
    modes.className = 'menu-modes';
    const play = document.createElement('button');
    play.className = 'menu-mode';
    play.textContent = level.sandbox ? 'Livello' : 'Gioca';
    play.addEventListener('click', () => onPick(level.file, false));
    modes.appendChild(play);
    if (level.sandbox) {
      const best = loadRecord(level.file + SANDBOX_SUFFIX).score;
      const sandbox = document.createElement('button');
      sandbox.className = 'menu-mode menu-mode-sandbox';
      sandbox.innerHTML = `Sandbox <small>${best > 0 ? `record ${best}` : 'senza fine'}</small>`;
      sandbox.addEventListener('click', () => onPick(level.file, true));
      modes.appendChild(sandbox);
    }
    card.appendChild(modes);
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
    return { file: l.file, name: String(l.nome ?? l.file), description: String(l.descrizione ?? ''), icon: String(l.icona ?? ''), sandbox: l.sandbox !== false };
  });
}
