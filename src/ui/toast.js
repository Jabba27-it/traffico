// Avviso breve sotto il pannello, che sparisce da solo.

const DURATION = 3500;

/**
 * @param {HTMLElement} parent
 * @param {string} text
 */
export function showToast(parent, text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  parent.appendChild(el);
  // Due fotogrammi: il browser deve disegnarlo trasparente prima della dissolvenza.
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 400);
  }, DURATION);
}
