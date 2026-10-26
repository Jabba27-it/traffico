import { RoadGraph } from './sim/graph.js';
import { parseLevel, sandboxLevel } from './sim/level.js';
import { Simulation, JAM_LOSS } from './sim/simulation.js';
import { setupCanvas, fitCamera, scaleFor, useScreenSpace, useWorldSpace, screenToWorld } from './render/canvas.js';
import { createCamera, cameraRect, zoomAround } from './render/camera.js';
import { attachPinch } from './input/pinch.js';
import { drawRoads, drawBridgeTops, drawLaneMarks, drawOverpasses, drawPreview, drawRemoval, drawWater, drawOutsideVeil } from './render/roads.js';
import { currentPiece } from './sim/vehicles.js';
import { drawJunctionMarks, drawRoundaboutIslands } from './render/junctions.js';
import { STYLE } from './render/style.js';
import { drawHint } from './render/hint.js';
import { createTutorial } from './ui/tutorial.js';
import { drawGround, drawMonuments, drawTerrainNames } from './render/terrain.js';
import { drawStations, drawSelectable, stationAreas } from './render/stations.js';
import { STATION_RADIUS } from './sim/stations.js';
import { drawVehicles } from './render/vehicles.js';
import { drawCongestion, drawJams } from './render/congestion.js';
import { attachRoadDrawing } from './input/drawRoad.js';
import { createHud } from './ui/hud.js';
import { showGameOver } from './ui/gameOver.js';
import { createSpeedControls } from './ui/speed.js';
import { showRewardChoice, showStationPrompt, REWARD_ICONS } from './ui/reward.js';
import { showToast } from './ui/toast.js';
import { showStationPopup } from './ui/stationPopup.js';
import { showNotice } from './ui/notice.js';
import { showGoals } from './ui/goals.js';
import { showMenu, parseIndex, GAME_TITLE } from './ui/menu.js';
import { cityPhoto } from './render/photo.js';
import { showPhoto } from './ui/photo.js';
import { saveRecord, SANDBOX_SUFFIX } from './ui/records.js';
import { askConfirm } from './ui/confirm.js';
import { createMuteButton } from './ui/mute.js';
import { createUndoButton } from './ui/undo.js';
import { unlockAudioOnTouch, playSegment, playRoad, playBridge, playRoundabout, playError, playStation, playRemove, playTap, playHeartbeat, playWeek, playStar } from './audio/sounds.js';
import { waitingCount } from './sim/congestion.js';

// Il livello si sceglie dall'indirizzo, es. ?livello=roma; senza livello si apre il menu.
const LEVEL_PARAM = new URLSearchParams(location.search).get('livello');
// ?livello=roma&modalita=sandbox: si gioca finché non si perde, conta solo il punteggio.
const SANDBOX = new URLSearchParams(location.search).get('modalita') === 'sandbox';

// Copia del gioco sul telefono, per giocare anche offline (funziona su https e in locale).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
const LEVEL_NAME = LEVEL_PARAM && /^[a-z0-9_-]+$/.test(LEVEL_PARAM) ? LEVEL_PARAM : null;
const LEVEL_URL = `levels/${LEVEL_NAME}.json`;
const INDEX_URL = 'levels/indice.json';
const MENU_ICON =
  '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="2" y="3" width="14" height="2.2" rx="1"/><rect x="2" y="8" width="14" height="2.2" rx="1"/><rect x="2" y="13" width="14" height="2.2" rx="1"/></svg>';
