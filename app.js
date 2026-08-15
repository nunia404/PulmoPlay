/* PulmoPlay — 9 button keyboard clarinet
   8 note buttons (A S D F -> C D E F, J K L ; -> G A B C)
   + a spacebar "sharp" button = 9 buttons total.
   All sound is synthesized live with the Web Audio API. */

const NOTES = [
  { key: 'a', name: 'C', octave: 4, freq: 261.63 },
  { key: 's', name: 'D', octave: 4, freq: 293.66 },
  { key: 'd', name: 'E', octave: 4, freq: 329.63 },
  { key: 'f', name: 'F', octave: 4, freq: 349.23 },
  { key: 'j', name: 'G', octave: 4, freq: 392.00 },
  { key: 'k', name: 'A', octave: 4, freq: 440.00 },
  { key: 'l', name: 'B', octave: 4, freq: 493.88 },
  { key: ';', name: 'C', octave: 5, freq: 523.25 },
];

const SEMITONE = Math.pow(2, 1 / 12);

const TRACKS = {
  waltz: {
    steps: [
      { bass: 130.81 }, { chord: [164.81, 196.00, 261.63] }, { chord: [164.81, 196.00, 261.63] },
      { bass: 196.00 }, { chord: [196.00, 246.94, 293.66] }, { chord: [196.00, 246.94, 293.66] },
    ],
  },
  pop: {
    steps: [
      { bass: 130.81 }, null, { chord: [164.81, 196.00, 261.63] }, null,
      { bass: 174.61 }, null, { chord: [174.61, 220.00, 261.63] }, null,
    ],
  },
  ballad: {
    steps: [
      { bass: 130.81, chord: [164.81, 196.00, 261.63] }, null, null, null,
      { bass: 196.00, chord: [196.00, 246.94, 293.66] }, null, null, null,
    ],
  },
  guitar: {
    // Travis-style fingerpicking: alternating bass note, then a chord strum,
    // over a C major / G major turnaround.
    steps: [
      { bass: 130.81 }, { chord: [164.81, 196.00, 261.63] },
      { bass: 98.00 }, { chord: [164.81, 196.00, 261.63] },
      { bass: 98.00 }, { chord: [123.47, 146.83, 196.00] },
      { bass: 146.83 }, { chord: [123.47, 146.83, 196.00] },
    ],
  },
};

const TRACK_ORDER = ['none', 'waltz', 'pop', 'ballad', 'guitar'];
const TRACK_LABELS = { none: 'No Backing Track', waltz: 'Gentle Waltz', pop: 'Pop Groove', ballad: 'Slow Ballad', guitar: 'Acoustic Guitar' };

let audioCtx = null;
let instrumentGain = null;
let backingGain = null;
const activeVoices = {}; // index -> voice, only for fingers that are currently sounding
const fingersDown = new Set(); // indices currently held, sounding or not

let isSpaceDown = false;

// Breath control: the ESP32 flow sensor sends one of three keys over
// Bluetooth — "n" (normal, no airflow), "x" (expiration, breathing out),
// "i" (inspiration, breathing in).
//
// The instrument mutes the moment an inhale starts and stays muted through
// any "normal" in between — it only comes back once an exhale actually
// begins. That's a latch (instrumentMuted), not a plain function of the
// current mode, so it needs its own variable.
//
// The Breath Garden's rain/growth is the opposite: it runs only while
// actively inhaling (isBlowing tracks that).
let breathMode = 'normal'; // 'normal' | 'inspiration' | 'expiration'
let isBlowing = false; // true only while inhaling — drives the garden rain/growth
let instrumentMuted = false; // latched by inspiration/expiration; unaffected by 'normal'

// Which tab is showing — the note keys drive the clarinet on one and the
// garden plots on the other, so key handling needs to know which.
let activeTab = 'clarinet';

let isPlayingBacking = false;
let currentTrackIndex = 0;
let currentTrackName = TRACK_ORDER[currentTrackIndex]; // 'none'
let currentStepIndex = 0;
let nextStepTime = 0;
let tempo = 100;
let backingVolumePercent = 50;
let schedulerTimer = null;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

function ensureAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  instrumentGain = audioCtx.createGain();
  instrumentGain.gain.value = 0.9;
  instrumentGain.connect(audioCtx.destination);

  backingGain = audioCtx.createGain();
  backingGain.gain.value = backingVolumePercent / 100 * 0.5;
  backingGain.connect(audioCtx.destination);
}

/* ---------------- Clarinet synth ----------------
   A closed-tube reed instrument speaks mostly in odd harmonics.
   We approximate that with a small odd-harmonic stack, a warm
   lowpass filter, and a touch of vibrato. */
function playClarinetNote(freq) {
  const now = audioCtx.currentTime;

  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.3, now + 0.045);

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2200;
  filter.Q.value = 0.6;
  master.connect(filter).connect(instrumentGain);

  const harmonics = [1, 3, 5, 7, 9];
  const amps = [1, 0.7, 0.45, 0.25, 0.12];
  const oscs = harmonics.map((h, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * h;
    const g = audioCtx.createGain();
    g.gain.value = amps[i];
    osc.connect(g).connect(master);
    osc.start(now);
    return { osc, g };
  });

  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 5.2;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 2.5;
  lfo.connect(lfoGain);
  oscs.forEach(o => lfoGain.connect(o.osc.frequency));
  lfo.start(now);

  return { oscs, master, filter, lfo };
}

function stopClarinetNote(voice) {
  const now = audioCtx.currentTime;
  voice.master.gain.cancelScheduledValues(now);
  voice.master.gain.setValueAtTime(voice.master.gain.value, now);
  voice.master.gain.linearRampToValueAtTime(0, now + 0.15);
  setTimeout(() => {
    voice.oscs.forEach(o => { try { o.osc.stop(); } catch (e) {} });
    try { voice.lfo.stop(); } catch (e) {}
  }, 250);
}

/* ---------------- Backing track synth ---------------- */
function playBassNote(freq, time) {
  const osc = audioCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(0.5, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
  osc.connect(g).connect(backingGain);
  osc.start(time);
  osc.stop(time + 0.55);
}

function playChordHit(freqs, time) {
  freqs.forEach(freq => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.18, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.9);
    osc.connect(g).connect(backingGain);
    osc.start(time);
    osc.stop(time + 0.95);
  });
}

/* Plucked acoustic guitar via Karplus-Strong string synthesis: a burst of
   noise is fed through a decaying delay loop tuned to the note's period,
   which is what gives a plucked string its characteristic timbre. */
