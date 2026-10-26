// Lettura e controllo di un file di livello (vedi levels/*.json).

import { SHAPES } from './stations.js';
import { emptyTerrain } from './terrain.js';

/** @typedef {import('./stations.js').Shape} Shape */

/**
 * @typedef {Object} StationDef
 * @property {Shape} shape
 * @property {number} x
 * @property {number} y
 * @property {string} [name]  nome del luogo, scritto sotto la stazione
 * @property {boolean} [landmark]  true per i luoghi fissi del livello (non per i quartieri)
 */

/**
 * @typedef {Object} ViewKey  dove deve arrivare la vista in un certo giorno;
 *   fra due tappe la vista si sposta e si allarga in modo continuo
 * @property {number} day
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height  sempre il doppio della larghezza
 * @property {string} [name]  la zona che si scopre andando verso questa tappa
 */

/**
 * @typedef {Object} Zone  rettangolo dove possono comparire nuove stazioni
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} Growth
 * @property {number} intervalMin  secondi fra una stazione nuova e la successiva: minimo...
 * @property {number} intervalMax  ...e massimo, si sceglie a caso fra i due
 * @property {number} max          numero massimo di stazioni nel livello
 * @property {number} minDistance  distanza minima fra due stazioni
 * @property {number} difficulty   0 = posizioni a caso, 1 = sempre il punto più difficile da collegare
 */

/**
 * @typedef {Object} Congestion
 * @property {number} capacity   veicoli in coda che una stazione regge senza sovraccarico
 * @property {number} tolerance  secondi di sovraccarico prima che il livello fallisca
 */

/**
 * @typedef {Object} Roads
 * @property {number} initial        tratti di strada disponibili all'inizio
 * @property {number} perDay         tratti in più a ogni nuovo giorno
 * @property {number} segmentLength  lunghezza di un tratto in unità di mondo
 */

/**
 * @typedef {Object} Rewards  premi di fine settimana
 * @property {number} roads     tratti di strada in più
 * @property {number} capacity  capienza in più per la stazione migliorata
 * @property {number} bridges   ponti in più (solo nei livelli con acqua)
 * @property {number} overpasses cavalcavia in più
 */

/**
 * @typedef {Object} TrafficGoal  terza stella: poco traffico lento, per un po' di tempo di fila
 * @property {number} max       traffico lento massimo, in percentuale
 * @property {number} stations  stazioni che devono esserci tutte prima che la stella conti
 * @property {number} after     veicoli che l'ultima stazione nata deve aver generato prima che si misuri
 * @property {number} hold      secondi di gioco di fila sotto la soglia per prendere la stella
 */

/**
 * @typedef {Object} Stars  obiettivi delle tre stelle
 * @property {number} trips  prima stella: viaggi completati
 * @property {number} days   seconda stella: giorni sopravvissuti
 * @property {TrafficGoal} traffic  terza stella
 * @property {number | null} platinum  stella di platino (Maratona): giorni da resistere dopo la terza stella
 */

/**
 * Un passo del tutorial.
 * @typedef {Object} TutorialStep
 * @property {string} title
 * @property {string} text
 * @property {'avanti' | 'collega' | 'viaggi' | 'rimuovi' | 'tipoStrada' | 'incrocio' | 'rotonda' | 'zoom' | 'annulla' | 'ponte' | 'premio' | 'velocita' | 'stelle' | 'salva' | 'sblocca' | 'fine'} goal
 * @property {number} count          per 'viaggi': quanti; per 'collega': le due stazioni (indici in `stations` del passo o del livello)
 * @property {StationDef[]} addStations  stazioni che compaiono all'inizio del passo
 * @property {{x: number, y: number}[] | null} road  strada già costruita all'inizio del passo (per l'esercizio di rimozione)
 * @property {{x: number, y: number} | null} hint    dove indicare con un cerchio che pulsa
 * @property {boolean} popup  la stazione che compare nel passo si presenta col suo pop-up
 * @property {number} queue   veicoli già in coda nella stazione che compare (scenario "stazione piena")
 * @property {number | null} tolerance  secondi di sovraccarico prima della sconfitta, solo in questo passo
 * @property {{x: number, y: number}[] | null} van  furgone fermo (scenario "ingorgo"): stazione di partenza e d'arrivo
 */

/** Gli obiettivi possibili di un passo del tutorial. */
const TUTORIAL_GOALS = ['avanti', 'collega', 'viaggi', 'rimuovi', 'tipoStrada', 'incrocio', 'rotonda', 'zoom', 'annulla', 'ponte', 'premio', 'velocita', 'stelle', 'salva', 'sblocca', 'fine'];

