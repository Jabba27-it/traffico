// Pannello in alto con punteggio, tempo e viaggi completati.

/**
 * @typedef {Object} HudValues
 * @property {number} score
 * @property {number} seconds
 * @property {number} trips
 */

/**
 * @param {HTMLElement} parent
 * @returns {{ update: (values: HudValues) => void }}
 */
export function createHud(parent) {
  const root = document.createElement('div');
  root.className = 'hud';
  const score = addItem(root, 'Punteggio');
  const time = addItem(root, 'Tempo');
  const trips = addItem(root, 'Viaggi');
  parent.appendChild(root);

  let last = '';
  return {
    update(values) {
      const s = Math.floor(values.seconds);
      const text = `${values.score}|${s}|${values.trips}`;
      if (text === last) return; // tocca il DOM solo quando qualcosa cambia
      last = text;
      score.textContent = String(values.score);
      time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      trips.textContent = String(values.trips);
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