function createPluckBuffer(freq, duration) {
  const sampleRate = audioCtx.sampleRate;
  const bufferSize = Math.floor(sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  const period = Math.max(2, Math.round(sampleRate / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  const damping = 0.994;
  let idx = 0;
  for (let i = 0; i < bufferSize; i++) {
    const next = ring[(idx + 1) % period];
    data[i] = ring[idx];
    ring[idx] = damping * 0.5 * (ring[idx] + next);
    idx = (idx + 1) % period;
  }
  return buffer;
}

function playGuitarPluck(freq, time, level) {
  const duration = 1.4;
  const source = audioCtx.createBufferSource();
  source.buffer = createPluckBuffer(freq, duration);
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3800;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(level, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + duration);
  source.connect(filter).connect(g).connect(backingGain);
  source.start(time);
  source.stop(time + duration);
}

function playGuitarStrum(freqs, time) {
  freqs.forEach((freq, i) => playGuitarPluck(freq, time + i * 0.014, 0.35));
}

function scheduleStep(stepIndex, time) {
  const step = TRACKS[currentTrackName].steps[stepIndex];
  if (!step) return;
  if (currentTrackName === 'guitar') {
    if (step.bass) playGuitarPluck(step.bass, time, 0.45);
    if (step.chord) playGuitarStrum(step.chord, time);
  } else {
    if (step.bass) playBassNote(step.bass, time);
    if (step.chord) playChordHit(step.chord, time);
  }
}

function advanceStep() {
  const secondsPerStep = (60 / tempo) / 2;
  nextStepTime += secondsPerStep;
  currentStepIndex = (currentStepIndex + 1) % TRACKS[currentTrackName].steps.length;
}

function schedulerLoop() {
  while (nextStepTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(currentStepIndex, nextStepTime);
    advanceStep();
  }
  schedulerTimer = setTimeout(schedulerLoop, LOOKAHEAD_MS);
}

function startBacking() {
  if (currentTrackName === 'none') return;
  ensureAudioContext();
  currentStepIndex = 0;
  nextStepTime = audioCtx.currentTime + 0.05;
  isPlayingBacking = true;
  schedulerLoop();
}

function stopBacking() {
  isPlayingBacking = false;
  clearTimeout(schedulerTimer);
}

/* ---------------- Note trigger / UI wiring ---------------- */
const noteButtons = [];

function buildButtons() {
  const padRow = document.getElementById('padRow');

  NOTES.forEach((note, index) => {
    const label = index === NOTES.length - 1 ? `${note.name}’` : note.name; // C' for the octave-up C
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'note-btn';
    btn.innerHTML =
      `<span class="note-name">${label}</span>` +
      `<span class="key-label">${note.key === ';' ? ';' : note.key.toUpperCase()}</span>`;

    btn.addEventListener('mousedown', () => triggerNoteOn(index));
    btn.addEventListener('mouseup', () => triggerNoteOff(index));
    btn.addEventListener('mouseleave', () => triggerNoteOff(index));
    btn.addEventListener('touchstart', e => { e.preventDefault(); triggerNoteOn(index); }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); triggerNoteOff(index); });

    noteButtons[index] = btn;
    padRow.appendChild(btn);
  });
}

function triggerNoteOn(index) {
  if (fingersDown.has(index)) return;
  ensureAudioContext();
  fingersDown.add(index);
  noteButtons[index].classList.add('fingered');
  if (!instrumentMuted) soundOn(index);
}

function triggerNoteOff(index) {
  if (!fingersDown.has(index)) return;
  fingersDown.delete(index);
  noteButtons[index].classList.remove('fingered');
  soundOff(index);
}

function soundOn(index) {
  if (activeVoices[index]) return;
  const note = NOTES[index];
  const sharp = isSpaceDown;
  const freq = sharp ? note.freq * SEMITONE : note.freq;
  activeVoices[index] = playClarinetNote(freq);

  const btn = noteButtons[index];
  btn.classList.add('active');
  btn.classList.toggle('sharp-active', sharp);

  updateNoteDisplay();
}

function soundOff(index) {
  const voice = activeVoices[index];
  if (!voice) return;
  stopClarinetNote(voice);
  delete activeVoices[index];
  const btn = noteButtons[index];
  btn.classList.remove('active', 'sharp-active');

  updateNoteDisplay();
}

function updateNoteDisplay() {
  const el = document.getElementById('noteValue');
  const indices = Object.keys(activeVoices);
  if (indices.length === 0) {
    el.textContent = '—';
    return;
  }
  const index = Number(indices[indices.length - 1]);
  const note = NOTES[index];
  const sharp = noteButtons[index].classList.contains('sharp-active');
  el.textContent = `${note.name}${sharp ? '♯' : ''}${note.octave}`;
}

/* ---------------- Breath control ---------------- */
const BREATH_LABELS = { normal: 'NORMAL', inspiration: 'INHALE', expiration: 'EXHALE' };

function updateBreathUI() {
  const value = document.getElementById('breathValue');
  const text = document.getElementById('breathText');
  const puff = document.getElementById('breathPuff');
  // The tile itself is an honest readout of the current sensor mode —
  // independent of the instrument's latched mute and the garden's
  // inhale-driven rain, both handled elsewhere.
  const isExhaling = breathMode === 'expiration';
  const isInhaling = breathMode === 'inspiration';
  value.classList.toggle('on', isExhaling);
  value.classList.toggle('muted', isInhaling);
  text.textContent = BREATH_LABELS[breathMode];
  puff.classList.toggle('blowing', isExhaling);

  const valueG = document.getElementById('breathValueGarden');
  const textG = document.getElementById('breathTextGarden');
  if (valueG) {
    valueG.classList.toggle('on', isExhaling);
    valueG.classList.toggle('muted', isInhaling);
    textG.textContent = BREATH_LABELS[breathMode];
  }

  const rainLayer = document.getElementById('rainLayer');
  if (rainLayer) rainLayer.classList.toggle('active', isBlowing);
  updateWateringVisual();
}

// Switches the current breath mode and reconciles everything that depends
// on it. The instrument's mute is a latch, not a plain function of the
// current mode: an inhale mutes it and it *stays* muted through any
// "normal" in between, only clearing once an exhale actually begins —
// so the player can keep fingering notes the whole time and just wait
// out the silence until they breathe out again.
function setBreathMode(mode) {
  if (breathMode === mode) return;
  breathMode = mode;
  isBlowing = (mode === 'inspiration'); // garden rain/growth run on the inhale, not the exhale

  const wasMuted = instrumentMuted;
  if (mode === 'inspiration') instrumentMuted = true;
  else if (mode === 'expiration') instrumentMuted = false;
  // 'normal' leaves instrumentMuted exactly as it was

  updateBreathUI();
  if (instrumentMuted && !wasMuted) {
    Array.from(fingersDown).forEach(i => soundOff(i));
  } else if (!instrumentMuted && wasMuted) {
    fingersDown.forEach(i => soundOn(i));
  }
}

// ESP32 sends a discrete "n" / "x" / "i" the moment the breath state
// changes — the mode stays put until the next one arrives, it is not held
// down / repeated the whole time. Both games share this same signal so
// the same keyboard/ESP32 input drives either. The garden's rain/growth
// timer runs only during inspiration — it rains while you breathe in.
let breathStartTime = null;
let lastGrowthFrameTime = null;
let liveTimerRAF = null;

function stopInhaleTimer() {
  if (breathStartTime === null) return;
  const durationSec = (performance.now() - breathStartTime) / 1000;
  breathStartTime = null;
  lastGrowthFrameTime = null;
  if (liveTimerRAF) cancelAnimationFrame(liveTimerRAF);
  recordInspiration(durationSec);
}

function enterNormal() {
  ensureAudioContext();
  setBreathMode('normal');
  stopInhaleTimer();
}

function enterExpiration() {
  ensureAudioContext();
  setBreathMode('expiration');
  stopInhaleTimer();
}

function enterInspiration() {
  ensureAudioContext();
  setBreathMode('inspiration');
  breathStartTime = performance.now();
  lastGrowthFrameTime = breathStartTime;
  tickLiveInspirationTimer();
}

// Runs every frame while inhaling: the on-screen timer counts up and the
// selected plot grows live, in step with the rain animation — the plant
// visibly grows *as* you breathe in, not only once you stop.
function tickLiveInspirationTimer() {
  if (!isBlowing || breathStartTime === null) return;
  const now = performance.now();
  const elapsed = (now - breathStartTime) / 1000;
  const el = document.getElementById('inspTimeValue');
  if (el) el.textContent = `${elapsed.toFixed(1)}s`;

  const deltaSec = (now - lastGrowthFrameTime) / 1000;
  lastGrowthFrameTime = now;
  growHeldPlotsBy(deltaSec);

  liveTimerRAF = requestAnimationFrame(tickLiveInspirationTimer);
}

/* ---------------- Breath Garden game ----------------
   No mouse — one plot per finger key (A S D F J K L ;), same keys and
   the same n/x/i breath signal as the clarinet, so an ESP32 rig with no
   pointing device can play this exactly like the instrument. Hold a
   key to tend that plot (chord several keys to tend several plots at
   once), inhale to water/grow whatever's held, press a ripe plot's key
   again to harvest it. */
const GARDEN_PLOT_COUNT = NOTES.length;
const FLOWER_EMOJIS = ['\u{1F337}', '\u{1F338}', '\u{1F33A}', '\u{1F33B}', '\u{1F339}'];
const VEG_EMOJIS = ['\u{1F955}', '\u{1F966}', '\u{1F345}', '\u{1F33D}', '\u{1F346}'];
const GROWTH_PER_FULL_BREATH_SEC = 6; // a ~6s sustained breath fully grows a fresh plant

let gardenPlots = new Array(GARDEN_PLOT_COUNT).fill(null);
let plotButtons = new Array(GARDEN_PLOT_COUNT).fill(null);
let heldPlotIndices = new Set();
let score = 0;
let bestScore = parseInt(localStorage.getItem('pulmoplay.bestScore') || '0', 10);
let bestInspiration = parseFloat(localStorage.getItem('pulmoplay.bestInspiration') || '0');

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function plotStageIcon(plot) {
  if (plot.growth >= 100) return plot.finalEmoji;
  if (plot.growth >= 60) return '\u{1F33F}'; // herb / sprout
  if (plot.growth >= 25) return '\u{1F331}'; // seedling
  return '\u{2726}'; // tiny sparkle for a fresh seed
}

function buildRainLayer() {
  const layer = document.getElementById('rainLayer');
  if (!layer) return;
  const DROP_COUNT = 16;
  for (let i = 0; i < DROP_COUNT; i++) {
    const drop = document.createElement('span');
    drop.className = 'raindrop';
    drop.style.left = `${(Math.random() * 100).toFixed(1)}%`;
    drop.style.animationDelay = `${(Math.random() * 0.9).toFixed(2)}s`;
    drop.style.animationDuration = `${(0.7 + Math.random() * 0.5).toFixed(2)}s`;
    layer.appendChild(drop);
  }
}

function plotKeyLabel(index) {
  const key = NOTES[index].key;
  return key === ';' ? ';' : key.toUpperCase();
}

function renderGarden() {
  const grid = document.getElementById('gardenGrid');
  if (!grid) return;
  grid.innerHTML = '';
  plotButtons = [];
  gardenPlots.forEach((plot, i) => {
    const held = heldPlotIndices.has(i);
    const btn = document.createElement('div');
    btn.className = 'plot';
    if (held) btn.classList.add('held');
    if (plot && plot.growth >= 100) btn.classList.add('ripe');
    if (isBlowing && held) btn.classList.add('watering');

    const keyLabel = `<span class="plot-key">${plotKeyLabel(i)}</span>`;
    if (!plot) {
      btn.innerHTML = `<span class="plot-icon plot-empty">+</span>${keyLabel}`;
    } else {
      const growth = Math.min(100, plot.growth);
      btn.innerHTML =
        `<span class="plot-icon">${plotStageIcon(plot)}</span>` +
        `<span class="plot-bar"><i style="width:${growth}%"></i></span>${keyLabel}`;
    }

    plotButtons[i] = btn;
    grid.appendChild(btn);
  });
}

// Updates one plot's icon/growth-bar in place (no innerHTML rebuild) so it
// stays smooth when called on every animation frame while inhaling.
function updatePlotVisual(index) {
  const btn = plotButtons[index];
  const plot = gardenPlots[index];
  if (!btn || !plot) return;
  const growth = Math.min(100, plot.growth);

  const icon = btn.querySelector('.plot-icon');
  const newIconText = plotStageIcon(plot);
  if (icon && icon.textContent !== newIconText) {
    icon.textContent = newIconText;
    btn.classList.remove('stage-pop');
    void btn.offsetWidth; // restart the pop animation
    btn.classList.add('stage-pop');
  }

  const bar = btn.querySelector('.plot-bar i');
  if (bar) bar.style.width = `${growth}%`;

  btn.classList.toggle('ripe', growth >= 100);
}

function updateWateringVisual() {
  plotButtons.forEach((btn, i) => {
    if (btn) btn.classList.toggle('watering', isBlowing && heldPlotIndices.has(i));
  });
}

// Fires on keydown of a plot's finger key (A S D F J K L ;), no mouse
// involved: empty plot -> plant a seed; ripe plot -> harvest it; growing
// plot -> just mark it held so it grows while you inhale. Chording several
// keys tends several plots from the same breath at once.
function onPlotKeyDown(index) {
  const plot = gardenPlots[index];
  if (!plot) {
    gardenPlots[index] = {
      kind: Math.random() < 0.5 ? 'flower' : 'veg',
      finalEmoji: Math.random() < 0.5 ? pickRandom(FLOWER_EMOJIS) : pickRandom(VEG_EMOJIS),
      growth: 0,
    };
    heldPlotIndices.add(index);
  } else if (plot.growth >= 100) {
    harvestPlot(index);
    return;
  } else {
    heldPlotIndices.add(index);
  }
  renderGarden();
}

function onPlotKeyUp(index) {
  if (!heldPlotIndices.has(index)) return;
  heldPlotIndices.delete(index);
  renderGarden();
}

// Called every animation frame while inhaling — grows every currently held
// plot proportionally to how long this breath has lasted so far, in sync
// with the falling rain, rather than only applying growth once you stop.
function growHeldPlotsBy(deltaSeconds) {
  if (heldPlotIndices.size === 0 || deltaSeconds <= 0) return;
  const gain = deltaSeconds / GROWTH_PER_FULL_BREATH_SEC * 100;
  heldPlotIndices.forEach(index => {
    const plot = gardenPlots[index];
    if (!plot || plot.growth >= 100) return;
    plot.growth = Math.min(100, plot.growth + gain);
    updatePlotVisual(index);
  });
}

function harvestPlot(index) {
  gardenPlots[index] = null;
  heldPlotIndices.delete(index);
  score += 1;
  const scoreEl = document.getElementById('scoreValue');
  if (scoreEl) scoreEl.textContent = score;
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('pulmoplay.bestScore', String(bestScore));
    const bestEl = document.getElementById('bestScoreValue');
    if (bestEl) bestEl.textContent = bestScore;
  }
  renderGarden();
}

