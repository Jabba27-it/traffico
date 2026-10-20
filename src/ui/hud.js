// Pannello in alto con giorno, punti, viaggi, strade e ponti disponibili e stelle.

/**
 * @typedef {Object} HudValues
 * @property {number} score
 * @property {number} seconds
 * @property {number} trips
 * @property {number} day          giorno in corso, da 1
 * @property {number} dayProgress  quanto del giorno è passato, da 0 a 1
 * @property {number} roads        tratti di strada disponibili
 * @property {number} bridges      ponti disponibili
 * @property {number} overpasses   cavalcavia disponibili
 * @property {boolean[]} stars     stelle guadagnate * @property {number | null} [efficiency]  efficienza dei viaggi in percentuale
 */

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/**
 * @param {HTMLElement} parent
 * @param {{ bridges: boolean, stars: boolean, onStarsTap: () => void }} options
 *   quali voci mostrare (i ponti solo nei livelli con acqua) e cosa fare toccando le stelle
 * @returns {{ update: (values: HudValues) => void }}
 */
export function createHud(parent, options) {
  const root = document.createElement('div');
  root.className = 'hud';
  const day = addItem(root, 'Giorno');
  const bar = document.createElement('div');
  bar.className = 'hud-bar';
  const barFill = document.createElement('div');
  bar.appendChild(barFill);
  /** @type {HTMLElement} */ (day.parentElement).insertBefore(bar, day.nextSibling);
  const score = addItem(root, 'Punti');
  const trips = addItem(root, 'Viaggi');
  const roads = addItem(root, 'Strade');
  const bridges = options.bridges ? addItem(root, 'Ponti') : null;
  const overpasses = addItem(root, 'Cavalc.');
  const stars = options.stars ? addItem(root, 'Stelle') : null;
  if (stars) {
    const item = /** @type {HTMLElement} */ (stars.parentElement);
    item.classList.add('hud-tappable');
    item.addEventListener('click', options.onStarsTap);
  }
  parent.appendChild(root);

  let last = '';
  let lastBar = -1;
  return {
    update(values) {
      const percent = Math.round(values.dayProgress * 100);
      if (percent !== lastBar) {
        lastBar = percent;
        barFill.style.width = `${percent}%`;
      }      const text = `${values.day}|${values.score}|${values.trips}|${values.roads}|${values.bridges}|${values.overpasses}|${values.stars}`;
      if (text === last) return; // tocca il DOM solo quando qualcosa cambia
      last = text;
      day.textContent = `${WEEKDAYS[(values.day - 1) % 7]} ${values.day}`;
      score.textContent = String(values.score);
      trips.textContent = String(values.trips);
      roads.textContent = Number.isFinite(values.roads) ? String(values.roads) : '∞';
      roads.classList.toggle('hud-empty', values.roads === 0);
      if (bridges) {
        bridges.textContent = String(values.bridges);
        bridges.classList.toggle('hud-empty', values.bridges === 0);
      }
      overpasses.textContent = String(values.overpasses);
      overpasses.classList.toggle('hud-empty', values.overpasses === 0);
      if (stars) stars.innerHTML = starsHtml(values.stars);
    },
  };
}

/**
 * Tre stelle, piene quelle guadagnate.
 * @param {boolean[]} earned
 */
export function starsHtml(earned) {
  return earned.map((on) => `<span class="${on ? 'star-on' : 'star-off'}">${on ? '★' : '☆'}</span>`).join('');
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
