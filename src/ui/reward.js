// Premio di fine settimana: carte fra cui scegliere e, per il miglioramento,
// un avviso finché il giocatore non tocca una stazione.

export const REWARD_ICONS = {
  roads:
    '<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="#5d6169" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 36 L18 18 L38 10"/></svg>',
  upgrade:
    '<svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="24" r="15" fill="#e0533d" stroke="#fff" stroke-width="3"/><circle cx="22" cy="24" r="9" fill="none" stroke="#fff" stroke-width="2"/><path d="M22 4 l6 7 h-12 z" fill="#3d4047"/></svg>',
  bridge:
    '<svg width="44" height="44" viewBox="0 0 44 44"><rect x="0" y="14" width="44" height="16" fill="#a7d0ea"/><rect x="16" y="2" width="12" height="40" fill="#44474e"/><rect x="19" y="2" width="6" height="40" fill="#8b8f97"/></svg>',
};

/**
 * @typedef {Object} RewardCard
 * @property {string} icon   SVG da mostrare in alto
 * @property {string} value  es. "+15"
 * @property {string} label
 * @property {() => void} onPick
 */

/**
 * @param {HTMLElement} parent
 * @param {number} week  la settimana appena conclusa
 * @param {RewardCard[]} cards
 */
export function showRewardChoice(parent, week, cards) {
  const overlay = document.createElement('div');
  overlay.className = 'reward';

  const title = document.createElement('h1');
  title.textContent = `Fine della settimana ${week}`;
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Scegli un premio';

  const row = document.createElement('div');
  row.className = 'reward-cards';
  for (const c of cards) {
    row.appendChild(
      card(c, () => {
        overlay.remove();
        c.onPick();
      }),
    );
  }

  overlay.append(title, subtitle, row);
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
 * @param {RewardCard} c
 * @param {() => void} onPick
 */
function card(c, onPick) {
  const b = document.createElement('button');
  b.className = 'reward-card';
  b.innerHTML = c.icon;
  const v = document.createElement('div');
  v.className = 'reward-value';
  v.textContent = c.value;
  const l = document.createElement('div');
  l.className = 'reward-label';
  l.textContent = c.label;
  b.append(v, l);
  b.addEventListener('click', onPick);
  return b;
}
