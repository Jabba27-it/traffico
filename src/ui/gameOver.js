// Schermata di fine partita: "Livello fallito" o "Livello completato!", stelle, risultati, record,
// e i pulsanti Riprova, Guarda la mappa e Menu. Con "Guarda la mappa" il riquadro si
// nasconde e resta la mappa ferma al momento della fine; una barra in alto lo riapre.

import { starsHtml } from './hud.js';

/** @typedef {import('./hud.js').HudValues} HudValues */
/** @typedef {import('./records.js').LevelRecord} LevelRecord */

/**
 * @param {HTMLElement} parent
 * @param {HudValues} values
 * @param {{ record: LevelRecord, newBest: boolean } | null} best  null se il livello non ha stelle
 * @param {{ onRetry: () => void, onMenu: () => void, onPhoto: () => void }} actions
 * @param {boolean} [completed]  true se la partita finisce perché il livello è completato
 * @param {string} [culprit]  nome della stazione che ha fatto perdere, se ce l'ha
 * @param {boolean} [sandbox]  partita in modalità sandbox: niente stelle, conta il punteggio
 */
export function showGameOver(parent, values, best, actions, completed = false, culprit = '', sandbox = false) {
  const overlay = document.createElement('div');
  overlay.className = 'game-over';

  const box = document.createElement('div');
  box.className = 'game-over-box';

  const title = document.createElement('h1');
  // Persa dopo le tre stelle: le stelle restano, è mancato solo il platino.
  const threeStars = !sandbox && values.stars.length > 0 && values.stars.every(Boolean);
  title.textContent = completed ? 'Livello completato!' : sandbox ? 'Partita finita' : threeStars ? 'Tre stelle prese' : 'Livello fallito';
  const reason = document.createElement('p');
  reason.textContent = completed
    ? values.platinum
      ? 'Hai preso tutte e tre le stelle, e anche quella di platino!'
      : 'Hai preso tutte e tre le stelle.'
    : threeStars
      ? `${culprit ? `La stazione ${culprit}` : 'Una stazione'} è rimasta sovraccarica troppo a lungo. Platino mancato: efficienza ${values.efficiency ?? 0}%, ne serviva ${values.platinumMin}%.`
      : `${culprit ? `La stazione ${culprit}` : 'Una stazione'} è rimasta sovraccarica troppo a lungo.`;
  if (completed || threeStars) overlay.classList.add('completed');
  box.append(title, reason);

  if (best && !sandbox) {
    const stars = document.createElement('div');
    stars.className = 'game-over-stars';
    stars.innerHTML = starsHtml(values.stars, values.platinum);
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
    record.textContent = best.newBest ? `Nuovo record: ${values.score} punti!` : `Record: ${best.record.score}`;
    box.appendChild(record);
  }

  const retry = document.createElement('button');
  retry.textContent = completed ? 'Gioca ancora' : 'Riprova';
  retry.addEventListener('click', actions.onRetry);
  const look = document.createElement('button');
  look.textContent = 'Guarda la mappa';
  look.className = 'secondary';
  const photo = document.createElement('button');
  photo.textContent = 'Foto della città';
  photo.className = 'secondary';
  photo.addEventListener('click', actions.onPhoto);
  const menu = document.createElement('button');
  menu.textContent = 'Menu';
  menu.className = 'secondary';
  menu.addEventListener('click', actions.onMenu);

  box.append(retry, look, photo, menu);
  overlay.appendChild(box);
  parent.appendChild(overlay);

  // La mappa ferma, con una barra per tornare al riepilogo.
  const bar = document.createElement('div');
  bar.className = 'map-review';
  bar.hidden = true;
  const label = document.createElement('span');
  label.textContent = completed ? 'La città alla fine' : 'La città quando hai perso';
  const back = document.createElement('button');
  back.textContent = 'Torna al riepilogo';
  bar.append(label, back);
  parent.appendChild(bar);
  look.addEventListener('click', () => {
    overlay.hidden = true;
    bar.hidden = false;
  });
  back.addEventListener('click', () => {
    bar.hidden = true;
    overlay.hidden = false;
  });
}
