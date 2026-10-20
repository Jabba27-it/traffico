// Schermata di fine partita: "Livello fallito", risultati e pulsante Riprova.

/** @typedef {import('./hud.js').HudValues} HudValues */

/**
 * @param {HTMLElement} parent
 * @param {HudValues} values
 * @param {() => void} onRetry
 */
export function showGameOver(parent, values, onRetry) {
  const overlay = document.createElement('div');
  overlay.className = 'game-over';

  const box = document.createElement('div');
  box.className = 'game-over-box';

  const title = document.createElement('h1');
  title.textContent = 'Livello fallito';
  const reason = document.createElement('p');
  reason.textContent = 'Una stazione è rimasta sovraccarica troppo a lungo.';

  const stats = document.createElement('div');
  stats.className = 'game-over-stats';
  const s = Math.floor(values.seconds);
  for (const [label, value] of [
    ['Punteggio', String(values.score)],
    ['Tempo', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`],
    ['Viaggi', String(values.trips)],
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

  const retry = document.createElement('button');
  retry.textContent = 'Riprova';
  retry.addEventListener('click', onRetry);

  box.append(title, reason, stats, retry);
  overlay.appendChild(box);
  parent.appendChild(overlay);
}
