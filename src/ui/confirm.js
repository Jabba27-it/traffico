// Richiesta di conferma sopra il gioco, con due pulsanti.

/**
 * @param {HTMLElement} parent
 * @param {string} message
 * @param {string} yes  testo del pulsante che conferma
 * @param {string} no   testo del pulsante che annulla
 * @returns {Promise<boolean>}
 */
export function askConfirm(parent, message, yes, no) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'game-over';
    const box = document.createElement('div');
    box.className = 'game-over-box';
    const text = document.createElement('p');
    text.textContent = message;
    const yesButton = document.createElement('button');
    yesButton.textContent = yes;
    const noButton = document.createElement('button');
    noButton.textContent = no;
    noButton.className = 'secondary';
    const done = (/** @type {boolean} */ answer) => {
      overlay.remove();
      resolve(answer);
    };
    yesButton.addEventListener('click', () => done(true));
    noButton.addEventListener('click', () => done(false));
    box.append(text, yesButton, noButton);
    overlay.appendChild(box);
    parent.appendChild(overlay);
  });
}