/**
 * @typedef {Object} Level
 * @property {string} name
 * @property {{width: number, height: number}} world
 * @property {Shape[]} shapes        forme ammesse per le stazioni nuove
 * @property {StationDef[]} stations stazioni fisse: compaiono quando entrano nella vista
 * @property {Growth | null} growth  null se la città non cresce
 * @property {Zone[]} zones          vuoto = le stazioni nuove possono nascere in tutta la vista
 * @property {ViewKey[]} view        tappe della vista, in ordine di giorno
 * @property {Congestion} congestion
 * @property {number} dayLength  secondi di gioco in un giorno
 * @property {Roads} roads
 * @property {Rewards} rewards
 * @property {import('./water.js').Water[]} waters
 * @property {number} bridges  ponti in più all'inizio, oltre a quelli che arrivano con le rive nuove (di base nessuno)
 * @property {Stars | null} stars
 * @property {import('./terrain.js').Terrain} terrain  ville, colli, monumenti e mura
 * @property {TutorialStep[] | null} tutorial  passi guidati (solo nel livello tutorial)
 * @property {number} overpasses  cavalcavia disponibili all'inizio
 * @property {Look} look  aspetto di ponti, cavalcavia e rotonde, tipico della città
 * @property {{min: number, max: number, growth: number, growthMax: number, growthAfter: number, growthMaxAfter: number}} spawn
 *   secondi fra un veicolo nuovo e il successivo, per stazione; growth = quanti veicoli
 *   in più nascono ogni giorno che passa (0.02 = +2% al giorno), fino al massimo
 *   growthMax (0.5 = al più +50%). Dopo la terza stella si sale di growthAfter al
 *   giorno fino a growthMaxAfter (+3% al giorno, al più +65%).
 * @property {{name: string, x: number, y: number}[]} districts
 *   quartieri: una stazione nata a caso prende il nome del quartiere più vicino
 */

/**
 * Converte il JSON del livello (chiavi in italiano) nel formato usato dal codice.
 * Lancia un errore leggibile se il file non è valido.
 * @param {any} json
 * @returns {Level}
 */
