// Riquadro che spiega perché qualcosa non si è potuto costruire. Resta finché
// non lo si tocca; se ne arriva un altro prende il posto del precedente.

/**
 * @param {HTMLElement} parent
 * @param {{title: string, text: string}} message
 */
export function showNotice(parent, message) {
  parent.querySelector('.notice')?.remove();
  const box = document.createElement('div');
  box.className = 'notice';
  const title = document.createElement('div');
  title.className = 'notice-title';
  title.textContent = message.title;
  const text = document.createElement('div');
  text.className = 'notice-text';
  text.textContent = message.text;
  const hint = document.createElement('div');
  hint.className = 'notice-hint';
  hint.textContent = 'Tocca per chiudere';
  box.append(title, text, hint);
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  box.addEventListener('click', () => box.remove());
  parent.appendChild(box);
}