function recordInspiration(durationSec) {
  const el = document.getElementById('inspTimeValue');
  if (el) el.textContent = `${durationSec.toFixed(1)}s`;
  if (durationSec > bestInspiration) {
    bestInspiration = durationSec;
    localStorage.setItem('pulmoplay.bestInspiration', String(bestInspiration));
    const bestEl = document.getElementById('bestInspValue');
    if (bestEl) bestEl.textContent = `${bestInspiration.toFixed(1)}s`;
  }
}

function updateGardenStatsUI() {
  const scoreEl = document.getElementById('scoreValue');
  const bestScoreEl = document.getElementById('bestScoreValue');
  const bestInspEl = document.getElementById('bestInspValue');
  if (scoreEl) scoreEl.textContent = score;
  if (bestScoreEl) bestScoreEl.textContent = bestScore;
  if (bestInspEl) bestInspEl.textContent = `${bestInspiration.toFixed(1)}s`;
}

/* ---------------- Tab switching ---------------- */
function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      activeTab = tab;
      buttons.forEach(b => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.hidden = panel.dataset.panel !== tab;
      });
    });
  });
}

const KEY_TO_INDEX = {};
NOTES.forEach((n, i) => { KEY_TO_INDEX[n.key] = i; });

function setupKeyboard() {
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      if (!isSpaceDown) {
        isSpaceDown = true;
        document.getElementById('sharpPill').classList.add('active');
      }
      return;
    }
    if (k === 'n') {
      e.preventDefault();
      if (!e.repeat) enterNormal();
      return;
    }
    if (k === 'x') {
      e.preventDefault();
      if (!e.repeat) enterExpiration();
      return;
    }
    if (k === 'i') {
      e.preventDefault();
      if (!e.repeat) enterInspiration();
      return;
    }
    if (e.repeat) return;
    const index = KEY_TO_INDEX[k];
    if (index === undefined) return;
    e.preventDefault();
    // Same finger-key + breath mode = same clarinet note on either tab, so
    // the garden plays the identical pitch while you tend it — the note
    // keeps sounding (or staying muted) exactly like triggerNoteOn already
    // gates on instrumentMuted for the clarinet.
    triggerNoteOn(index);
    if (activeTab === 'garden') onPlotKeyDown(index);
  });

  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === ' ') {
      isSpaceDown = false;
      document.getElementById('sharpPill').classList.remove('active');
      return;
    }
    if (k === 'n' || k === 'x' || k === 'i') return; // breath mode only changes on the n / x / i keydown itself
    const index = KEY_TO_INDEX[k];
    if (index === undefined) return;
    triggerNoteOff(index);
    if (activeTab === 'garden') onPlotKeyUp(index);
  });
}

