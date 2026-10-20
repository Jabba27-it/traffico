import { RoadGraph } from './sim/graph.js';
import { parseLevel } from './sim/level.js';
import { Simulation } from './sim/simulation.js';
import { setupCanvas, fitCamera, scaleFor, useScreenSpace, useWorldSpace, screenToWorld } from './render/canvas.js';
import { createCamera, cameraRect, zoomAround } from './render/camera.js';
import { attachPinch } from './input/pinch.js';
import { drawRoads, drawPreview, drawRemoval, drawWater, drawOutsideVeil } from './render/roads.js';
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

// Il livello si sceglie dall'indirizzo, es. ?livello=roma (di base: prova).
const LEVEL_NAME = new URLSearchParams(location.search).get('livello') ?? 'prova';
const LEVEL_URL = /^[a-z0-9_-]+$/.test(LEVEL_NAME) ? `levels/${LEVEL_NAME}.json` : 'levels/prova.json';
const OUTSIDE = '#e3dfd5';
const BACKGROUND = '#f2efe8';
/** Passo fisso della simulazione, in secondi. */
const STEP = 1 / 60;
/** Oltre questo ritardo (es. scheda in background) il tempo perso non si recupera. */
const MAX_FRAME_TIME = 0.25;

async function start() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));

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
    build: (points, snapRadius) => sim.buildRoad(points, snapRadius),
    findPiece: (x, y, radius) => sim.findRoadPiece(x, y, radius),
    remove: (piece) => sim.removeRoad(piece),
    active: () => !choosingStation,
  });
  attachPinch(canvas, {
    toWorld,
    zoom: () => camera.zoom,
    zoomAround: (zoom, anchor, screen) =>
      zoomAround(camera, sim.view, zoom, anchor, screen, (r) => scaleFor(view, r), view),
  });
  const hasWater = level.waters.length > 0;
  const hud = createHud(document.body, hasWater);
  const speed = createSpeedControls(document.body);

  let lastTime = performance.now();
  let pending = 0;
  let gameOverShown = false;
  let rewardShown = false;
  /** @type {{text: string, at: number} | null} */
  let lastAnnouncement = null;
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

  /** @param {number} now */
  function frame(now) {
    // A velocità doppia scorre il doppio del tempo di gioco, sempre a passi fissi.
    pending += Math.min((now - lastTime) / 1000, MAX_FRAME_TIME) * speed.speed();
    lastTime = now;
    while (pending >= STEP && sim.running) {
      sim.step(STEP);
      pending -= STEP;
    }
    // A gioco fermo il tempo non si accumula, così alla ripresa non c'è un balzo in avanti.
    if (!sim.running) pending = 0;

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
      showRewardChoice(document.body, sim.rewardedWeeks, cards);
    }
    if (sim.announcement && sim.announcement !== lastAnnouncement) {
      lastAnnouncement = sim.announcement;
      showToast(document.body, sim.announcement.text);
    }
    const results = {
      score: sim.score,
      seconds: sim.seconds,
      trips: sim.trips,
      day: sim.day,
      dayProgress: sim.dayProgress,
      roads: sim.roadBudget,
      bridges: sim.bridgeBudget,
    };
    hud.update(results);
    if (sim.failed && !gameOverShown) {
      gameOverShown = true;
      showGameOver(document.body, results, () => location.reload());
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
    drawWater(ctx, level.waters);
    drawOutsideVeil(ctx, level.world, visible);
    drawRoads(ctx, graph);
    const preview = drawing.preview();
    if (preview.length >= 2) {
      const plan = sim.planRoad(preview);
      drawPreview(ctx, preview, plan.cut, sim.roadCost(plan), plan.bridges, framed);
    }
    const removal = drawing.removal();
    const finger = drawing.finger();
    if (removal && finger) drawRemoval(ctx, graph, removal, sim.refundOf(removal), finger, framed);
    drawVehicles(ctx, graph, sim.vehicles);
    drawCongestion(ctx, sim.stations, level.congestion.tolerance, now / 1000);
    drawStations(ctx, sim.stations, sim.transitShapes(), sim.elapsed, framed.width / level.view[0].width);
    if (choosingStation) drawSelectable(ctx, sim.stations, now / 1000);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame((now) => {
    lastTime = now;
    frame(now);
  });
}

/** @param {string} message */
function showError(message) {
  const box = document.createElement('div');
  box.textContent = message;
  box.style.cssText = 'position:fixed;inset:auto 16px 50% 16px;padding:16px;background:#fff;color:#a12;font:16px sans-serif;border-radius:8px';
  document.body.appendChild(box);
}

start();
