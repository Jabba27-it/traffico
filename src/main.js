import { RoadGraph } from './sim/graph.js';
import { parseLevel } from './sim/level.js';
import { Simulation } from './sim/simulation.js';
import { setupCanvas, fitCamera, scaleFor, useScreenSpace, useWorldSpace, screenToWorld } from './render/canvas.js';
import { createCamera, cameraRect, zoomAround } from './render/camera.js';
import { attachPinch } from './input/pinch.js';
import { drawRoads, drawLaneMarks, drawOverpasses, drawPreview, drawRemoval, drawWater, drawOutsideVeil } from './render/roads.js';
import { currentPiece } from './sim/vehicles.js';
import { drawJunctionMarks, drawRoundaboutIslands } from './render/junctions.js';
import { STYLE } from './render/style.js';
import { drawHint } from './render/hint.js';
import { createTutorial } from './ui/tutorial.js';
import { drawGround, drawTerrainNames } from './render/terrain.js';
import { drawStations, drawSelectable } from './render/stations.js';
import { STATION_RADIUS } from './sim/stations.js';
import { drawVehicles } from './render/vehicles.js';
import { drawCongestion } from './render/congestion.js';
import { attachRoadDrawing } from './input/drawRoad.js';
import { createHud } from './ui/hud.js';
import { showGameOver } from './ui/gameOver.js';
import { createSpeedControls } from './ui/speed.js';
import { showRewardChoice, showStationPrompt, REWARD_ICONS } from './ui/reward.js';
import { showToast } from './ui/toast.js';
import { showStationPopup } from './ui/stationPopup.js';
import { showGoals } from './ui/goals.js';
import { showMenu, parseIndex } from './ui/menu.js';
import { saveRecord } from './ui/records.js';
import { askConfirm } from './ui/confirm.js';

// Il livello si sceglie dall'indirizzo, es. ?livello=roma; senza livello si apre il menu.
const LEVEL_PARAM = new URLSearchParams(location.search).get('livello');
const LEVEL_NAME = LEVEL_PARAM && /^[a-z0-9_-]+$/.test(LEVEL_PARAM) ? LEVEL_PARAM : null;
const LEVEL_URL = `levels/${LEVEL_NAME}.json`;
const INDEX_URL = 'levels/indice.json';
const MENU_ICON =
  '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="2" y="3" width="14" height="2.2" rx="1"/><rect x="2" y="8" width="14" height="2.2" rx="1"/><rect x="2" y="13" width="14" height="2.2" rx="1"/></svg>';
const STAR_NAMES = ['Prima', 'Seconda', 'Terza'];
/** @type {Record<string, string>} avvisi dopo un tocco breve sulla mappa */
const TAP_MESSAGES = {
  signal: 'Semaforo',
  normal: 'Incrocio con precedenza alla strada principale',
  'normal-no-overpass': 'Incrocio normale (per il cavalcavia servono scorte)',
  built: 'Cavalcavia costruito',
  removed: 'Cavalcavia tolto: torna incrocio',
  two: 'Doppio senso',
  forward: 'Senso unico',
  backward: 'Senso unico (al contrario)',
  super: 'Superstrada',
  'super-too-expensive': 'Doppio senso: per la superstrada servono più tratti',
  roundabout: 'Rotatoria',
  'roundabout-removed': 'Rotatoria tolta: torna incrocio',
  'roundabout-too-expensive': 'Per la rotatoria servono più tratti',
  'roundabout-station': 'La rotonda non può contenere una stazione',
  'roundabout-blocked': 'Qui la rotonda non ci sta (acqua, ville, monumenti o fuori città)',
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
      showMenu(document.body, parseIndex(await res.json()), (file) => {
        location.search = `?livello=${file}`;
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
      const result = sim.buildRoad(points, snapRadius);
      if (result && TAP_MESSAGES[result]) showToast(document.body, TAP_MESSAGES[result]);
    },
    findPiece: (x, y, radius) => sim.findRoadPiece(x, y, radius),
    remove: (piece) => sim.removeRoad(piece),
    active: () => !choosingStation,
    tap: (x, y, radius) => {
      const result = sim.tap(x, y, Math.max(radius, 20));
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
  const hud = createHud(document.body, {
    bridges: hasWater,
    stars: level.stars !== null,
    onStarsTap: () => showGoals(document.body, sim.starGoals(), sim.efficiency),
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

  let lastTime = performance.now();
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

    if (sim.lastStar && sim.lastStar !== lastStar) {
      lastStar = sim.lastStar;
      showToast(document.body, `★ ${STAR_NAMES[lastStar.index]} stella: ${lastStar.label}`);
    }

    if (sim.rewardPending && !rewardShown) {
      rewardShown = true;
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
      if (!tutorial) showStationPopup(document.body, sim.stations[sim.stations.length - 1]);
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
      efficiency: sim.efficiency,
      slowTraffic: sim.slowTraffic,
    };
    hud.update(results);
    if ((sim.failed || sim.completed) && !gameOverShown) {
      gameOverShown = true;
      const best = level.stars ? saveRecord(/** @type {string} */ (LEVEL_NAME), sim.score, sim.starsEarned) : null;
      showGameOver(document.body, results, best, { onRetry: () => location.reload(), onMenu: goToMenu }, sim.completed);
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
    drawOutsideVeil(ctx, level.world, visible);
    drawRoads(ctx, graph, sim.traffic.congestion);
    drawLaneMarks(ctx, graph);
    drawRoundaboutIslands(ctx, sim.roundabouts.values());
    drawJunctionMarks(ctx, graph, sim.lanes, sim.traffic.signals);
    const preview = drawing.preview();
    if (preview.length >= 2) {
      const plan = sim.planRoad(preview);
      drawPreview(ctx, preview, plan.cut, sim.roadCost(plan), plan.bridges, framed);
    }
    const removal = drawing.removal();
    const finger = drawing.finger();
    if (removal && finger) drawRemoval(ctx, graph, removal, sim.refundOf(removal), finger, framed);
    // Chi passa sotto un cavalcavia sparisce sotto l'impalcato; chi passa sopra si vede sopra.
    const elevated = sim.vehicles.filter((v) => currentPiece(sim.lanes, v).elevated);
    drawVehicles(ctx, sim.vehicles.filter((v) => !elevated.includes(v)));
    drawOverpasses(ctx, graph);
    drawVehicles(ctx, elevated);
    drawCongestion(ctx, sim.stations, level.congestion.tolerance, now / 1000);
    const labelScale = framed.width / level.view[0].width;
    drawTerrainNames(ctx, level.terrain, labelScale);
    drawStations(ctx, sim.stations, sim.transitShapes(), sim.elapsed, labelScale);
    const hint = tutorial?.hint();
    if (hint) drawHint(ctx, hint, now / 1000, labelScale);
    if (choosingStation) drawSelectable(ctx, sim.stations, now / 1000);
    requestAnimationFrame(frame);
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
