// Riquadro con gli obiettivi delle stelle (e del platino) e a che punto sei.
// Si chiude toccandolo o da solo dopo qualche secondo.

/** @typedef {import('../sim/stars.js').StarGoal} StarGoal */

const DURATION = 5000;

/**
 * @param {HTMLElement} parent
 * @param {StarGoal[]} goals
 * @param {StarGoal | null} [platinum]  la stella di platino, se il livello ce l'ha
 */
export function showGoals(parent, goals, platinum = null) {
  parent.querySelector('.goals')?.remove();
  const box = document.createElement('div');
  box.className = 'goals';
  for (const g of platinum ? [...goals, platinum] : goals) {
    const row = document.createElement('div');
    row.className = 'goals-row';
    const star = document.createElement('span');
    const shine = g === platinum ? 'star-platinum' : 'star-on';
    star.className = g.reached ? shine : g === platinum ? 'star-platinum-off' : 'star-off';
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
  const close = () => box.remove();
  box.addEventListener('click', close);
  setTimeout(close, DURATION);
  parent.appendChild(box);
}
