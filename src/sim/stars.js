// Le tre stelle del livello: viaggi, giorni sopravvissuti, poco traffico lento.

/** @typedef {import('./level.js').Stars} Stars */

/**
 * @typedef {Object} StarState  quello che serve sapere della partita
 * @property {number} trips
 * @property {number} daysSurvived  giorni interi trascorsi
 * @property {number | null} slowTraffic  traffico lento medio in percentuale
 */

/**
 * @typedef {Object} StarGoal
 * @property {string} label     es. "130 viaggi"
 * @property {string} progress  es. "34/130"
 * @property {boolean} reached
 * @property {boolean} lasting  true se, una volta presa, la stella resta presa;
 *   la stella del traffico invece si può riperdere fino a fine partita
 */

/**
 * A che punto è ciascun obiettivo.
 * @param {Stars} goals
 * @param {StarState} s
 * @returns {StarGoal[]}
 */
export function starGoals(goals, s) {
  return [
    {
      label: `${goals.trips} viaggi`,
      progress: `${Math.min(s.trips, goals.trips)}/${goals.trips}`,
      reached: s.trips >= goals.trips,
      lasting: true,
    },
    {
      label: `${goals.days} giorni`,
      progress: `${Math.min(s.daysSurvived, goals.days)}/${goals.days}`,
      reached: s.daysSurvived >= goals.days,
      lasting: true,
    },
    trafficGoal(goals.traffic, s),
  ];
}

/**
 * @param {import('./level.js').TrafficGoal} goal
 * @param {StarState} s
 * @returns {StarGoal}
 */
function trafficGoal(goal, s) {
  const label = `Traffico lento sotto il ${goal.max}%`;
  // Conta solo dopo un po' di viaggi: all'inizio le strade sono vuote e la media non dice niente.
  if (s.trips < goal.min || s.slowTraffic === null) {
    return { label, progress: `si misura dopo ${goal.min} viaggi`, reached: false, lasting: false };
  }
  return {
    label,
    progress: `ora ${s.slowTraffic}% (massimo ${goal.max}%)`,
    reached: s.slowTraffic <= goal.max,
    lasting: false,
  };
}
