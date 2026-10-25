// Tutorial: un riquadro in basso con le istruzioni del passo in corso. Ogni passo
// può far comparire stazioni o una strada già pronta, e si chiude da solo quando
// il giocatore ha fatto l'esercizio (o con "Avanti" se è solo una spiegazione).
// Gli scenari di sconfitta (stazione piena, ingorgo) non fanno perdere: quando
// si perderebbe lo dicono e ricominciano.

import { waitingCount } from '../sim/congestion.js';
import { clearOfRoads } from '../sim/growth.js';
import { distanceToWater } from '../sim/water.js';
import { obstacleAt } from '../sim/terrain.js';

/** @typedef {import('../sim/simulation.js').Simulation} Simulation */
/** @typedef {import('../sim/level.js').TutorialStep} TutorialStep */
/** @typedef {{x: number, y: number}} Point */

/** Quanto resta "Fatto!" sullo schermo prima del passo successivo, in millisecondi. */
const DONE_PAUSE = 900;
/** Zoom che basta per dire "hai fatto zoom". */
const ZOOM_ENOUGH = 1.3;
const DONE_KEY = 'traffico.tutorialFatto';

/**
 * @param {HTMLElement} parent
 * @param {Simulation} sim
 * @param {TutorialStep[]} steps
 * @param {Object} options
 * @param {() => number} options.zoom  zoom attuale della telecamera
 * @param {(points: Point[]) => Point[]} options.sample  aggiunge punti lungo una spezzata, come un tratto disegnato
 * @param {(where: 'roma' | 'menu') => void} options.onFinish
 * @param {() => number} options.speed  velocità scelta (0, 1 o 2)
 * @param {() => number} options.goalsOpened  quante volte sono stati aperti gli obiettivi delle stelle
 * @param {(station: import('../sim/stations.js').Station) => void} options.popup  presenta una stazione nuova
 * @param {(kind: 'station' | 'jam') => void} options.wouldLose  dice che qui la partita sarebbe persa
 * @returns {{ update: () => void, hint: () => Point | null }}
 */