export function parseLevel(json) {
  const world = json?.mondo;
  if (!isNum(world?.larghezza) || !isNum(world?.altezza)) {
    throw new Error('Il livello deve avere "mondo": { "larghezza", "altezza" }');
  }
  if (!Array.isArray(json.stazioni)) throw new Error('Il livello deve avere una lista "stazioni"');

  const stations = json.stazioni.map((/** @type {any} */ s, /** @type {number} */ i) => {
    checkShape(s?.forma, `Stazione ${i + 1}`);
    if (!isNum(s.x) || !isNum(s.y)) throw new Error(`Stazione ${i + 1}: mancano "x" o "y"`);
    return { shape: s.forma, x: s.x, y: s.y, ...(typeof s.nome === 'string' ? { name: s.nome, landmark: true } : {}) };
  });

  /** @type {ViewKey[]} */
  let view = [{ day: 1, x: 0, y: 0, width: world.larghezza, height: world.altezza }];
  if (json.vista !== undefined) {
    if (!Array.isArray(json.vista) || json.vista.length === 0) throw new Error('"vista" deve essere una lista di tappe');
    view = json.vista.map((/** @type {any} */ v, /** @type {number} */ i) => {
      if (!isNum(v?.giorno) || !isNum(v.x) || !isNum(v.y) || !isNum(v.larghezza)) {
        throw new Error(`Vista ${i + 1}: servono "giorno", "x", "y", "larghezza"`);
      }
      return {
        day: v.giorno,
        x: v.x,
        y: v.y,
        width: v.larghezza,
        height: v.larghezza * 2,
        ...(typeof v.nome === 'string' ? { name: v.nome } : {}),
      };
    });
    view.sort((a, b) => a.day - b.day);
  }

  /** @type {Shape[]} */
  let shapes = stations.map((/** @type {StationDef} */ s) => s.shape);
  if (json.forme !== undefined) {
    if (!Array.isArray(json.forme)) throw new Error('"forme" deve essere una lista');
    json.forme.forEach((/** @type {any} */ f) => checkShape(f, '"forme"'));
    shapes = json.forme;
  }
  shapes = [...new Set(shapes)];

  let growth = null;
  /** @type {Zone[]} */
  let zones = [];
  if (json.crescita !== undefined) {
    const c = json.crescita;
    // "ogni" = intervallo fisso; "ogniMin" e "ogniMax" = intervallo a caso fra i due.
    const min = isNum(c?.ogniMin) ? c.ogniMin : c?.ogni;
    const max = isNum(c?.ogniMax) ? c.ogniMax : c?.ogni;
    if (!isNum(min) || !isNum(max) || min <= 0 || max < min) {
      throw new Error('"crescita" deve avere "ogni", oppure "ogniMin" e "ogniMax" (secondi, maggiori di 0)');
    }
    growth = {
      intervalMin: min,
      intervalMax: max,
      max: isNum(c.massimo) ? c.massimo : Infinity,
      minDistance: isNum(c.distanzaMinima) ? c.distanzaMinima : 80,
      difficulty: isNum(c.difficolta) ? Math.max(0, Math.min(1, c.difficolta)) : 0.7,
    };
    zones = (Array.isArray(json.zone) ? json.zone : []).map((/** @type {any} */ z, /** @type {number} */ i) => {
      if (!isNum(z?.x) || !isNum(z.y) || !isNum(z.larghezza) || !isNum(z.altezza)) {
        throw new Error(`Zona ${i + 1}: servono "x", "y", "larghezza", "altezza"`);
      }
      return { x: z.x, y: z.y, width: z.larghezza, height: z.altezza };
    });
  }

  const c = json.congestione ?? {};
  const congestion = {
    capacity: isNum(c.capienza) && c.capienza > 0 ? c.capienza : 6,
    tolerance: isNum(c.tolleranza) && c.tolleranza > 0 ? c.tolleranza : 20,
  };

  const t = json.tempo ?? {};
  const dayLength = isNum(t.giorno) && t.giorno > 0 ? t.giorno : 20;

  // Senza la voce "strade" i tratti sono illimitati.
  const r = json.strade;
  const roads = {
    initial: isNum(r?.iniziali) ? r.iniziali : Infinity,
    perDay: isNum(r?.perGiorno) ? r.perGiorno : 0,
    segmentLength: isNum(r?.lunghezzaTratto) && r.lunghezzaTratto > 0 ? r.lunghezzaTratto : 40,
  };

  const p = json.premi ?? {};
  const rewards = {
    roads: isNum(p.strade) ? p.strade : 15,
    capacity: isNum(p.capienza) ? p.capienza : 3,
    bridges: isNum(p.ponti) ? p.ponti : 1,
    overpasses: isNum(p.cavalcavia) ? p.cavalcavia : 1,
  };
  const overpasses = isNum(json.cavalcavia?.iniziali) ? json.cavalcavia.iniziali : 1;

  /** @type {import('./water.js').Water[]} */
  const waters = [];
  if (json.acqua !== undefined) {
    if (!Array.isArray(json.acqua)) throw new Error('"acqua" deve essere una lista');
    json.acqua.forEach((/** @type {any} */ a, /** @type {number} */ i) => {
      const pointsOk = Array.isArray(a?.punti) && a.punti.every((/** @type {any} */ q) => Array.isArray(q) && isNum(q[0]) && isNum(q[1]));
      if (a?.tipo === 'mare') {
        if (!pointsOk || a.punti.length < 3) throw new Error(`Acqua ${i + 1}: il mare ha bisogno di almeno tre "punti" [x, y]`);
        waters.push({ kind: 'sea', points: a.punti.map((/** @type {number[]} */ q) => ({ x: q[0], y: q[1] })), beach: a.spiaggia !== false });
        return;
      }
      if (a?.tipo === 'baia') {
        if (!pointsOk || a.punti.length < 3) throw new Error(`Acqua ${i + 1}: la baia ha bisogno di almeno tre "punti" [x, y]`);
        if (!isNum(a.larghezza) || a.larghezza < 30) throw new Error(`Acqua ${i + 1}: la baia deve avere "larghezza" (almeno 30), che decide quanto possono essere lunghi i ponti`);
        waters.push({ kind: 'bay', width: a.larghezza, points: a.punti.map((/** @type {number[]} */ q) => ({ x: q[0], y: q[1] })) });
        return;
      }
      if (a?.tipo === 'isola') {
        if (!pointsOk || a.punti.length < 3) throw new Error(`Acqua ${i + 1}: l'isola ha bisogno di almeno tre "punti" [x, y]`);
        waters.push({ kind: 'island', points: a.punti.map((/** @type {number[]} */ q) => ({ x: q[0], y: q[1] })) });
        return;
      }
      if (a?.tipo !== 'fiume') throw new Error(`Acqua ${i + 1}: "tipo" deve essere "fiume", "mare", "baia" o "isola"`);
      // Più stretto di così un tratto disegnato potrebbe "saltare" il fiume fra due punti.
      if (!isNum(a.larghezza) || a.larghezza < 30) throw new Error(`Acqua ${i + 1}: "larghezza" deve essere almeno 30`);
      if (!pointsOk || a.punti.length < 2) throw new Error(`Acqua ${i + 1}: "punti" deve essere una lista di almeno due [x, y]`);
      waters.push({ kind: 'river', width: a.larghezza, points: a.punti.map((/** @type {number[]} */ q) => ({ x: q[0], y: q[1] })) });
    });
  }
  const bridges = isNum(json.ponti?.iniziali) ? json.ponti.iniziali : 0;

  /** @type {Stars | null} */
  let stars = null;
  if (json.stelle !== undefined) {
    const st = json.stelle;
    if (!isNum(st?.viaggi) || !isNum(st.giorni)) throw new Error('"stelle" deve avere "viaggi" e "giorni"');
    const t = st.traffico;
    if (!isNum(t?.soglia)) throw new Error('"stelle.traffico" deve avere "soglia" (percentuale di traffico lento)');
    // La stella conta solo a città completa: tutte le stazioni che il livello può avere.
    const traffic = {
      max: t.soglia,
      stations: growth ? growth.max : json.stazioni?.length ?? 0,
      after: isNum(t.veicoli) ? t.veicoli : 6,
      hold: isNum(t.secondi) ? t.secondi : 40,
    };
    const platinum = isNum(st.platino?.giorni) ? st.platino.giorni : null;
    stars = { trips: st.viaggi, days: st.giorni, traffic, platinum };
  }

  /** @type {{name: string, x: number, y: number}[]} */
  const districts = [];
  if (json.quartieri !== undefined) {
    if (!Array.isArray(json.quartieri)) throw new Error('"quartieri" deve essere una lista');
    json.quartieri.forEach((/** @type {any} */ q, /** @type {number} */ i) => {
      if (typeof q?.nome !== 'string' || !isNum(q.x) || !isNum(q.y)) {
        throw new Error(`Quartiere ${i + 1}: servono "nome", "x" e "y"`);
      }
      districts.push({ name: q.nome, x: q.x, y: q.y });
    });
  }

  const vh = json.veicoli ?? {};
  const spawnMin = isNum(vh.ogniMin) && vh.ogniMin > 0 ? vh.ogniMin : 6;
  const spawn = {
    min: spawnMin,
    max: isNum(vh.ogniMax) && vh.ogniMax >= spawnMin ? vh.ogniMax : spawnMin + 2,
    growth: isNum(vh.aumento) && vh.aumento >= 0 ? vh.aumento : 0,
    growthMax: isNum(vh.aumentoMassimo) && vh.aumentoMassimo >= 0 ? vh.aumentoMassimo : Infinity,
    growthAfter: isNum(vh.aumentoDopoStelle) && vh.aumentoDopoStelle >= 0 ? vh.aumentoDopoStelle : 0.03,
    growthMaxAfter: isNum(vh.massimoDopoStelle) && vh.massimoDopoStelle >= 0 ? vh.massimoDopoStelle : 0.65,
  };

  const terrain = parseTerrain(json.terreno);
  const tutorial = json.tutorial === undefined ? null : parseTutorial(json.tutorial);

  return {
    tutorial,
    terrain,
    overpasses,
    spawn,
    districts,
    stars,
    view,
    waters,
    bridges,
    look: parseLook(json.stile),
    congestion,
    dayLength,
    roads,
    rewards,
    name: String(json.nome ?? 'Senza nome'),
    world: { width: world.larghezza, height: world.altezza },
    shapes,
    stations,
    growth,
    zones,
  };
}