function setupBreathTestButton() {
  const btn = document.getElementById('breathTestBtn');
  const start = e => {
    e.preventDefault();
    btn.classList.add('blowing');
    enterInspiration(); // simulates the ESP32's "i" event
  };
  const stop = () => {
    btn.classList.remove('blowing');
    enterNormal(); // simulates the ESP32's "n" event
  };
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', stop);
  btn.addEventListener('mouseleave', stop);
  btn.addEventListener('touchstart', start, { passive: false });
  btn.addEventListener('touchend', stop);
}

function setupSharpPill() {
  const pill = document.getElementById('sharpPill');
  const on = e => { e.preventDefault(); isSpaceDown = true; pill.classList.add('active'); };
  const off = () => { isSpaceDown = false; pill.classList.remove('active'); };
  pill.addEventListener('mousedown', on);
  pill.addEventListener('mouseup', off);
  pill.addEventListener('mouseleave', off);
  pill.addEventListener('touchstart', on, { passive: false });
  pill.addEventListener('touchend', off);
}

/* ---------------- Screen readouts + side steppers ---------------- */
function updateTrackUI() {
  document.getElementById('trackValue').textContent = TRACK_LABELS[currentTrackName];
}

function stopBackingUI() {
  stopBacking();
  document.getElementById('playTrackBtn').classList.remove('playing');
}

