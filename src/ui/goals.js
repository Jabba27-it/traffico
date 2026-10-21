// Riquadro con gli obiettivi delle tre stelle e a che punto sei.
// Si chiude toccandolo o da solo dopo qualche secondo.

/** @typedef {import('../sim/stars.js').StarGoal} StarGoal */

const DURATION = 5000;

/**
 * @param {HTMLElement} parent
 * @param {StarGoal[]} goals
 * @param {number | null} [efficiency]  efficienza dei viaggi in percentuale, se già misurata
 */
export function showGoals(parent, goals, efficiency = null) {
  parent.querySelector('.goals')?.remove();
  const box = document.createElement('div');
  box.className = 'goals';
  for (const g of goals) {
    const row = document.createElement('div');
    row.className = 'goals-row';
    const star = document.createElement('span');
    star.className = g.reached ? 'star-on' : 'star-off';
    star.textContent = g.reached ? '★' : '☆';
    const text = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'goals-label';
    label.textContent = g.label;
    const progress = document.createElement('div');
    progress.className = 'goals-progress';
    progress.textContent = g.reached && g.lasting ? 'fatto' : g.progress;
    text.append(label, progress);
    row.append(star, text);
    box.appendChild(row);
  }
  const info = document.createElement('div');
  info.className = 'goals-progress goals-info';
  info.textContent =
    efficiency === null
      ? 'Efficienza dei viaggi: si misura dal primo arrivo'
      : `Efficienza dei viaggi: ${efficiency}% (100% = linea d'aria alla massima velocità)`;
  box.appendChild(info);
  const close = () => box.remove();
  box.addEventListener('click', close);
  setTimeout(close, DURATION);
  parent.appendChild(box);
}
