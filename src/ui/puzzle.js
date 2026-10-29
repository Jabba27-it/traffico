// Rompicapi: in alto tempo, arrivati e risorse; in basso un riquadro col testo,
// il programma del traffico e i tasti. Si costruisce a gioco fermo, poi "Via!":
// il traffico, sempre uguale, parte. Se va male il punto del problema pulsa e
// "Torna al progetto" riporta al progetto con le strade intatte.

import { traceShape, SHAPE_COLORS } from '../render/stations.js';
import { starsHtml } from './hud.js';
import { saveRecord } from './records.js';

/** @typedef {import('../sim/simulation.js').Simulation} Simulation */

/** Prefisso dei record dei rompicapi, accanto a quelli delle città. */
export const PUZZLE_RECORD = 'rompicapo.';

/** Dove si ricorda l'ultima soluzione riuscita di ogni rompicapo (le mosse fatte). */
const SOLUTION_PREFIX = 'traffico.soluzione.';

/**
 * Una mossa del progetto, per rifarla quando si riapre il rompicapo.
 * @typedef {{road: {x: number, y: number}[]} | {tap: {x: number, y: number}} | {remove: {x: number, y: number}}} PuzzleMove
 */

/** Lato in pixel delle forme disegnate nel programma. */
const SHAPE_ICON = 16;

/** Come si chiamano i tipi di veicolo nel programma. */
const TYPE_NAMES = { auto: 'auto', camion: 'camion', autobus: 'autobus' };

/**
 * @param {HTMLElement} parent
 * @param {Simulation} sim
 * @param {Object} options
 * @param {string} options.id  nome del file del rompicapo, per il record
 * @param {string} options.label  es. "Primi passi · 2 di 4"
 * @param {(points: {x: number, y: number}[]) => {x: number, y: number}[]} options.sample  infittisce una linea come un dito
 * @param {HTMLElement | null} options.speed  i tasti della velocità: si vedono solo mentre il traffico va
 * @param {(() => void) | null} options.onNext  apre il rompicapo successivo (null se è l'ultimo)
 * @param {() => void} options.onList  torna all'elenco dei rompicapi
 * @param {(stars: boolean[]) => void} options.onSolved  per suoni e avvisi
 */
