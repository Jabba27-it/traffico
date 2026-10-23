// Le tre stelle del livello: viaggi, giorni sopravvissuti, poco traffico lento per un po' di fila.
// Più la stella di platino: viaggi efficienti quando si prende la terza.

/** @typedef {import('./level.js').Stars} Stars */

/**
 * @typedef {Object} StarState  quello che serve sapere della partita
 * @property {number} trips
 * @property {number} daysSurvived  giorni interi trascorsi
 * @property {number} stations       stazioni comparse finora
 * @property {number} lastGenerated  veicoli generati dall'ultima stazione nata
 * @property {number} trafficNow     traffico lento attuale, in percentuale
 * @property {number} trafficStreak  secondi di gioco di fila col traffico attuale sotto la soglia
 * @property {number | null} efficiency  efficienza dei viaggi in percentuale, null finché nessuno è arrivato
 */

/**
 * @typedef {Object} StarGoal
 * @property {string} label     es. "130 viaggi"
 * @property {string} progress  es. "34/130"
 * @property {boolean} reached
 * @property {boolean} lasting  true se, una volta presa, la stella resta presa
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
  const label = `Traffico lento sotto il ${goal.max}% per ${goal.hold} s`;
  // Si misura solo a città completa, dopo che l'ultima stazione ha mandato in giro
  // un po' di veicoli: prima le strade sono vuote e sarebbe troppo facile.
  if (s.stations < goal.stations) {
    return { label, progress: `serve la città completa: ${s.stations}/${goal.stations} stazioni`, reached: false, lasting: true };
  }
  if (s.lastGenerated < goal.after) {
    return { label, progress: `l'ultima stazione deve generare ${goal.after} veicoli (${s.lastGenerated}/${goal.after})`, reached: false, lasting: true };
  }
  return {
    label,
    progress: `ora ${s.trafficNow}%: ${Math.floor(s.trafficStreak)}/${goal.hold} s di fila`,
    reached: s.trafficStreak >= goal.hold,
    lasting: true,
  };
}

/**
 * La stella di platino: alla fine, quando arriva la terza stella, l'efficienza
 * dei viaggi di tutta la partita deve essere almeno quella chiesta.
 * @param {number} min  efficienza minima in percentuale
 * @param {StarState} s
 * @returns {StarGoal}
 */
export function platinumGoal(min, s) {
  return {
    label: `Platino: efficienza dei viaggi almeno ${min}% quando prendi la terza stella`,
    progress: s.efficiency === null ? 'si misura dal primo arrivo' : `ora ${s.efficiency}%`,
    reached: s.efficiency !== null && s.efficiency >= min,
    lasting: false,
  };
}
