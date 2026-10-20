// Pulsanti in basso: pausa, velocità normale, velocità doppia.

const ICONS = {
  0: '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="3" y="2" width="4" height="14" rx="1"/><rect x="11" y="2" width="4" height="14" rx="1"/></svg>',
  1: '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><path d="M4 2.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 4 2.5z"/></svg>',
  2: '<svg width="24" height="18" viewBox="0 0 24 18" fill="currentColor"><path d="M2 3v12a1 1 0 0 0 1.5.86L12 10.4V15a1 1 0 0 0 1.5.86l9-6a1 1 0 0 0 0-1.72l-9-6A1 1 0 0 0 12 3v4.6L3.5 2.14A1 1 0 0 0 2 3z"/></svg>',
};

const LABELS = { 0: 'Pausa', 1: 'Velocità normale', 2: 'Velocità doppia' };

/**
 * @param {HTMLElement} parent
 * @returns {{ speed: () => number }} la velocità scelta: 0, 1 o 2
 */
export function createSpeedControls(parent) {
  const root = document.createElement('div');
  root.className = 'speed';
  let speed = 1;

  /** @type {HTMLButtonElement[]} */
  const buttons = [0, 1, 2].map((value) => {
    const b = document.createElement('button');
    b.innerHTML = ICONS[/** @type {0 | 1 | 2} */ (value)];
    b.setAttribute('aria-label', LABELS[/** @type {0 | 1 | 2} */ (value)]);
    b.addEventListener('click', () => {
      speed = value;
      buttons.forEach((other, i) => other.classList.toggle('active', i === value));
    });
    root.appendChild(b);
    return b;
  });
  buttons[1].classList.add('active');

  parent.appendChild(root);
  return { speed: () => speed };
}