export function createPuzzle(parent, sim, options) {
  const goal = /** @type {import('../sim/level.js').Puzzle} */ (sim.level.puzzle);
  const puzzle = /** @type {NonNullable<Simulation['puzzle']>} */ (sim.puzzle);

  // Le strade già fatte dei "Ripara" (coi loro sensi unici): gratis e non annullabili.
  for (const line of goal.roads) {
    const budget = sim.roadBudget;
    const bridges = sim.bridgeBudget;
    sim.roadBudget = Infinity;
    sim.bridgeBudget = Infinity; // anche i loro ponti sono già fatti
    sim.buildRoad(options.sample(line), 28);
    sim.roadBudget = budget;
    sim.bridgeBudget = bridges;
  }
  for (const t of goal.taps) sim.tap(t.x, t.y, 20);
  sim.startPuzzle();

  // Le mosse del progetto si annotano (l'annulla toglie l'ultima): quando il
  // rompicapo è risolto si salvano, e riaprendolo si ritrova la propria rete.
  /** @type {PuzzleMove[]} */
  let log = [];
  const changed = (/** @type {() => any} */ action, /** @type {PuzzleMove} */ move) => {
    const before = puzzle.moves;
    const result = action();
    if (puzzle.moves > before) log.push(move);
    return result;
  };
  const build = sim.buildRoad.bind(sim);
  const tap = sim.tap.bind(sim);
  const remove = sim.removeRoad.bind(sim);
  const undo = sim.undo.bind(sim);
  sim.buildRoad = (points, snap) => changed(() => build(points, snap), { road: points.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })) });
  sim.tap = (x, y, radius) => changed(() => tap(x, y, radius), { tap: { x, y } });
  sim.removeRoad = (piece) => {
    const at = sim.pieceMiddle(piece);
    return changed(() => remove(piece), { remove: at });
  };
  sim.undo = () => {
    const done = undo();
    if (done) log.pop();
    return done;
  };
  /** @type {PuzzleMove[] | null} */
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SOLUTION_PREFIX + options.id) ?? 'null');
  } catch {
    saved = null;
  }
  if (Array.isArray(saved)) {
    for (const m of saved) {
      if ('road' in m) sim.buildRoad(m.road, 28);
      else if ('tap' in m) sim.tap(m.tap.x, m.tap.y, 20);
      else if ('remove' in m) {
        const piece = sim.findRoadPiece(m.remove.x, m.remove.y, 6);
        if (piece) sim.removeRoad(piece);
      }
    }
    sim.lastMove = null;
  }
  const saveSolution = () => {
    try {
      localStorage.setItem(SOLUTION_PREFIX + options.id, JSON.stringify(log));
    } catch {
      // niente salvataggio: la rete resta solo per questa volta
    }
  };
  /** Ricomincia da zero: via la soluzione ricordata e la rete. */
  const startOver = () => {
    try {
      localStorage.removeItem(SOLUTION_PREFIX + options.id);
    } catch {
      // niente da togliere
    }
    location.reload();
  };

  /** @type {'progetto' | 'via' | 'esito'} */
  let phase = 'progetto';
  /** true mentre la soluzione si vede tratteggiata sulla mappa. */
  let showSolution = false;

  // ---- in alto: tempo, arrivati, risorse
  const hud = document.createElement('div');
  hud.className = 'hud';
  const time = item(hud, 'Tempo');
  const arrived = item(hud, 'Arrivati');
  const roads = item(hud, 'Strade');
  const bridges = sim.bridgeBudget > 0 ? item(hud, 'Ponti') : null;
  const overpasses = item(hud, 'Cavalc.');
  const moves = goal.moves !== null ? item(hud, 'Mosse') : null;
  parent.appendChild(hud);

  // ---- in basso: il riquadro
  const card = document.createElement('div');
  card.className = 'tutorial puzzle-card';
  parent.appendChild(card);

  const showSpeed = (/** @type {boolean} */ on) => {
    if (options.speed) options.speed.style.display = on ? '' : 'none';
  };

  /** @param {...(HTMLElement | string)} parts */
  const fill = (...parts) => {
    card.replaceChildren(...parts.map((p) => (typeof p === 'string' ? text('div', p) : p)));
    card.classList.remove('collapsed');
  };
  // Un tocco sul titolo richiude o riapre il riquadro (restano titolo e tasti).
  card.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('.tutorial-counter, .tutorial-title')) card.classList.toggle('collapsed');
  });
  // Appena si tocca la mappa per costruire, il riquadro si richiude da solo:
  // il testo non copre mai stazioni e strade.
  document.getElementById('game')?.addEventListener('pointerdown', () => card.classList.add('collapsed'));

  const project = () => {
    phase = 'progetto';
    sim.restartPuzzle();
    card.classList.remove('done');
    showSpeed(false);
    const go = button('Via!', () => {
      phase = 'via';
      showSpeed(true);
      running();
    });
    // Con una rete già fatta (anche ritrovata dall'ultima volta) si può ripartire da zero.
    const again = log.length > 0 ? [button('Ricomincia', startOver, 'link')] : [];
    const help = goal.hint || goal.solution.length > 0 ? [button('Aiuto', helpCard, 'secondary')] : [];
    fill(text('div', options.label, 'tutorial-counter'), text('div', sim.level.name, 'tutorial-title'), text('div', goal.text, 'tutorial-text'), programList(), buttons(...again, ...help, go));
  };

  // L'aiuto, in due passi: prima un consiglio, poi (se serve) la soluzione
  // tratteggiata sulla mappa, da ricalcare. Non costruisce niente al posto tuo.
  const helpCard = () => {
    const toggle = button(showSolution ? 'Nascondi la soluzione' : 'Mostra la soluzione', () => {
      showSolution = !showSolution;
      card.classList.add('collapsed');
      helpCard();
    }, 'secondary');
    const back = button('Indietro', project, 'link');
    fill(
      text('div', options.label, 'tutorial-counter'),
      text('div', 'Consiglio', 'tutorial-title'),
      text('div', goal.hint || 'Guarda la soluzione tratteggiata sulla mappa e ricalcala.', 'tutorial-text'),
      ...(showSolution ? [text('div', 'La soluzione è tratteggiata sulla mappa: ricalca le strade, tocca i punti che pulsano (il numero dice quante volte), disegna i cerchi nel verso della freccia, tocca le strade con la freccia finché le loro frecce vanno così, togli con una pressione lunga le strade con la croce.', 'tutorial-text puzzle-help-note')] : []),
      buttons(back, ...(goal.solution.length > 0 ? [toggle] : []), button('Via!', () => {
        phase = 'via';
        showSpeed(true);
        running();
      })),
    );
    if (showSolution) card.classList.add('collapsed');
  };

  const running = () => {
    fill(
      text('div', options.label, 'tutorial-counter'),
      text('div', 'Il traffico è partito', 'tutorial-title'),
      text('div', `Devono arrivare tutti entro ${clock(goal.time)}. Puoi guardare, accelerare o tornare al progetto.`, 'tutorial-text'),
      buttons(button('Torna al progetto', project, 'secondary')),
    );
  };

  const solved = () => {
    const stars = sim.puzzleStars();
    saveRecord(PUZZLE_RECORD + options.id, 0, stars);
    saveSolution();
    options.onSolved(stars);
    card.classList.add('done');
    showSpeed(false);
    const starLine = document.createElement('div');
    starLine.className = 'puzzle-stars';
    starLine.innerHTML = starsHtml(stars);
    // Le tre stelle una per una: cosa chiedevano e com'è andata.
    const thriftyGoal =
      goal.moves !== null
        ? `Al più ${goal.stars.moves ?? goal.moves} mosse: ne hai fatte ${puzzle.moves}`
        : `Al più ${goal.stars.roads} tratti: ne hai usati ${sim.puzzleRoadsUsed}`;
    const goals = document.createElement('div');
    goals.className = 'puzzle-goals';
    for (const [on, label] of /** @type {[boolean, string][]} */ ([
      [stars[0], 'Risolto'],
      [stars[1], thriftyGoal],
      [stars[2], `Tutti arrivati entro ${clock(goal.stars.time)}: in ${clock(puzzle.finishedAt)}`],
    ])) {
      const row = text('div', `${on ? '✓' : '✗'} ${label}`, on ? 'puzzle-goal-on' : 'puzzle-goal-off');
      goals.appendChild(row);
    }
    const list = [
      button('Migliora', project, 'secondary'),
      ...(options.onNext ? [button('Prossimo', options.onNext)] : [button('Rompicapi', options.onList)]),
    ];
    fill(
      text('div', options.label, 'tutorial-counter'),
      text('div', 'Risolto!', 'tutorial-title'),
      starLine,
      goals,
      buttons(...list),
    );
  };

  const failed = () => {
    showSpeed(false);
    const why =
      puzzle.result === 'ingorgo'
        ? 'Un veicolo è rimasto fermo troppo a lungo: il punto rosso è dove si è bloccato.'
        : `Il tempo è finito: ne sono arrivati ${sim.trips} su ${sim.puzzleTotal}.${puzzle.failPoint ? ' Il punto rosso è dove si è fermato il traffico.' : ''}`;
    fill(text('div', options.label, 'tutorial-counter'), text('div', 'Non ancora', 'tutorial-title'), text('div', why, 'tutorial-text'), buttons(button('Torna al progetto', project)));
  };

  /** Il programma del traffico: da dove, verso quale forma, quanti e che veicoli. */
  function programList() {
    const list = document.createElement('div');
    list.className = 'puzzle-program';
    const stations = sim.level.stations;
    if (goal.everyone) {
      // "da tutte a tutte": una riga sola invece di una per coppia
      const { count, every, type } = goal.everyone;
      const row = document.createElement('div');
      row.className = 'puzzle-row puzzle-row-all';
      row.append(text('span', 'Da ogni stazione a ognuna delle altre:', 'puzzle-to'), text('span', `${count} ${TYPE_NAMES[type]} per ognuna, ne parte una ogni ${String(every).replace('.', ',')} s`, 'puzzle-rate'));
      list.appendChild(row);
    }
    for (const d of goal.program) {
      if (d.everyone) continue;
      const row = document.createElement('div');
      row.className = 'puzzle-row';
      // Partenza e arrivo con la loro forma e il loro nome: "▲ Est → ● Nord".
      const from = stations.find((st) => st.name === d.from);
      const to = stations.filter((st) => st.shape === d.shape).map((st) => st.name).join(' o ');
      if (from) row.appendChild(shapeIcon(from.shape));
      row.append(text('span', `${d.from} →`), shapeIcon(d.shape), text('span', `${to}:`, 'puzzle-to'), text('span', `${d.count} ${TYPE_NAMES[d.type]} ogni ${String(d.every).replace('.', ',')} s`, 'puzzle-rate'));
      list.appendChild(row);
    }
    return list;
  }

  project();

  return {
    /** true se il traffico deve scorrere. */
    running: () => phase === 'via',
    /** La soluzione da disegnare tratteggiata, se chi gioca l'ha chiesta (solo nel progetto). */
    solution: () => (showSolution && phase === 'progetto' ? goal.solution : null),
    /** true se si può costruire: solo nel progetto, e nei "Ripara" finché restano mosse. */
    canBuild: () => phase === 'progetto' && (goal.moves === null || puzzle.moves < goal.moves),
    /** true se si può annullare: solo nel progetto. */
    canUndo: () => phase === 'progetto',
    /** Da chiamare a ogni fotogramma: aggiorna i numeri e si accorge della fine. */
    update() {
      time.textContent = `${clock(sim.elapsed)}/${clock(goal.time)}`;
      arrived.textContent = `${sim.trips}/${sim.puzzleTotal}`;
      roads.textContent = String(sim.roadBudget);
      roads.classList.toggle('hud-empty', sim.roadBudget === 0);
      if (bridges) bridges.textContent = String(sim.bridgeBudget);
      overpasses.textContent = String(sim.overpassBudget);
      if (moves) {
        moves.textContent = `${puzzle.moves}/${goal.moves}`;
        moves.classList.toggle('hud-empty', puzzle.moves >= /** @type {number} */ (goal.moves));
      }
      if (phase === 'via' && puzzle.result) {
        phase = 'esito';
        if (puzzle.result === 'risolto') solved();
        else failed();
      }
    },
  };
}

