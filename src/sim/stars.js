// Le tre stelle del livello: viaggi, giorni sopravvissuti, condizione speciale.

import { shortestPaths } from './pathfinding.js';

/** @typedef {import('./level.js').Stars} Stars */
/** @typedef {import('./graph.js').RoadGraph} RoadGraph */
/** @typedef {import('./stations.js').Station} Station */

/**
 * @typedef {Object} StarState  quello che serve sapere della partita
 * @property {number} trips
 * @property {number} daysSurvived  giorni interi trascorsi
 * @property {Station[]} stations
 * @property {number} hiddenNamed   luoghi con nome non ancora comparsi
 * @property {RoadGraph} graph
 */

/**
 * @typedef {Object} StarGoal
 * @property {string} label     es. "130 viaggi"
 * @property {string} progress  es. "34/130"
 * @property {boolean} reached
 */

/**
 * A che punto è ciascun obiettivo.
 * @param {Stars} goals
 * @param {StarState} s
 * @returns {StarGoal[]}
 */
export function starGoals(goals, s) {
  /** @type {StarGoal[]} */
  const list = [
    { label: `${goals.trips} viaggi`, progress: `${Math.min(s.trips, goals.trips)}/${goals.trips}`, reached: s.trips >= goals.trips },
    {
      label: `${goals.days} giorni`,
      progress: `${Math.min(s.daysSurvived, goals.days)}/${goals.days}`,
      reached: s.daysSurvived >= goals.days,
    },
  ];
  if (goals.special) list.push(specialGoal(goals.special, s));
  return list;
}

/**
 * @param {import('./level.js').SpecialGoal} special
 * @param {StarState} s
 * @returns {StarGoal}
 */
function specialGoal(special, s) {
  const targets = special.kind === 'collegaLuoghi' ? s.stations.filter((st) => st.landmark) : s.stations;
  const linked = largestNetwork(s.graph, targets);
  if (special.kind === 'collegaLuoghi') {
    const total = targets.length + s.hiddenNamed;
    return { label: special.text, progress: `${linked}/${total} luoghi collegati`, reached: total > 0 && linked === total };
  }
  const enough = s.stations.length >= special.min;
  return {
    label: special.text,
    progress: enough ? `${linked}/${s.stations.length} stazioni collegate` : `servono almeno ${special.min} stazioni`,
    reached: enough && linked === s.stations.length,
  };
}

/**
 * Quante delle stazioni indicate stanno nella stessa rete stradale, contando
 * la rete che ne raccoglie di più.
 * @param {RoadGraph} graph
 * @param {Station[]} targets
 */
function largestNetwork(graph, targets) {
  let best = 0;
  /** @type {Set<number>} */
  const counted = new Set();
  for (const t of targets) {
    if (counted.has(t.id)) continue;
    const reach = shortestPaths(graph, t.nodeId).dist;
    const group = targets.filter((o) => reach.has(o.nodeId));
    group.forEach((o) => counted.add(o.id));
    // Una stazione da sola non è "collegata" a niente.
    if (group.length > 1) best = Math.max(best, group.length);
  }
  return best;
}
