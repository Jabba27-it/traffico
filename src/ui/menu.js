// Schermata iniziale: nome del gioco, la sfida del giorno ed elenco delle città,
// tutto in una schermata del telefono senza scorrere: per ogni città le stelle del
// livello e due tasti, Livello e Senza fine (col record della modalità senza fine).

import { starsHtml } from './hud.js';
import { loadRecord, SANDBOX_SUFFIX } from './records.js';
import { drawMonument } from '../render/terrain.js';
import { todayKey, dailyCity, dayLabel, loadDailyBest, dailyStreak } from './daily.js';

/** Lato in pixel a cui si disegna il monumento: il CSS lo rimpicciolisce secondo lo schermo. */
const ICON_SIZE = 72;

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
 * @param {(file: string, mode: 'livello' | 'sandbox' | 'sfida' | 'rompicapi') => void} onPick  la città e la modalità scelte
 * @param {{solved: number, total: number, stars: number} | null} [puzzles]  i rompicapi risolti, per la loro scheda
 */
export function showMenu(parent, levels, onPick, puzzles = null) {
  const root = document.createElement('div');
  root.className = 'menu';

  const title = document.createElement('h1');
  title.textContent = GAME_TITLE;
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Scegli una città';
  root.append(title, subtitle);

  // In cima la sfida del giorno: la città di oggi, il record di oggi e la serie.
  const today = todayKey();
  const city = dailyCity(levels, today);
  if (city) {
    const card = document.createElement('div');
    card.className = 'menu-card menu-daily';
    if (city.icon) card.appendChild(monumentIcon(city.icon));
    const head = document.createElement('div');
    head.className = 'menu-head';
    const name = document.createElement('span');
    name.className = 'menu-name';
    name.textContent = 'Sfida di oggi';
    head.appendChild(name);
    const streak = dailyStreak(today);
    if (streak > 0) {
      const badge = document.createElement('span');
      badge.className = 'menu-streak';
      badge.textContent = `🔥 ${streak} ${streak === 1 ? 'giorno' : 'giorni'}`;
      badge.title = 'Giorni di fila in cui hai giocato la sfida';
      head.appendChild(badge);
    }
    card.appendChild(head);
    const best = loadDailyBest(today);
    const recordLine = document.createElement('div');
    recordLine.className = 'menu-record';
    recordLine.textContent = best > 0 ? `${city.name} · record ${best} punti` : `${city.name} · ${dayLabel(today)}`;
    card.appendChild(recordLine);
    const modes = document.createElement('div');
    modes.className = 'menu-modes';
    const play = document.createElement('button');
    play.className = 'menu-mode menu-mode-daily';
    play.textContent = best > 0 ? 'Riprova la sfida' : 'Gioca la sfida';
    play.addEventListener('click', () => onPick(city.file, 'sfida'));
    modes.appendChild(play);
    card.appendChild(modes);
    root.appendChild(card);
  }

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
    // Il record è quello della sandbox: i punti contano solo lì.
    if (level.sandbox) {
      const best = loadRecord(level.file + SANDBOX_SUFFIX).score;
      const recordLine = document.createElement('div');
      recordLine.className = 'menu-record';
      recordLine.textContent = best > 0 ? `Record: ${best} punti` : 'Record: ancora nessuno';
      card.appendChild(recordLine);
    }
    // Due tasti separati: il livello con le stelle, e la sandbox che va avanti
    // finché non si perde, col suo record.
    const modes = document.createElement('div');
    modes.className = 'menu-modes';
    const play = document.createElement('button');
    play.className = 'menu-mode';
    play.textContent = level.sandbox ? 'Livello' : 'Gioca';
    play.addEventListener('click', () => onPick(level.file, 'livello'));
    modes.appendChild(play);
    if (level.sandbox) {
      const sandbox = document.createElement('button');
      sandbox.className = 'menu-mode menu-mode-sandbox';
      sandbox.textContent = 'Senza fine';
      sandbox.addEventListener('click', () => onPick(level.file, 'sandbox'));
      modes.appendChild(sandbox);
    }
    card.appendChild(modes);
    root.appendChild(card);
  }

  // I rompicapi: traffico sempre uguale, da risolvere costruendo a gioco fermo.
  if (puzzles && puzzles.total > 0) {
    const card = document.createElement('div');
    card.className = 'menu-card';
    card.appendChild(monumentIcon('rompicapo'));
    const head = document.createElement('div');
    head.className = 'menu-head';
    const name = document.createElement('span');
    name.className = 'menu-name';
    name.textContent = 'Rompicapi';
    head.appendChild(name);
    card.appendChild(head);
    const line = document.createElement('div');
    line.className = 'menu-record';
    line.textContent = puzzles.solved > 0 ? `Risolti ${puzzles.solved} su ${puzzles.total} · ★ ${puzzles.stars}` : `${puzzles.total} incroci e città da sbrogliare`;
    card.appendChild(line);
    const modes = document.createElement('div');
    modes.className = 'menu-modes';
    const play = document.createElement('button');
    play.className = 'menu-mode';
    play.textContent = 'Gioca';
    play.addEventListener('click', () => onPick('', 'rompicapi'));
    modes.appendChild(play);
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