export function createTutorial(parent, sim, steps, options) {
  const card = document.createElement('div');
  card.className = 'tutorial';
  const counter = document.createElement('div');
  counter.className = 'tutorial-counter';
  const title = document.createElement('div');
  title.className = 'tutorial-title';
  const text = document.createElement('div');
  text.className = 'tutorial-text';
  const buttons = document.createElement('div');
  buttons.className = 'tutorial-buttons';
  card.append(counter, title, text, buttons);
  parent.appendChild(card);

  let index = -1;
  let doneAt = 0;
  /** Situazione all'inizio del passo, per capire cosa è cambiato. */
  let start = { trips: 0, events: { ...sim.events }, goals: 0 };
  /** Sovraccarico consentito fuori dagli scenari (nel tutorial non si perde mai). */
  const normalTolerance = sim.level.congestion.tolerance;
  /** @type {number[]} stazioni comparse in questo passo */
  let added = [];

  /**
   * @param {string} label
   * @param {() => void} onClick
   * @param {string} [kind]
   */
  const button = (label, onClick, kind = '') => {
    const b = document.createElement('button');
    b.textContent = label;
    if (kind) b.className = kind;
    b.addEventListener('click', onClick);
    buttons.appendChild(b);
  };

  const finish = () => {
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      // niente archivio: pazienza
    }
  };

  /** @param {number} i */
  const enter = (i) => {
    index = i;
    doneAt = 0;
    const step = steps[i];
    card.classList.remove('done');
    counter.textContent = `${i + 1} / ${steps.length}`;
    title.textContent = step.title;
    text.textContent = step.text;
    buttons.replaceChildren();

    const before = sim.stations.length;
    for (const def of step.addStations) sim.addStation(freeSpot(def), sim.elapsed);
    added = sim.stations.slice(before).map((s) => s.id);
    if (step.road) {
      // La strada dell'esercizio è un regalo: i tratti si restituiscono, e non si annulla.
      const budget = sim.roadBudget;
      sim.buildRoad(options.sample(step.road), 28);
      sim.roadBudget = budget;
      sim.lastMove = null;
    }
    sim.level.congestion.tolerance = step.tolerance ?? normalTolerance;
    fillQueue();
    if (step.van && step.van.length === 2) {
      const [a, b] = step.van.map(nearestStation);
      if (a && b) sim.parkVan(a.id, b.id);
    }
    if (step.popup) for (const id of added) {
      const s = sim.stations.find((x) => x.id === id);
      if (s) options.popup(s);
    }
    // Il passo dei premi: finisce una settimana di prova e si sceglie una carta.
    if (step.goal === 'premio') sim.rewardPending = true;
    sim.wouldLose = null;
    start = { trips: sim.trips, events: { ...sim.events }, goals: options.goalsOpened() };

    if (step.goal === 'avanti') button('Avanti', () => enter(i + 1));
    if (step.goal === 'fine') {
      finish();
      button('Gioca a Roma', () => options.onFinish('roma'));
      button('Menu', () => options.onFinish('menu'), 'secondary');
    } else {
      button('Salta tutorial', () => enter(steps.length - 1), 'link');
    }
  };

  /**
   * La stazione del passo nel punto previsto o, se lì il giocatore ha già
   * costruito una strada, nel punto libero più vicino.
   * @template {{x: number, y: number}} T
   * @param {T} def
   * @returns {T}
   */
  const freeSpot = (def) => {
    const rings = [...sim.roundabouts.values()];
    for (let r = 0; r <= 120; r += 15) {
      for (let k = 0; k < (r === 0 ? 1 : 12); k++) {
        const a = (k / 12) * Math.PI * 2;
        const p = { ...def, x: def.x + Math.cos(a) * r, y: def.y + Math.sin(a) * r };
        const dry = distanceToWater(sim.level.waters, p) > 25 && !obstacleAt(sim.level.terrain, p, 25);
        if (dry && clearOfRoads(p, sim.graph, rings)) return p;
      }
    }
    return def;
  };

  /** @param {{x: number, y: number}} p */
  const nearestStation = (p) =>
    sim.stations.reduce((best, s) => (!best || Math.hypot(s.x - p.x, s.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? s : best), /** @type {any} */ (null));

  /** Scenario "stazione piena": la stazione comparsa ha già la coda lunga. */
  const fillQueue = () => {
    const step = steps[index];
    if (!step.queue) return;
    const station = sim.stations.find((s) => s.id === added[0]);
    if (!station) return;
    // In coda per la stazione più vicina: collegandola, la coda si svuota davvero.
    const near = sim.stations
      .filter((s) => s !== station && s.shape !== station.shape)
      .reduce((best, s) => (!best || Math.hypot(s.x - station.x, s.y - station.y) < Math.hypot(best.x - station.x, best.y - station.y) ? s : best), /** @type {any} */ (null));
    if (!near) return;
    station.queue = Array(step.queue).fill(near.shape);
    station.returned = 0;
    station.overload = 0;
  };

  /** true se la stazione è collegata ad almeno un'altra. */
  const linked = (/** @type {number} */ id) => {
    const s = sim.stations.find((x) => x.id === id);
    if (!s) return false;
    const dist = sim.paths(s.nodeId).dist;
    return sim.stations.some((o) => o !== s && dist.has(o.nodeId));
  };

  /** true se l'esercizio del passo in corso è fatto. */
  const reached = () => {
    const step = steps[index];
    const ev = sim.events;
    switch (step.goal) {
      case 'collega':
        return sim.stations.every((a) => sim.stations.every((b) => a === b || sim.paths(a.nodeId).dist.has(b.nodeId)));
      case 'viaggi': {
        // Se il passo ha fatto comparire stazioni, contano i viaggi partiti da quelle.
        const trips = added.length > 0 ? added.reduce((n, id) => n + (sim.tripsFrom.get(id) ?? 0), 0) : sim.trips - start.trips;
        return trips >= step.count;
      }
      case 'rimuovi':
        return ev.removed > start.events.removed;
      case 'tipoStrada':
        return ev.roadType > start.events.roadType;
      case 'incrocio':
        return ev.junction > start.events.junction;
      case 'rotonda':
        return ev.roundabout > start.events.roundabout;
      case 'zoom':
        return options.zoom() >= ZOOM_ENOUGH;
      case 'annulla':
        return ev.undo > start.events.undo;
      case 'ponte':
        return ev.bridge > start.events.bridge;
      case 'premio':
        return ev.reward > start.events.reward;
      case 'velocita':
        return options.speed() === 2;
      case 'stelle':
        return options.goalsOpened() > start.goals;
      case 'salva': {
        const s = sim.stations.find((x) => x.id === added[0]);
        return Boolean(s && linked(s.id) && waitingCount(s) <= s.capacity);
      }
      case 'sblocca':
        return !sim.vehicles.some((v) => v.parked);
      default:
        return false;
    }
  };

  enter(0);

  return {
    update() {
      // Qui la partita sarebbe persa: si dice e lo scenario ricomincia.
      if (sim.wouldLose) {
        const kind = sim.wouldLose;
        sim.wouldLose = null;
        const goal = steps[index]?.goal;
        if ((kind === 'station' && goal === 'salva') || (kind === 'jam' && goal === 'sblocca')) {
          options.wouldLose(kind);
          if (kind === 'station') fillQueue();
          for (const v of sim.vehicles) v.stopped = 0;
        }
      }
      if (index >= steps.length - 1 || steps[index].goal === 'avanti') return;
      if (doneAt) {
        if (performance.now() - doneAt > DONE_PAUSE) enter(index + 1);
        return;
      }
      if (reached()) {
        doneAt = performance.now();
        card.classList.add('done');
        title.textContent = 'Fatto!';
      }
    },
    hint: () => (doneAt ? null : steps[index]?.hint ?? null),
  };
}
