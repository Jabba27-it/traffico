// Pannello in alto con giorno, punteggio, viaggi completati e strade disponibili.

/**
 * @typedef {Object} HudValues
 * @property {number} score
 * @property {number} seconds
 * @property {number} trips
 * @property {number} day          giorno in corso, da 1
 * @property {number} dayProgress  quanto del giorno è passato, da 0 a 1
 * @property {number} roads        tratti di strada disponibili
 */

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/**
 * @param {HTMLElement} parent
 * @returns {{ update: (values: HudValues) => void }}
 */
export function createHud(parent) {
  const root = document.createElement('div');
  root.className = 'hud';
  const day = addItem(root, 'Giorno');
  const bar = document.createElement('div');
  bar.className = 'hud-bar';
  const barFill = document.createElement('div');
  bar.appendChild(barFill);
  /** @type {HTMLElement} */ (day.parentElement).insertBefore(bar, day.nextSibling);
  const score = addItem(root, 'Punteggio');
  const trips = addItem(root, 'Viaggi');
  const roads = addItem(root, 'Strade');
  parent.appendChild(root);

  let last = '';
  let lastBar = -1;
  return {
    update(values) {
      const percent = Math.round(values.dayProgress * 100);
      if (percent !== lastBar) {
        lastBar = percent;
        barFill.style.width = `${percent}%`;
      }
      const text = `${values.day}|${values.score}|${values.trips}|${values.roads}`;
      if (text === last) return; // tocca il DOM solo quando qualcosa cambia
      last = text;
      day.textContent = `${WEEKDAYS[(values.day - 1) % 7]} ${values.day}`;
      score.textContent = String(values.score);
      trips.textContent = String(values.trips);
      roads.textContent = Number.isFinite(values.roads) ? String(values.roads) : '∞';
      roads.classList.toggle('hud-empty', values.roads === 0);
    },
  };
}

/**
 * @param {HTMLElement} root
 * @param {string} label
 * @returns {HTMLElement} l'elemento che mostra il valore
 */
function addItem(root, label) {
  const item = document.createElement('div');
  item.className = 'hud-item';
  const value = document.createElement('div');
  value.className = 'hud-value';
  value.textContent = '0';
  const caption = document.createElement('div');
  caption.className = 'hud-label';
  caption.textContent = label;
  item.append(value, caption);
  root.appendChild(item);
  return value;
}