/** @param {number} seconds */
function clock(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * @param {HTMLElement} root
 * @param {string} label
 */
function item(root, label) {
  const box = document.createElement('div');
  box.className = 'hud-item';
  const value = text('div', '', 'hud-value');
  box.append(value, text('div', label, 'hud-label'));
  root.appendChild(box);
  return value;
}

/**
 * @param {string} tag
 * @param {string} content
 * @param {string} [className]
 */
function text(tag, content, className) {
  const el = document.createElement(tag);
  el.textContent = content;
  if (className) el.className = className;
  return el;
}

/**
 * @param {string} label
 * @param {() => void} onClick
 * @param {string} [className]
 */
function button(label, onClick, className) {
  const b = document.createElement('button');
  b.textContent = label;
  if (className) b.className = className;
  b.addEventListener('click', onClick);
  return b;
}

/** @param {...HTMLElement} list */
function buttons(...list) {
  const row = document.createElement('div');
  row.className = 'tutorial-buttons';
  row.append(...list);
  return row;
}

/** @param {import('../sim/stations.js').Shape} shape */
function shapeIcon(shape) {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.height = SHAPE_ICON * dpr;
  canvas.className = 'puzzle-shape';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.scale(dpr, dpr);
  ctx.beginPath();
  traceShape(ctx, shape, SHAPE_ICON / 2, SHAPE_ICON / 2, SHAPE_ICON * 0.42);
  ctx.fillStyle = SHAPE_COLORS[shape];
  ctx.fill();
  return canvas;
}