/**
 * La voce "tutorial" del livello: la lista dei passi.
 * @param {any} list
 * @returns {TutorialStep[]}
 */
function parseTutorial(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error('"tutorial" deve essere una lista di passi');
  const point = (/** @type {any} */ q) => (Array.isArray(q) && isNum(q[0]) && isNum(q[1]) ? { x: q[0], y: q[1] } : null);
  return list.map((/** @type {any} */ t, /** @type {number} */ i) => {
    if (!TUTORIAL_GOALS.includes(t?.obiettivo)) throw new Error(`Tutorial, passo ${i + 1}: "obiettivo" deve essere uno fra ${TUTORIAL_GOALS.join(', ')}`);
    return {
      title: String(t.titolo ?? ''),
      text: String(t.testo ?? ''),
      goal: t.obiettivo,
      count: isNum(t.quanti) ? t.quanti : 1,
      addStations: (t.stazioni ?? []).map((/** @type {any} */ s, /** @type {number} */ k) => {
        checkShape(s?.forma, `Tutorial, passo ${i + 1}, stazione ${k + 1}`);
        return { shape: s.forma, x: s.x, y: s.y, ...(typeof s.nome === 'string' ? { name: s.nome } : {}) };
      }),
      road: Array.isArray(t.strada) ? t.strada.map(point).filter(Boolean) : null,
      hint: point(t.punta),
      popup: t.popup === true,
      queue: isNum(t.coda) ? t.coda : 0,
      tolerance: isNum(t.tolleranza) ? t.tolleranza : null,
      van: Array.isArray(t.furgone) ? t.furgone.map(point).filter(Boolean) : null,
    };
  });
}

