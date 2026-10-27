// Elenco dei rompicapi: tre gruppi, dal facile al difficile, ognuno con le sue
// caselle e le stelle prese. Un gruppo si apre risolvendo almeno 3 rompicapi di
// quello prima. Tutto in una schermata del telefono, senza scorrere.

import { starsHtml } from './hud.js';
import { loadRecord } from './records.js';
import { PUZZLE_RECORD } from './puzzle.js';

/** Rompicapi da risolvere in un gruppo per aprire il successivo. */
export const TO_UNLOCK = 3;

/**
 * @typedef {Object} PuzzleGroup  un gruppo di levels/rompicapi/indice.json
 * @property {string} name
 * @property {{file: string, name: string}[]} puzzles
 */

/**
 * Legge e controlla levels/rompicapi/indice.json.
 * @param {any} json
 * @returns {PuzzleGroup[]}
 */
export function parsePuzzleIndex(json) {
  if (!Array.isArray(json?.gruppi)) throw new Error('levels/rompicapi/indice.json deve avere una lista "gruppi"');
  return json.gruppi.map((/** @type {any} */ g) => ({
    name: String(g?.nome ?? ''),
    puzzles: (Array.isArray(g?.rompicapi) ? g.rompicapi : []).map((/** @type {any} */ p) => {
      if (typeof p?.file !== 'string' || !/^[a-z0-9_-]+$/.test(p.file)) throw new Error('Ogni rompicapo deve avere un "file" come "1-1"');
      return { file: p.file, name: String(p.nome ?? p.file) };
    }),
  }));
}

/** @param {string} file */
export function puzzleStars(file) {
  return loadRecord(PUZZLE_RECORD + file).stars;
}

/**
 * Quali gruppi sono aperti: il primo sempre, gli altri con TO_UNLOCK risolti in quello prima.
 * @param {PuzzleGroup[]} groups
 */
export function openGroups(groups) {
  return groups.map((_, i) => i === 0 || groups[i - 1].puzzles.filter((p) => puzzleStars(p.file)[0]).length >= TO_UNLOCK);
}

/**
 * Risolti e stelle prese in tutto, per la scheda del menu.
 * @param {PuzzleGroup[]} groups
 */
export function puzzleProgress(groups) {
  const all = groups.flatMap((g) => g.puzzles);
  const stars = all.map((p) => puzzleStars(p.file));
  return { solved: stars.filter((s) => s[0]).length, total: all.length, stars: stars.flat().filter(Boolean).length };
}

/**
 * Dove si trova un rompicapo: il gruppo, la posizione e il successivo (se è aperto).
 * @param {PuzzleGroup[]} groups
 * @param {string} file
 */
export function locatePuzzle(groups, file) {
  const flat = groups.flatMap((g, gi) => g.puzzles.map((p, pi) => ({ ...p, group: gi, index: pi })));
  const k = flat.findIndex((p) => p.file === file);
  if (k < 0) return null;
  const here = flat[k];
  const next = flat[k + 1] ?? null;
  return {
    label: `${groups[here.group].name} · ${here.index + 1} di ${groups[here.group].puzzles.length}`,
    next: next && openGroups(groups)[next.group] ? next.file : null,
  };
}

/**
 * @param {HTMLElement} parent
 * @param {PuzzleGroup[]} groups
 * @param {(file: string) => void} onPick
 * @param {() => void} onBack
 */
export function showPuzzleList(parent, groups, onPick, onBack) {
  const root = document.createElement('div');
  root.className = 'menu puzzles';
  const title = document.createElement('h1');
  title.textContent = 'Rompicapi';
  const progress = puzzleProgress(groups);
  const subtitle = document.createElement('p');
  subtitle.textContent = `Risolti ${progress.solved} su ${progress.total} · ★ ${progress.stars} su ${progress.total * 3}`;
  root.append(title, subtitle);

  const open = openGroups(groups);
  groups.forEach((group, gi) => {
    const card = document.createElement('div');
    card.className = 'menu-card puzzle-group';
    const head = document.createElement('div');
    head.className = 'menu-head';
    const name = document.createElement('span');
    name.className = 'menu-name';
    name.textContent = group.name;
    head.appendChild(name);
    if (!open[gi]) {
      const lock = document.createElement('span');
      lock.className = 'menu-record';
      lock.textContent = `🔒 risolvine ${TO_UNLOCK} del gruppo prima`;
      head.appendChild(lock);
    }
    card.appendChild(head);
    const tiles = document.createElement('div');
    tiles.className = 'puzzle-tiles';
    group.puzzles.forEach((p, pi) => {
      const tile = document.createElement('button');
      tile.className = 'puzzle-tile';
      tile.disabled = !open[gi];
      const stars = puzzleStars(p.file);
      tile.innerHTML = `<span class="puzzle-tile-top"><span class="puzzle-number">${gi + 1}.${pi + 1}</span><span class="puzzle-tile-stars">${starsHtml(stars)}</span></span><span class="puzzle-name"></span>`;
      /** @type {HTMLElement} */ (tile.querySelector('.puzzle-name')).textContent = p.name;
      if (stars[0]) tile.classList.add('solved');
      tile.addEventListener('click', () => onPick(p.file));
      tiles.appendChild(tile);
    });
    card.appendChild(tiles);
    root.appendChild(card);
  });

  const back = document.createElement('button');
  back.className = 'menu-mode puzzle-back';
  back.textContent = 'Torna al menu';
  back.addEventListener('click', onBack);
  root.appendChild(back);
  parent.appendChild(root);
}
