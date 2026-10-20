// Premio di fine settimana: due carte fra cui scegliere e, per il
// miglioramento, un avviso finché il giocatore non tocca una stazione.

/** @typedef {import('../sim/level.js').Rewards} Rewards */

const ROAD_ICON =
  '<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="#5d6169" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 36 L18 18 L38 10"/></svg>';
const UPGRADE_ICON =
  '<svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="24" r="15" fill="#e0533d" stroke="#fff" stroke-width="3"/><circle cx="22" cy="24" r="9" fill="none" stroke="#fff" stroke-width="2"/><path d="M22 4 l6 7 h-12 z" fill="#3d4047"/></svg>';

/**
 * @param {HTMLElement} parent
 * @param {number} week     la settimana appena conclusa
 * @param {Rewards} rewards
 * @param {{ onRoads: () => void, onUpgrade: () => void }} actions
 */
export function showRewardChoice(parent, week, rewards, actions) {
  const overlay = document.createElement('div');
  overlay.className = 'reward';

  const title = document.createElement('h1');
  title.textContent = `Fine della settimana ${week}`;
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Scegli un premio';

  const cards = document.createElement('div');
  cards.className = 'reward-cards';
  cards.append(
    card(ROAD_ICON, `+${rewards.roads}`, 'tratti di strada', () => {
      overlay.remove();
      actions.onRoads();
    }),
    card(UPGRADE_ICON, `+${rewards.capacity}`, 'capienza a una stazione', () => {
      overlay.remove();
      actions.onUpgrade();
    }),
  );

  overlay.append(title, subtitle, cards);
  parent.appendChild(overlay);
}

/**
 * Avviso mostrato mentre si sceglie la stazione da migliorare.
 * @param {HTMLElement} parent
 * @returns {() => void} toglie l'avviso
 */
export function showStationPrompt(parent) {
  const banner = document.createElement('div');
  banner.className = 'reward-banner';
  banner.textContent = 'Tocca la stazione da migliorare';
  parent.appendChild(banner);
  return () => banner.remove();
}

/**
 * @param {string} icon
 * @param {string} value
 * @param {string} label
 * @param {() => void} onPick
 */
function card(icon, value, label, onPick) {
  const b = document.createElement('button');
  b.className = 'reward-card';
  b.innerHTML = icon;
  const v = document.createElement('div');
  v.className = 'reward-value';
  v.textContent = value;
  const l = document.createElement('div');
  l.className = 'reward-label';
  l.textContent = label;
  b.append(v, l);
  b.addEventListener('click', onPick);
  return b;
}