const STAR_NAMES = ['Prima', 'Seconda', 'Terza'];
/** @type {Record<string, string>} avvisi dopo un tocco breve sulla mappa */
const TAP_MESSAGES = {
  'not-a-cross': 'Il cavalcavia si fa solo dove due strade si incrociano a croce',
  'normal-no-overpass': 'Cavalcavia finiti: ne arrivano altri coi premi',
  built: 'Cavalcavia costruito',
  removed: 'Cavalcavia tolto: torna incrocio',
  two: 'Doppio senso',
  forward: 'Senso unico',
  backward: 'Senso unico (al contrario)',
  super: 'Superstrada',
  'super-too-expensive': 'Doppio senso: per la superstrada servono più tratti',
  roundabout: 'Rotatoria',
  'roundabout-removed': 'Rotatoria tolta: torna incrocio',
};
/** @type {Record<string, {title: string, text: string}>} perché una strada o una rotonda non si è costruita */
const BUILD_PROBLEMS = {
  'cut-roads': { title: 'Tratti di strada finiti', text: 'La strada si ferma dove finiscono i tratti. Ne arrivano altri ogni giorno, oppure togli una strada che non serve.' },
  'cut-bridges': { title: 'Servono ponti', text: 'Per attraversare l\'acqua serve un ponte e li hai finiti. Ne puoi scegliere altri come premio a fine settimana.' },
  'cut-long': { title: 'Ponte troppo lungo', text: 'Un ponte può essere lungo al massimo il doppio della larghezza del fiume: attraversalo più dritto o in un punto più stretto.' },
  'cut-water': { title: 'La strada finisce in acqua', text: 'Una strada deve arrivare sulla terra: allungala fino all\'altra riva.' },
  'cut-sea': { title: 'Sul mare non si costruisce', text: 'Il mare e le baie aperte non si attraversano: gira intorno passando dalla terra.' },
  'cut-outside': { title: 'Fuori città', text: 'Si costruisce solo nella parte visibile della città, che si allarga con i giorni.' },
  'cut-villa': { title: 'C\'è un parco', text: 'Nei parchi e nelle ville non si costruisce: passaci attorno.' },
  'cut-monument': { title: 'C\'è un monumento', text: 'Sui monumenti non si costruisce: passaci attorno.' },
  'roundabout-too-expensive': { title: 'Tratti di strada finiti', text: 'L\'anello della rotonda costa più tratti di quelli che hai.' },
  'roundabout-station': { title: 'Una stazione nel cerchio', text: 'La rotonda non può contenere una stazione: disegna il cerchio intorno a un incrocio.' },
  'roundabout-blocked': { title: 'Qui la rotonda non ci sta', text: 'L\'anello passerebbe sull\'acqua, su un parco, su un monumento o fuori città.' },
  'roundabout-overlap': { title: 'Troppo vicina a un\'altra rotonda', text: 'Due rotonde non si sovrappongono: disegna il cerchio più lontano, o più grande dell\'altra per sostituirla.' },
  'roundabout-overpass': { title: 'C\'è un cavalcavia', text: 'Una rotonda non può contenere un cavalcavia: toglilo prima con un tocco, o disegna il cerchio altrove.' },
};
/** Quante carte premio si propongono a fine settimana (scelte a caso fra quelle possibili). */
const REWARD_CHOICES = 3;
const OUTSIDE = STYLE.outside;
const BACKGROUND = STYLE.land;
/** Passo fisso della simulazione, in secondi. */
const STEP = 1 / 60;
/** Oltre questo ritardo (es. scheda in background) il tempo perso non si recupera. */
const MAX_FRAME_TIME = 0.25;

