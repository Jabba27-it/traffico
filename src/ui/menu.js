// Schermata iniziale, tutta in una schermata del telefono senza scorrere: il nome
// del gioco, la sfida del giorno, le città in una griglia a due colonne (stelle del
// livello, record della modalità senza fine, tasti Livello e Senza fine) e i rompicapi.

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
  root.className = 'menu menu-home';

  const top = document.createElement('header');
  top.className = 'menu-top';
  const title = document.createElement('h1');
  title.textContent = GAME_TITLE;
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Disegna le strade, tieni la città in movimento';
  top.append(title, subtitle);
  root.appendChild(top);

  // In cima la sfida del giorno: la città di oggi, il record di oggi e la serie.
  const today = todayKey();
  const city = dailyCity(levels, today);
  if (city) {
    const best = loadDailyBest(today);
    const streak = dailyStreak(today);
    const card = wideCard(
      city.icon,
      'Sfida di oggi',
      best > 0 ? `${city.name} · record ${best} punti` : `${city.name} · ${dayLabel(today)}`,
      best > 0 ? 'Riprova' : 'Gioca',
      () => onPick(city.file, 'sfida'),
    );
    card.classList.add('menu-daily');
    if (streak > 0) {
      const badge = document.createElement('span');
      badge.className = 'menu-streak';
      badge.textContent = `🔥 ${streak}`;
      badge.title = `Giorni di fila in cui hai giocato la sfida: ${streak}`;
      /** @type {HTMLElement} */ (card.querySelector('.menu-head')).appendChild(badge);
    }
    root.appendChild(card);
  }

  // Le città, due per riga: monumento, nome, stelle, record e i due modi di giocare.
  const label = document.createElement('div');
  label.className = 'menu-section';
  label.textContent = 'Città';
  root.appendChild(label);
  const grid = document.createElement('div');
  grid.className = 'menu-grid';
  for (const level of levels) grid.appendChild(cityTile(level, onPick));
  root.appendChild(grid);

  // I rompicapi: traffico sempre uguale, da risolvere costruendo a gioco fermo.
  if (puzzles && puzzles.total > 0) {
    root.appendChild(
      wideCard(
        'rompicapo',
        'Rompicapi',
        puzzles.solved > 0 ? `Risolti ${puzzles.solved} su ${puzzles.total} · ★ ${puzzles.stars}` : `${puzzles.total} incroci e città da sbrogliare`,
        'Gioca',
        () => onPick('', 'rompicapi'),
      ),
    );
  }
  parent.appendChild(root);
}

/**
 * Una scheda larga (sfida del giorno, rompicapi): monumento, titolo, una riga e un tasto a destra.
 * @param {string} icon
 * @param {string} name
 * @param {string} line
 * @param {string} action
 * @param {() => void} onClick
 */
function wideCard(icon, name, line, action, onClick) {
  const card = document.createElement('div');
  card.className = 'menu-card menu-wide';
  if (icon) card.appendChild(monumentIcon(icon));
  const text = document.createElement('div');
  text.className = 'menu-wide-text';
  const head = document.createElement('div');
  head.className = 'menu-head';
  const title = document.createElement('span');
  title.className = 'menu-name';
  title.textContent = name;
  head.appendChild(title);
  const sub = document.createElement('div');
  sub.className = 'menu-record';
  sub.textContent = line;
  text.append(head, sub);
  const play = document.createElement('button');
  play.className = 'menu-mode menu-go';
  play.textContent = action;
  play.addEventListener('click', onClick);
  card.append(text, play);
  return card;
}

/**
 * La casella di una città (o del tutorial): monumento e nome, stelle, record dei
 * punti senza fine e i tasti Livello e Senza fine (il tutorial solo Gioca).
 * @param {LevelEntry} level
 * @param {(file: string, mode: 'livello' | 'sandbox' | 'sfida' | 'rompicapi') => void} onPick
 */
function cityTile(level, onPick) {
  const record = loadRecord(level.file);
  const tile = document.createElement('div');
  tile.className = 'menu-tile';
  tile.title = level.description;
  const head = document.createElement('div');
  head.className = 'menu-tile-head';
  if (level.icon) head.appendChild(monumentIcon(level.icon));
  const name = document.createElement('div');
  name.className = 'menu-tile-name';
  name.textContent = level.name;
  head.appendChild(name);
  tile.appendChild(head);

  const info = document.createElement('div');
  info.className = 'menu-tile-info';
  if (level.sandbox) {
    const stars = document.createElement('span');
    stars.className = 'menu-stars';
    stars.innerHTML = starsHtml(record.stars, record.platinum || undefined);
    // Il record è quello della modalità senza fine: i punti contano solo lì.
    const best = loadRecord(level.file + SANDBOX_SUFFIX).score;
    const points = document.createElement('span');
    points.className = 'menu-tile-record';
    points.textContent = best > 0 ? `${best} pt` : '';
    info.append(stars, points);
  } else {
    info.textContent = level.description;
  }
  tile.appendChild(info);

  const modes = document.createElement('div');
  modes.className = 'menu-modes';
  const play = document.createElement('button');
  play.className = 'menu-mode';
  play.textContent = level.sandbox ? 'Livello' : 'Gioca';
  play.addEventListener('click', () => onPick(level.file, 'livello'));
  modes.appendChild(play);
  if (level.sandbox) {
    const endless = document.createElement('button');
    endless.className = 'menu-mode menu-mode-sandbox';
    endless.textContent = 'Senza fine';
    endless.addEventListener('click', () => onPick(level.file, 'sandbox'));
    modes.appendChild(endless);
  }
  tile.appendChild(modes);
  return tile;
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
