// Pulsante in basso a sinistra, accanto al menu: accende e spegne i suoni.
// La scelta resta salvata anche per le partite successive.

import { isMuted, setMuted } from '../audio/sounds.js';

const SPEAKER = '<path d="M2 6.5h3l4-3.5v12l-4-3.5H2z"/>';
const ICON_ON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">${SPEAKER}<path d="M12 5.5a5 5 0 0 1 0 7M14 3.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_OFF = `<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">${SPEAKER}<path d="M11.5 6.5l5 5M16.5 6.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

/** @param {HTMLElement} parent */
export function createMuteButton(parent) {
  const button = document.createElement('button');
  button.className = 'menu-button mute-button';
  const show = () => {
    button.innerHTML = isMuted() ? ICON_OFF : ICON_ON;
    button.setAttribute('aria-label', isMuted() ? 'Accendi i suoni' : 'Togli i suoni');
  };
  button.addEventListener('click', () => {
    setMuted(!isMuted());
    show();
  });
  show();
  parent.appendChild(button);
}
