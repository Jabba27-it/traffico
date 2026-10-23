// Suoni del gioco, generati con Web Audio: niente file da scaricare, tutti originali.
// Il browser li permette solo dopo un tocco, quindi l'audio si accende al primo gesto.

const MUTE_KEY = 'traffico-muto';

/** @type {AudioContext | null} */
let audio = null;
/** @type {GainNode | null} */
let master = null;
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Da chiamare una volta: al primo tocco prepara l'audio. */
export function unlockAudioOnTouch() {
  const unlock = () => {
    if (!audio) {
      const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (!Ctx) return;
      audio = new Ctx();
      master = audio.createGain();
      master.gain.value = 0.5;
      master.connect(audio.destination);
    }
    if (audio.state === 'suspended') audio.resume();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
}

export function isMuted() {
  return muted;
}

/** @param {boolean} value */
export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // senza memoria del browser il muto vale solo per questa partita
  }
}

/** true se si può suonare adesso. */
function ready() {
  return !muted && audio !== null && master !== null && audio.state === 'running';
}

/**
 * Una nota breve: sale subito e si spegne con una coda.
 * @param {number} freq        frequenza iniziale, Hz
 * @param {number} at          ritardo dall'adesso, secondi
 * @param {number} length      durata, secondi
 * @param {number} volume      0..1
 * @param {OscillatorType} wave
 * @param {number} [endFreq]   frequenza finale (glissando)
 */
function note(freq, at, length, volume, wave, endFreq = freq) {
  const ctx = /** @type {AudioContext} */ (audio);
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(/** @type {GainNode} */ (master));
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/**
 * Un nuovo tratto mentre si disegna: un tic morbido che sale col numero di tratti.
 * @param {number} count  tratti della strada finora
 */
export function playSegment(count) {
  if (!ready()) return;
  const freq = 520 * Math.pow(2, Math.min(count - 1, 12) / 24);
  note(freq, 0, 0.05, 0.12, 'triangle');
}

/** Strada costruita: un colpo basso e pieno. */
export function playRoad() {
  if (!ready()) return;
  note(220, 0, 0.16, 0.35, 'sine', 140);
  note(440, 0, 0.06, 0.08, 'triangle');
}

/** Ponte costruito: lo stesso colpo più profondo, con una piccola eco. */
export function playBridge() {
  if (!ready()) return;
  note(160, 0, 0.22, 0.38, 'sine', 100);
  note(160, 0.14, 0.2, 0.14, 'sine', 100);
  note(160, 0.28, 0.18, 0.06, 'sine', 100);
}

/** Rotatoria: tre note che salgono, come un giro. */
export function playRoundabout() {
  if (!ready()) return;
  [392, 494, 587].forEach((f, i) => note(f, i * 0.07, 0.18, 0.16, 'triangle'));
}

/** Costruzione non possibile: un "bup" sordo che scende. */
export function playError() {
  if (!ready()) return;
  note(180, 0, 0.18, 0.3, 'square', 110);
}

/** Nuova stazione: una campanella. */
export function playStation() {
  if (!ready()) return;
  note(880, 0, 0.6, 0.18, 'sine');
  note(1320, 0, 0.35, 0.06, 'sine');
  note(1175, 0.09, 0.5, 0.12, 'sine');
}

/** @type {AudioBuffer | null} rumore bianco breve, riusato per la "gomma" della rimozione */
let noise = null;

/** Strada tolta: un "fsss" che scende, come una gomma. */
export function playRemove() {
  if (!ready()) return;
  const ctx = /** @type {AudioContext} */ (audio);
  if (!noise) {
    noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.3), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(3000, t);
  filter.frequency.exponentialRampToValueAtTime(400, t + 0.25);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  src.connect(filter).connect(gain).connect(/** @type {GainNode} */ (master));
  src.start(t);
  src.stop(t + 0.3);
}

/** @type {Record<string, number>} un clic di altezza diversa per ogni esito del tocco */
const TAP_PITCH = {
  normal: 700,
  'normal-no-overpass': 700,
  signal: 1100,
  built: 500,
  removed: 500,
  two: 800,
  forward: 900,
  backward: 900,
  super: 1000,
  'super-too-expensive': 800,
};

/**
 * Tocco breve su una strada o un incrocio: un clic secco, diverso per tipo.
 * @param {string} result  esito del tocco
 */
export function playTap(result) {
  if (!ready()) return;
  if (result === 'roundabout-removed') return playRemove();
  const freq = TAP_PITCH[result];
  if (!freq) return;
  note(freq, 0, 0.04, 0.22, 'square', freq * 0.6);
  // Il cavalcavia ha un secondo colpo, più basso, come un passaggio sopra.
  if (result === 'built') note(freq * 0.75, 0.07, 0.08, 0.18, 'square', freq * 0.5);
}

/**
 * Stazione piena: un battito doppio, più forte quando il tempo sta per finire.
 * @param {number} urgency  0..1, quanto è avanti il conto alla rovescia
 */
export function playHeartbeat(urgency) {
  if (!ready()) return;
  const volume = 0.2 + 0.25 * urgency;
  note(90, 0, 0.12, volume, 'sine', 60);
  note(80, 0.16, 0.12, volume * 0.7, 'sine', 55);
}

/** Fine settimana, arrivano i premi: un piccolo accordo. */
export function playWeek() {
  if (!ready()) return;
  [523, 659, 784].forEach((f) => note(f, 0, 0.7, 0.1, 'triangle'));
  note(1047, 0.12, 0.6, 0.08, 'sine');
}

/** Stella presa: uno scintillio di note alte. */
export function playStar() {
  if (!ready()) return;
  [1319, 1568, 1976, 2637].forEach((f, i) => note(f, i * 0.06, 0.35, 0.1, 'sine'));
}
