// Schermata di fine partita: "Livello fallito" o "Livello completato!", stelle, risultati, record,
// e i pulsanti Riprova e Menu.

import { starsHtml } from './hud.js';

/** @typedef {import('./hud.js').HudValues} HudValues */
/** @typedef {import('./records.js').LevelRecord} LevelRecord */

/**
 * @param {HTMLElement} parent
 * @param {HudValues} values
 * @param {{ record: LevelRecord, newBest: boolean } | null} best  null se il livello non ha stelle
 * @param {{ onRetry: () => void, onMenu: () => void }} actions
 * @param {boolean} [completed]  true se la partita finisce perché il livello è completato
 */
export function showGameOver(parent, values, best, actions, completed = false) {
  const overlay = document.createElement('div');
  overlay.className = 'game-over';

  const box = document.createElement('div');
  box.className = 'game-over-box';

  const title = document.createElement('h1');
  title.textContent = completed ? 'Livello completato!' : 'Livello fallito';
  const reason = document.createElement('p');
  reason.textContent = completed ? 'Hai preso tutte e tre le stelle.' : 'Una stazione è rimasta sovraccarica troppo a lungo.';
  if (completed) overlay.classList.add('completed');
  box.append(title, reason);

  if (best) {
    const stars = document.createElement('div');
    stars.className = 'game-over-stars';
    stars.innerHTML = starsHtml(values.stars);
    box.appendChild(stars);
  }

  const stats = document.createElement('div');
  stats.className = 'game-over-stats';
  for (const [label, value] of [
    ['Punti', String(values.score)],
    ['Giorni', String(values.day - 1)],
    ['Viaggi', String(values.trips)],
    ['Efficienza', values.efficiency == null ? '–' : `${values.efficiency}%`],
    ['Traffico lento', values.slowTraffic == null ? '–' : `${values.slowTraffic}%`],
  ]) {
    const item = document.createElement('div');
    const v = document.createElement('div');
    v.className = 'hud-value';
    v.textContent = value;
    const l = document.createElement('div');
    l.className = 'hud-label';
    l.textContent = label;
    item.append(v, l);
    stats.appendChild(item);
  }
  box.appendChild(stats);

  if (best) {
    const record = document.createElement('p');
    record.className = 'game-over-record';
    record.textContent = best.newBest ? 'Nuovo record!' : `Record: ${best.record.score}`;
    box.appendChild(record);
  }

  const retry = document.createElement('button');
  retry.textContent = completed ? 'Gioca ancora' : 'Riprova';
  retry.addEventListener('click', actions.onRetry);
  const menu = document.createElement('button');
  menu.textContent = 'Menu';
  menu.className = 'secondary';
  menu.addEventListener('click', actions.onMenu);

  box.append(retry, menu);
  overlay.appendChild(box);
  parent.appendChild(overlay);
}
