// Tutorial: un riquadro in basso con le istruzioni del passo in corso. Ogni passo
// può far comparire stazioni o una strada già pronta, e si chiude da solo quando
// il giocatore ha fatto l'esercizio (o con "Avanti" se è solo una spiegazione).

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
  let start = { trips: 0, events: { ...sim.events } };
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
    for (const def of step.addStations) sim.addStation(def, sim.elapsed);
    added = sim.stations.slice(before).map((s) => s.id);
    if (step.road) {
      // La strada dell'esercizio è un regalo: i tratti si restituiscono.
      const budget = sim.roadBudget;
      sim.buildRoad(options.sample(step.road), 28);
      sim.roadBudget = budget;
    }
    start = { trips: sim.trips, events: { ...sim.events } };

    if (step.goal === 'avanti') button('Avanti', () => enter(i + 1));
    if (step.goal === 'fine') {
      finish();
      button('Gioca a Roma', () => options.onFinish('roma'));
      button('Menu', () => options.onFinish('menu'), 'secondary');
    } else {
      button('Salta tutorial', () => enter(steps.length - 1), 'link');
    }
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
      default:
        return false;
    }
  };

  enter(0);

  return {
    update() {
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
