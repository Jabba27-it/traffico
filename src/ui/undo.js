// Pulsante in basso a sinistra, accanto al menu e all'altoparlante: annulla
// l'ultima mossa. È spento quando non c'è niente da annullare.

const ICON =
  '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4.5 3 8l3.5 3.5"/><path d="M3.5 8h7a4.5 4.5 0 0 1 0 9H8"/></svg>';

/**
 * @param {HTMLElement} parent
 * @param {{ canUndo: () => boolean, onUndo: () => void }} options
 * @returns {{ update: () => void }}  da chiamare a ogni fotogramma per accenderlo o spegnerlo
 */
export function createUndoButton(parent, options) {
  const button = document.createElement('button');
  button.className = 'menu-button undo-button';
  button.setAttribute('aria-label', 'Annulla l\'ultima mossa');
  button.innerHTML = ICON;
  button.addEventListener('click', () => {
    if (options.canUndo()) options.onUndo();
  });
  parent.appendChild(button);
  let shown = null;
  return {
    update() {
      const on = options.canUndo();
      if (on === shown) return;
      shown = on;
      button.classList.toggle('off', !on);
    },
  };
}
