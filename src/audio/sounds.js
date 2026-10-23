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