/**
 * La voce "terreno" del livello: ville, colli, monumenti, mura. Tutto facoltativo.
 * @param {any} t
 * @returns {import('./terrain.js').Terrain}
 */
function parseTerrain(t) {
  const terrain = emptyTerrain();
  if (t === undefined) return terrain;
  const points = (/** @type {any} */ list, /** @type {string} */ where, /** @type {number} */ min) => {
    const ok = Array.isArray(list) && list.length >= min && list.every((/** @type {any} */ q) => Array.isArray(q) && isNum(q[0]) && isNum(q[1]));
    if (!ok) throw new Error(`${where}: servono almeno ${min} punti [x, y]`);
    return list.map((/** @type {number[]} */ q) => ({ x: q[0], y: q[1] }));
  };
  const circle = (/** @type {any} */ c, /** @type {string} */ where) => {
    if (!isNum(c?.x) || !isNum(c.y) || !isNum(c.raggio)) throw new Error(`${where}: servono "x", "y", "raggio"`);
  };
  (t.ville ?? []).forEach((/** @type {any} */ v, /** @type {number} */ i) => {
    terrain.villas.push({ name: String(v?.nome ?? ''), points: points(v?.punti, `Villa ${i + 1}`, 3) });
  });
  (t.colli ?? []).forEach((/** @type {any} */ c, /** @type {number} */ i) => {
    circle(c, `Colle ${i + 1}`);
    terrain.hills.push({ name: String(c.nome ?? ''), x: c.x, y: c.y, radius: c.raggio });
  });
  (t.monumenti ?? []).forEach((/** @type {any} */ m, /** @type {number} */ i) => {
    circle(m, `Monumento ${i + 1}`);
    terrain.monuments.push({ name: String(m.nome ?? ''), icon: String(m.icona ?? 'colonne'), x: m.x, y: m.y, radius: m.raggio });
  });
  if (t.mura !== undefined) terrain.walls = points(t.mura, 'Mura', 3);
  return terrain;
}

/**
 * @param {unknown} shape
 * @param {string} where
 */
function checkShape(shape, where) {
  if (!SHAPES.includes(/** @type {Shape} */ (shape))) {
    throw new Error(`${where}: forma "${shape}" sconosciuta (valide: ${SHAPES.join(', ')})`);
  }
}

/** @param {unknown} v */
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * @typedef {Object} Look  nomi degli stili disegnati in src/render/looks.js
 * @property {string} bridge
 * @property {string} overpass
 * @property {string} roundabout
 * @property {string[]} classics  rotonde classiche che si alternano a quella tipica
 */

/**
 * Voce "stile" del livello: {"ponte": "pietra", "cavalcavia": "terracotta", "rotonda": "obelisco"},
 * più "classiche" facoltativo (di base aiuola e fontana). Quello che manca resta semplice.
 * @param {any} s
 * @returns {Look}
 */
function parseLook(s) {
  const name = (/** @type {any} */ v) => (typeof v === 'string' && v ? v : 'semplice');
  const classics = Array.isArray(s?.classiche) && s.classiche.length === 2 ? s.classiche.map(name) : ['aiuola', 'fontanaClassica'];
  return { bridge: name(s?.ponte), overpass: name(s?.cavalcavia), roundabout: name(s?.rotonda), classics };
}

/**
 * La stessa città in modalità sandbox: niente stelle, si gioca finché non si
 * perde e conta solo il punteggio. Le stazioni continuano a nascere finché c'è
 * posto e i veicoli aumentano ogni giorno senza tetto, così prima o poi si perde.
 * @param {Level} level
 * @returns {Level}
 */
export function sandboxLevel(level) {
  return {
    ...level,
    stars: null,
    tutorial: null,
    growth: level.growth ? { ...level.growth, max: Infinity } : null,
    spawn: { ...level.spawn, growthMax: Infinity },
  };
}
