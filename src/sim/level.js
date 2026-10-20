// Lettura e controllo di un file di livello (vedi levels/*.json).

import { SHAPES } from './stations.js';

/** @typedef {import('./stations.js').Shape} Shape */

/**
 * @typedef {Object} StationDef
 * @property {Shape} shape
 * @property {number} x
 * @property {number} y
 * @property {string} [name]  nome del luogo, scritto sotto la stazione
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
 * @property {number} interval     secondi fra una stazione nuova e la successiva
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
 */

/**
 * @typedef {Object} SpecialGoal  la condizione speciale della terza stella
 * @property {'collegaLuoghi' | 'reteUnica'} kind
 *   collegaLuoghi = tutti i luoghi con nome nella stessa rete;
 *   reteUnica = tutte le stazioni nella stessa rete, quando sono almeno `min`
 * @property {string} text  come si presenta al giocatore
 * @property {number} min
 */

/**
 * @typedef {Object} Stars  obiettivi delle tre stelle
 * @property {number} trips  prima stella: viaggi completati
 * @property {number} days   seconda stella: giorni sopravvissuti
 * @property {SpecialGoal | null} special  terza stella
 */

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
 * @property {number} bridges  ponti disponibili all'inizio
 * @property {Stars | null} stars
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
    return { shape: s.forma, x: s.x, y: s.y, ...(typeof s.nome === 'string' ? { name: s.nome } : {}) };
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
    if (!isNum(c?.ogni) || c.ogni <= 0) throw new Error('"crescita" deve avere "ogni" (secondi, maggiore di 0)');
    growth = {
      interval: c.ogni,
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
  };

  /** @type {import('./water.js').Water[]} */
  const waters = [];
  if (json.acqua !== undefined) {
    if (!Array.isArray(json.acqua)) throw new Error('"acqua" deve essere una lista');
    json.acqua.forEach((/** @type {any} */ a, /** @type {number} */ i) => {
      const pointsOk = Array.isArray(a?.punti) && a.punti.every((/** @type {any} */ q) => Array.isArray(q) && isNum(q[0]) && isNum(q[1]));
      if (a?.tipo === 'mare') {
        if (!pointsOk || a.punti.length < 3) throw new Error(`Acqua ${i + 1}: il mare ha bisogno di almeno tre "punti" [x, y]`);
        waters.push({ kind: 'sea', points: a.punti.map((/** @type {number[]} */ q) => ({ x: q[0], y: q[1] })) });
        return;
      }
      if (a?.tipo !== 'fiume') throw new Error(`Acqua ${i + 1}: "tipo" deve essere "fiume" o "mare"`);
      // Più stretto di così un tratto disegnato potrebbe "saltare" il fiume fra due punti.
      if (!isNum(a.larghezza) || a.larghezza < 30) throw new Error(`Acqua ${i + 1}: "larghezza" deve essere almeno 30`);
      if (!pointsOk || a.punti.length < 2) throw new Error(`Acqua ${i + 1}: "punti" deve essere una lista di almeno due [x, y]`);
      waters.push({ kind: 'river', width: a.larghezza, points: a.punti.map((/** @type {number[]} */ q) => ({ x: q[0], y: q[1] })) });
    });
  }
  const bridges = isNum(json.ponti?.iniziali) ? json.ponti.iniziali : waters.length > 0 ? 2 : 0;

  /** @type {Stars | null} */
  let stars = null;
  if (json.stelle !== undefined) {
    const st = json.stelle;
    if (!isNum(st?.viaggi) || !isNum(st.giorni)) throw new Error('"stelle" deve avere "viaggi" e "giorni"');
    let special = null;
    if (st.speciale !== undefined) {
      const kind = st.speciale?.tipo;
      if (kind !== 'collegaLuoghi' && kind !== 'reteUnica') {
        throw new Error('"stelle.speciale.tipo" deve essere "collegaLuoghi" o "reteUnica"');
      }
      special = {
        kind,
        text: String(st.speciale.testo ?? (kind === 'collegaLuoghi' ? 'Collega tutti i luoghi' : 'Tutte le stazioni in una rete')),
        min: isNum(st.speciale.minimo) ? st.speciale.minimo : 0,
      };
    }
    stars = { trips: st.viaggi, days: st.giorni, special };
  }

  return {
    stars,
    view,
    waters,
    bridges,
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