function startBackingUI() {
  startBacking();
  document.getElementById('playTrackBtn').classList.add('playing');
}

function changeTrack(delta) {
  currentTrackIndex = (currentTrackIndex + delta + TRACK_ORDER.length) % TRACK_ORDER.length;
  currentTrackName = TRACK_ORDER[currentTrackIndex];
  updateTrackUI();
  if (currentTrackName === 'none') {
    if (isPlayingBacking) stopBackingUI();
  } else if (isPlayingBacking) {
    currentStepIndex = currentStepIndex % TRACKS[currentTrackName].steps.length;
  }
}

function changeTempo(delta) {
  tempo = Math.min(160, Math.max(60, tempo + delta));
  document.getElementById('tempoValue').textContent = `${tempo} BPM`;
}

function updateLevelMeter() {
  const filled = Math.round(backingVolumePercent / 20);
  document.querySelectorAll('#levelMeter i').forEach((bar, i) => bar.classList.toggle('filled', i < filled));
}

function changeVolume(delta) {
  backingVolumePercent = Math.min(100, Math.max(0, backingVolumePercent + delta));
  document.getElementById('volValue').textContent = `${backingVolumePercent}%`;
  if (backingGain) backingGain.gain.value = backingVolumePercent / 100 * 0.5;
  updateLevelMeter();
}

function setupConsoleControls() {
  document.getElementById('trackPrev').addEventListener('click', () => changeTrack(-1));
  document.getElementById('trackNext').addEventListener('click', () => changeTrack(1));

  document.getElementById('tempoDown').addEventListener('click', () => changeTempo(-5));
  document.getElementById('tempoUp').addEventListener('click', () => changeTempo(5));

  document.getElementById('volDown').addEventListener('click', () => changeVolume(-10));
  document.getElementById('volUp').addEventListener('click', () => changeVolume(10));

  document.getElementById('playTrackBtn').addEventListener('click', () => {
    if (currentTrackName === 'none') return;
    ensureAudioContext();
    if (isPlayingBacking) stopBackingUI(); else startBackingUI();
  });
}

buildButtons();
setupKeyboard();
setupSharpPill();
setupBreathTestButton();
setupConsoleControls();
setupTabs();
buildRainLayer();
updateBreathUI();
updateTrackUI();
updateLevelMeter();
renderGarden();
updateGardenStatsUI();