async function start() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));

  if (!LEVEL_NAME) {
    try {
      const res = await fetch(INDEX_URL);
      if (!res.ok) throw new Error(`Impossibile caricare ${INDEX_URL} (${res.status})`);
      showMenu(document.body, parseIndex(await res.json()), (file, sandbox) => {
        location.search = `?livello=${file}${sandbox ? '&modalita=sandbox' : ''}`;
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  let level;
  try {
    const res = await fetch(LEVEL_URL);
    if (!res.ok) throw new Error(`Impossibile caricare ${LEVEL_URL} (${res.status})`);
    level = parseLevel(await res.json());
    if (SANDBOX) level = sandboxLevel(level);
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
    return;
  }

  const view = setupCanvas(canvas);
  const graph = new RoadGraph();
  const sim = new Simulation(graph, level, Date.now());
  const camera = createCamera();
  // La telecamera si riallinea anche al tocco, non solo quando si disegna:
  // così il dito cade sempre dove si vede, anche se un fotogramma è in ritardo.
  const toWorld = (/** @type {number} */ x, /** @type {number} */ y) => {
    fitCamera(view, cameraRect(camera, sim.view));
    return screenToWorld(view, x, y);
  };
  const drawing = attachRoadDrawing(canvas, graph, toWorld, () => 1 / view.scale, {
    build: (points, snapRadius) => {
      const bridgesBefore = sim.bridgeBudget;
      const roadsBefore = sim.roadBudget;
      const result = sim.buildRoad(points, snapRadius);
      if (result === 'roundabout') playRoundabout();
      else if (sim.bridgeBudget < bridgesBefore) playBridge();
      else if (sim.roadBudget < roadsBefore) playRoad();
      if (result && BUILD_PROBLEMS[result]) playError();
      if (result && BUILD_PROBLEMS[result]) showNotice(document.body, BUILD_PROBLEMS[result]);
      else if (result && TAP_MESSAGES[result]) showToast(document.body, TAP_MESSAGES[result]);
    },
    findPiece: (x, y, radius) => sim.findRoadPiece(x, y, radius),
    remove: (piece) => {
      sim.removeRoad(piece);
      playRemove();
    },
    active: () => !choosingStation && !gameOverShown,
    tap: (x, y, radius) => {
      const result = sim.tap(x, y, Math.max(radius, 20));
      if (result) playTap(result);
      if (result && TAP_MESSAGES[result]) showToast(document.body, TAP_MESSAGES[result]);
    },
  });
  attachPinch(canvas, {
    toWorld,
    zoom: () => camera.zoom,
    zoomAround: (zoom, anchor, screen) =>
      zoomAround(camera, sim.view, zoom, anchor, screen, (r) => scaleFor(view, r), view),
  });
  const hasWater = level.waters.length > 0;
  /** Quante volte sono stati aperti gli obiettivi delle stelle (serve al tutorial). */
  let goalsOpened = 0;
  const hud = createHud(document.body, {
    bridges: hasWater,
    stars: level.stars !== null,
    // Nei livelli contano le stelle, in sandbox solo il punteggio.
    score: SANDBOX,
    onStarsTap: () => {
      goalsOpened++;
      showGoals(document.body, sim.starGoals(), sim.platinumGoal());
    },
  });
  const speed = createSpeedControls(document.body);
  const tutorial = level.tutorial
    ? createTutorial(document.body, sim, level.tutorial, {
        zoom: () => camera.zoom,
        sample: densify,
        onFinish: (where) => {
          if (where === 'roma') location.search = '?livello=roma';
          else goToMenu();
        },
        speed: () => speed.speed(),
        goalsOpened: () => goalsOpened,
        popup: (station) => showStationPopup(document.body, station),
        wouldLose: (kind) =>
          showNotice(
            document.body,
            kind === 'station'
              ? { title: 'Qui avresti perso', text: 'La stazione è rimasta piena troppo a lungo: in una partita vera sarebbe finita. Riprova: collegala prima che l\'arco si chiuda.' }
              : { title: 'Qui avresti perso', text: `Un veicolo è rimasto fermo per ${JAM_LOSS} secondi: in una partita vera sarebbe finita. Riprova: togli la strada bloccata prima che l\'arco si chiuda.` },
          ),
      })
    : null;
  /** true mentre si chiede se uscire: il gioco resta fermo. */
  let askingToLeave = false;
  const menuButton = document.createElement('button');
  menuButton.className = 'menu-button';
  menuButton.setAttribute('aria-label', 'Menu');
  menuButton.innerHTML = MENU_ICON;
  menuButton.addEventListener('click', async () => {
    if (askingToLeave || sim.failed) return;
    askingToLeave = true;
    const leave = await askConfirm(document.body, 'Uscire dalla partita? I progressi di questa partita andranno persi.', 'Esci', 'Continua');
    askingToLeave = false;
    if (leave) goToMenu();
  });
  document.body.appendChild(menuButton);
  unlockAudioOnTouch();
  createMuteButton(document.body);
  // Annulla l'ultima mossa.
  const undoButton = createUndoButton(document.body, {
    canUndo: () => sim.canUndo && !gameOverShown && !choosingStation && !sim.rewardPending,
    onUndo: () => {
      if (!sim.undo()) return;
      playRemove();
      showToast(document.body, 'Mossa annullata');
    },
  });

  let lastTime = performance.now();
  /** Tratti della strada che si sta disegnando, per il tic a ogni tratto nuovo. */
  let previewCost = 0;
  /** Quando suona il prossimo battito delle stazioni piene (ms, come performance.now). */
  let nextBeat = 0;
  let pending = 0;
  let gameOverShown = false;
  let rewardShown = false;
  /** Stazioni già annunciate: quelle presenti all'inizio non hanno pop-up. */
  let knownStations = sim.stations.length;
  /** Dopo aver scelto "migliora una stazione", finché non se ne tocca una. */
  let choosingStation = false;
  /** @type {() => void} */
  let hidePrompt = () => {};

  canvas.addEventListener('pointerdown', (e) => {
    if (!choosingStation) return;
    const r = canvas.getBoundingClientRect();
    const p = screenToWorld(view, e.clientX - r.left, e.clientY - r.top);
    const reach = Math.max(STATION_RADIUS + 12, 26 / view.scale);
    const station = sim.stations.find((s) => Math.hypot(s.x - p.x, s.y - p.y) <= reach);
    if (!station) return;
    sim.chooseUpgradeReward(station.id);
    choosingStation = false;
    rewardShown = false;
    hidePrompt();
  });

  const overlays = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.hud, .speed, .menu-button')]);
  /** @type {{index: number, label: string} | null} */
  let lastStar = null;

  /**
   * Le zone di mappa coperte da pannello e pulsanti, viste con la città intera
   * inquadrata (zoom 1): lì la simulazione non fa nascere stazioni.
   */
  function updateReserved() {
    const base = { ...view };
    fitCamera(base, sim.view);
    const c = canvas.getBoundingClientRect();
    sim.reserved = overlays.map((el) => {
      const r = el.getBoundingClientRect();
      const a = screenToWorld(base, r.left - c.left, r.top - c.top);
      const b = screenToWorld(base, r.right - c.left, r.bottom - c.top);
      return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
    });
  }

  /** @param {number} now */
  function frame(now) {
    // Un errore imprevisto in un fotogramma non deve bloccare il gioco per sempre:
    // si salta quel fotogramma e si va avanti.
    try {
      drawFrame(now);
    } catch (err) {
      console.error(err);
      sim.repair();
    }
    requestAnimationFrame(frame);
  }

  /** @param {number} now */
  function drawFrame(now) {
    updateReserved();
    tutorial?.update();
    // A velocità doppia scorre il doppio del tempo di gioco, sempre a passi fissi.
    pending += Math.min((now - lastTime) / 1000, MAX_FRAME_TIME) * speed.speed();
    lastTime = now;
    const running = sim.running && !askingToLeave;
    while (pending >= STEP && running && sim.running) {
      sim.step(STEP);
      pending -= STEP;
    }
    // A gioco fermo il tempo non si accumula, così alla ripresa non c'è un balzo in avanti.
    if (!running || !sim.running) pending = 0;

    // Con una stazione oltre la capienza si sente un battito, più fitto man mano
    // che il conto alla rovescia avanza (solo a gioco in corso).
    const urgency = Math.max(
      0,
      ...sim.stations.filter((s) => waitingCount(s) > s.capacity).map((s) => s.overload / level.congestion.tolerance),
      ...sim.jams.map((j) => j.progress),
    );
    if (urgency > 0 && running && sim.running && speed.speed() > 0) {
      if (now >= nextBeat) {
        playHeartbeat(urgency);
        nextBeat = now + 1400 - 900 * urgency;
      }
    } else {
      nextBeat = 0;
    }

    if (sim.lastStar && sim.lastStar !== lastStar) {
      lastStar = sim.lastStar;
      playStar();
      showToast(document.body, `★ ${STAR_NAMES[lastStar.index]} stella: ${lastStar.label}`);
      // Le stelle si salvano subito: restano anche se poi si esce dalla partita.
      if (!SANDBOX) saveRecord(/** @type {string} */ (LEVEL_NAME), 0, sim.starsEarned, sim.platinum);
      const min = level.stars?.platinum;
      if (min != null && sim.starsEarned.every(Boolean) && !sim.completed) {
        setTimeout(() => showToast(document.body, `Tre stelle! Resisti altri ${min} giorni per il platino`), 2500);
      }
    }

    if (sim.rewardPending && !rewardShown) {
      rewardShown = true;
      playWeek();
      const cards = [
        {
          icon: REWARD_ICONS.roads,
          value: `+${level.rewards.roads}`,
          label: 'tratti di strada',
          onPick: () => {
            sim.chooseRoadsReward();
            rewardShown = false;
          },
        },
        {
          icon: REWARD_ICONS.upgrade,
          value: `+${level.rewards.capacity}`,
          label: 'capienza a una stazione',
          onPick: () => {
            choosingStation = true;
            hidePrompt = showStationPrompt(document.body);
          },
        },
      ];
      if (hasWater) {
        cards.push({
          icon: REWARD_ICONS.bridge,
          value: `+${level.rewards.bridges}`,
          label: level.rewards.bridges === 1 ? 'ponte' : 'ponti',
          onPick: () => {
            sim.chooseBridgesReward();
            rewardShown = false;
          },
        });
      }
      cards.push({
        icon: REWARD_ICONS.overpass,
        value: `+${level.rewards.overpasses}`,
        label: 'cavalcavia',
        onPick: () => {
          sim.chooseOverpassReward();
          rewardShown = false;
        },
      });
      // Ogni settimana solo alcune carte, a caso: la scelta cambia ogni volta.
      while (cards.length > REWARD_CHOICES) cards.splice(Math.floor(Math.random() * cards.length), 1);
      showRewardChoice(document.body, sim.rewardedWeeks, cards);
    }
    // Nel tutorial le stazioni nuove le presenta già il riquadro delle istruzioni.
    if (sim.stations.length > knownStations) {
      // Nel tutorial le stazioni le presenta il passo che le fa comparire.
      if (!tutorial) showStationPopup(document.body, sim.stations[sim.stations.length - 1]);
      playStation();
      knownStations = sim.stations.length;
    }
    const results = {
      score: sim.score,
      seconds: sim.seconds,
      trips: sim.trips,
      day: sim.day,
      dayProgress: sim.dayProgress,
      roads: sim.roadBudget,
      bridges: sim.bridgeBudget,
      overpasses: sim.overpassBudget,
      stars: sim.starsEarned,
      platinum: level.stars?.platinum != null ? sim.platinum : undefined,
      platinumDays: level.stars?.platinum ?? null,
      daysAfterThree: sim.starState().daysAfterThree,
      slowTraffic: sim.slowTraffic,
    };
    hud.update(results);
    undoButton.update();
    if ((sim.failed || sim.completed) && !gameOverShown) {
      gameOverShown = true;
      const best = SANDBOX
        ? saveRecord(`${LEVEL_NAME}${SANDBOX_SUFFIX}`, sim.score, [false, false, false])
        : level.stars
          ? saveRecord(/** @type {string} */ (LEVEL_NAME), sim.score, sim.starsEarned, sim.platinum)
          : null;
      const onPhoto = () => {
        const info = { game: GAME_TITLE, city: level.name, days: results.day - 1, trips: sim.trips, stars: sim.starsEarned, platinum: sim.platinum, score: SANDBOX ? sim.score : undefined };
        cityPhoto(level, sim, info)
          .then((image) => showPhoto(document.body, image, `traffico-${LEVEL_NAME}.png`, `La mia ${level.name} in ${GAME_TITLE}`))
          .catch((err) => console.error(err));
      };
      const cause = sim.failedJam
        ? `Un ingorgo ha tenuto fermi i veicoli per ${JAM_LOSS} secondi.`
        : `${sim.failedStation?.name ? `La stazione ${sim.failedStation.name}` : 'Una stazione'} è rimasta sovraccarica troppo a lungo.`;
      showGameOver(document.body, results, best, { onRetry: () => location.reload(), onMenu: goToMenu, onPhoto }, sim.completed, cause, SANDBOX);
    }

    const { ctx } = view;
    const visible = sim.view;
    const framed = cameraRect(camera, visible);
    fitCamera(view, framed);
    useScreenSpace(view);
    ctx.fillStyle = OUTSIDE;
    ctx.fillRect(0, 0, view.width, view.height);
    useWorldSpace(view);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, level.world.width, level.world.height);
    drawGround(ctx, level.terrain);
    drawWater(ctx, level.waters);
    drawMonuments(ctx, level.terrain);
    drawOutsideVeil(ctx, level.world, visible);
    drawRoads(ctx, graph, sim.traffic.congestion, level.look);
    drawLaneMarks(ctx, graph);
    drawRoundaboutIslands(ctx, sim.roundabouts.values(), level.look);
    drawJunctionMarks(ctx, graph, sim.lanes);
    const preview = drawing.preview();
    if (preview.length >= 2) {
      const plan = sim.planRoad(preview);
      const cost = sim.roadCost(plan);
      drawPreview(ctx, preview, plan.cut, cost, plan.bridges, framed);
      // Un tic per ogni tratto in più, mentre il dito allunga la strada.
      if (cost > previewCost) playSegment(cost);
      previewCost = cost;
    } else {
      previewCost = 0;
    }
    const removal = drawing.removal();
    const finger = drawing.finger();
    if (removal && finger) drawRemoval(ctx, graph, removal, sim.refundOf(removal), finger, framed);
    // Chi passa sotto un cavalcavia sparisce sotto l'impalcato; chi passa sopra si vede sopra.
    const elevated = sim.vehicles.filter((v) => currentPiece(sim.lanes, v).elevated);
    drawVehicles(ctx, sim.vehicles.filter((v) => !elevated.includes(v)));
    drawOverpasses(ctx, graph, level.look);
    drawVehicles(ctx, elevated);
    // Veicoli fermi da troppo: il contorno pulsa di rosso (allarme ingorgo).
    drawJams(ctx, sim.jams, now / 1000);
    // Torri, archi e cavi dei ponti coprono i veicoli che ci passano sotto.
    drawBridgeTops(ctx, graph, level.look);
    drawCongestion(ctx, sim.stations, level.congestion.tolerance, now / 1000);
    const labelScale = framed.width / level.view[0].width;
    drawTerrainNames(ctx, level.terrain, labelScale, stationAreas(ctx, sim.stations, labelScale));
    drawStations(ctx, sim.stations, sim.transitShapes(), sim.elapsed, labelScale);
    const hint = tutorial?.hint();
    if (hint) drawHint(ctx, hint, now / 1000, labelScale);
    if (choosingStation) drawSelectable(ctx, sim.stations, now / 1000);
    // Allarme ingorgo: gli stessi cerchi rossi che si allargano della sconfitta,
    // così il veicolo fermo si nota subito anche da lontano.
    if (sim.running) for (const j of sim.jams) drawHint(ctx, j, now / 1000, labelScale * 1.4, STYLE.blockedText);
    // A partita persa, la stazione che ha fatto perdere pulsa in rosso.
    if (sim.failedStation) drawHint(ctx, sim.failedStation, now / 1000, labelScale * 1.4, STYLE.blockedText);
    if (sim.failedJam) drawHint(ctx, sim.failedJam, now / 1000, labelScale * 1.4, STYLE.blockedText);
  }

  requestAnimationFrame((now) => {
    lastTime = now;
    frame(now);
  });
}

/**
 * Aggiunge punti lungo una spezzata, uno ogni 24 unità circa, come un tratto
 * disegnato col dito.
 * @param {{x: number, y: number}[]} points
 */
function densify(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 24));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

function goToMenu() {
  location.href = location.pathname;
}

/** @param {string} message */
function showError(message) {
  const box = document.createElement('div');
  box.textContent = message;
  box.style.cssText = 'position:fixed;inset:auto 16px 50% 16px;padding:16px;background:#fff;color:#a12;font:16px sans-serif;border-radius:8px';
  document.body.appendChild(box);
}

start();
