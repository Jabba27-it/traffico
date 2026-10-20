// Riquadro con gli obiettivi delle tre stelle e a che punto sei.
// Si chiude toccandolo o da solo dopo qualche secondo.

/** @typedef {import('../sim/stars.js').StarGoal} StarGoal */

const DURATION = 5000;

/**
 * @param {HTMLElement} parent
 * @param {StarGoal[]} goals
 */
export function showGoals(parent, goals) {
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
    progress.textContent = g.reached ? 'fatto' : g.progress;
    text.append(label, progress);
    row.append(star, text);
    box.appendChild(row);
  }
  const close = () => box.remove();
  box.addEventListener('click', close);
  setTimeout(close, DURATION);
  parent.appendChild(box);
}
