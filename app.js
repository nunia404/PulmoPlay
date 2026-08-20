/* PulmoPlay — 9 button keyboard clarinet
   8 note buttons (A S D ArrowLeft -> C D E F, ArrowRight K L ; -> G A B C)
   + an ArrowUp "sharp" button = 9 buttons total.
   All sound is synthesized live with the Web Audio API. */

const NOTES = [
  { key: 'a', name: 'C', octave: 4, freq: 261.63 },
  { key: 's', name: 'D', octave: 4, freq: 293.66 },
  { key: 'd', name: 'E', octave: 4, freq: 329.63 },
  { key: 'arrowleft', name: 'F', octave: 4, freq: 349.23 },
  { key: 'arrowright', name: 'G', octave: 4, freq: 392.00 },
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

let isSharpKeyDown = false;

// Breath control: the ESP32 flow sensor sends one of three keys over
// Bluetooth — "n" (normal / pause, no airflow), "ArrowDown" (expiration,
// breathing out), "i" (inspiration, breathing in).
//
// The instrument mutes the moment an inhale starts and stays muted through
// any "normal" in between — it only comes back once an exhale actually
// begins. That's a latch (instrumentMuted), not a plain function of the
// current mode, so it needs its own variable.
//
// Cloud Garden maps the same three states to weather, never to force:
// inhale summons a cloud, exhale rains, pause lets water soak and plants grow.
let breathMode = 'normal'; // 'normal' | 'inspiration' | 'expiration'
let instrumentMuted = false; // latched by inspiration/expiration; unaffected by 'normal'

// Which tab is showing — note keys still drive the clarinet; Cloud Garden
// listens only to the three breath states (plus its own UI buttons).
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

const KEY_GLYPHS = { arrowleft: '←', arrowright: '→', arrowdown: '↓' };
function keyLabel(key) {
  if (KEY_GLYPHS[key]) return KEY_GLYPHS[key];
  return key === ';' ? ';' : key.toUpperCase();
}

function buildButtons() {
  const padRow = document.getElementById('padRow');

  NOTES.forEach((note, index) => {
    const label = index === NOTES.length - 1 ? `${note.name}’` : note.name; // C' for the octave-up C
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'note-btn';
    btn.innerHTML =
      `<span class="note-name">${label}</span>` +
      `<span class="key-label">${keyLabel(note.key)}</span>`;

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
  const sharp = isSharpKeyDown;
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
const BREATH_LABELS = {
  normal: 'PAUSE',
  inspiration: 'INHALE',
  expiration: 'EXHALE',
};
const BREATH_LABELS_CLARINET = {
  normal: 'NORMAL',
  inspiration: 'INHALE',
  expiration: 'EXHALE',
};

function updateBreathUI() {
  const value = document.getElementById('breathValue');
  const text = document.getElementById('breathText');
  const puff = document.getElementById('breathPuff');
  // The tile itself is an honest readout of the current sensor mode —
  // independent of the instrument's latched mute and Cloud Garden weather.
  const isExhaling = breathMode === 'expiration';
  const isInhaling = breathMode === 'inspiration';
  value.classList.toggle('on', isExhaling);
  value.classList.toggle('muted', isInhaling);
  text.textContent = BREATH_LABELS_CLARINET[breathMode];
  puff.classList.toggle('blowing', isExhaling);

  const valueG = document.getElementById('breathValueGarden');
  const textG = document.getElementById('breathTextGarden');
  if (valueG) {
    valueG.classList.toggle('on', isExhaling);
    valueG.classList.toggle('muted', isInhaling);
    textG.textContent = BREATH_LABELS[breathMode];
  }

  updateCloudGardenWeather();
}

// Switches the current breath mode and reconciles everything that depends
// on it. The instrument's mute is a latch, not a plain function of the
// current mode: an inhale mutes it and it *stays* muted through any
// "normal" in between, only clearing once an exhale actually begins —
// so the player can keep fingering notes the whole time and just wait
// out the silence until they breathe out again.
function setBreathMode(mode) {
  if (breathMode === mode) return;
  const previous = breathMode;
  breathMode = mode;

  const wasMuted = instrumentMuted;
  if (mode === 'inspiration') instrumentMuted = true;
  else if (mode === 'expiration') instrumentMuted = false;
  // 'normal' leaves instrumentMuted exactly as it was

  updateBreathUI();
  onGardenBreathChange(previous, mode);

  if (instrumentMuted && !wasMuted) {
    Array.from(fingersDown).forEach(i => soundOff(i));
  } else if (!instrumentMuted && wasMuted) {
    fingersDown.forEach(i => soundOn(i));
  }
}

// ESP32 sends a discrete "n" / "ArrowDown" / "i" the moment the breath state
// changes — the mode stays put until the next one arrives, it is not held
// down / repeated the whole time. Both games share this same signal.
function enterNormal() {
  ensureAudioContext();
  setBreathMode('normal');
}

function enterExpiration() {
  ensureAudioContext();
  setBreathMode('expiration');
}

function enterInspiration() {
  ensureAudioContext();
  setBreathMode('inspiration');
}

/* ---------------- Cloud Garden ----------------
   A one-minute children's breathing game. Only three states matter:
   inhale → cloud, exhale → rain, pause → soak & grow.
   Growth and rewards never depend on breath force, length, or "trying harder". */
const SESSION_MS = 60_000;
const ANIMALS_LAST_MS = 10_000;
const PLOT_COUNT = 8;

const PLANT_KINDS = {
  flower: { emoji: ['\u{1F337}', '\u{1F338}', '\u{1F33A}', '\u{1F33B}', '\u{1F339}'], label: 'flower' },
  fern: { emoji: ['\u{1F33F}', '\u{1F343}'], label: 'fern' },
  mushroom: { emoji: ['\u{1F344}'], label: 'mushroom' },
  vine: { emoji: ['\u{1F33E}', '\u{1F331}'], label: 'vine' },
};
const SEEDLING = '\u{1F331}';

const ANIMALS = [
  { id: 'bee', name: 'Bee', emoji: '\u{1F41D}', base: 'common', habitat: 'air' },
  { id: 'butterfly', name: 'Butterfly', emoji: '\u{1F98B}', base: 'common', habitat: 'air' },
  { id: 'bird', name: 'Bird', emoji: '\u{1F426}', base: 'uncommon', habitat: 'air' },
  { id: 'ladybug', name: 'Ladybug', emoji: '\u{1F41E}', base: 'rare', habitat: 'air' },
  { id: 'frog', name: 'Frog', emoji: '\u{1F438}', base: 'uncommon', habitat: 'ground' },
  { id: 'snail', name: 'Snail', emoji: '\u{1F40C}', base: 'common', habitat: 'ground' },
];

const BIOMES = [
  { id: 'meadow', label: 'Meadow biome', prefers: ['flower'] },
  { id: 'fern-grove', label: 'Fern grove', prefers: ['fern'] },
  { id: 'mushroom-hollow', label: 'Mushroom hollow', prefers: ['mushroom'] },
  { id: 'vine-canopy', label: 'Vine canopy', prefers: ['vine'] },
];

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
const RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' };

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let gardenPhase = 'idle'; // idle | playing | complete | bonus | done
let sessionStartedAt = 0;
let sessionTimerRAF = null;
let sessionPlants = []; // { kind, emoji, stage } stage 0=seedling 1=grown
let cycleStep = 'await-inhale'; // await-inhale | await-hold | await-exhale
let completedCycles = 0;
let restCount = 0;
let stateTimings = []; // { state, atMs, durationMs }
let stateEnteredAt = 0;
let animalsAppeared = false;
let sessionAnimals = [];
let earnedCards = [];
let comfortRating = null;
let bonusUsed = false;
let bonusStep = null;
let neighbourPlants = [];
let sessionBiome = BIOMES[0];
let visitCount = parseInt(localStorage.getItem('pulmoplay.gardenVisits') || '0', 10);
let cardCollection = loadJson('pulmoplay.animalCards', {});
let sessionLogs = loadJson('pulmoplay.sessionLogs', []);

// Gentle coach: inhale 4 → hold 4 → exhale 8
const GUIDE_STEPS = [
  { phase: 'inhale', label: 'Inhale', seconds: 4 },
  { phase: 'hold', label: 'Hold', seconds: 4 },
  { phase: 'exhale', label: 'Exhale', seconds: 8 },
];
let guideRunning = false;
let guideStepIndex = 0;
let guidePhase = 'inhale';
let guideSecondsLeft = 4;
let guidePhaseStartedAt = 0;
let guideRAF = null;
let guideCompleteCycles = 0; // guided loops finished this session
let guideLastTickAt = 0;

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildRainLayer() {
  const layer = document.getElementById('rainLayer');
  if (!layer) return;
  layer.innerHTML = '';
  const DROP_COUNT = 28;
  for (let i = 0; i < DROP_COUNT; i++) {
    const drop = document.createElement('span');
    drop.className = 'raindrop';
    drop.style.left = `${(Math.random() * 100).toFixed(1)}%`;
    drop.style.animationDelay = `${(Math.random() * 0.9).toFixed(2)}s`;
    drop.style.animationDuration = `${(0.7 + Math.random() * 0.5).toFixed(2)}s`;
    layer.appendChild(drop);
  }
}

function updateCloudGardenWeather() {
  const cloud = document.getElementById('gardenCloud');
  const rainLayer = document.getElementById('rainLayer');
  if (!cloud || !rainLayer) return;

  const active = gardenPhase === 'playing' || gardenPhase === 'bonus';
  // Prefer the gentle guide phase for weather while a session runs, so the
  // garden matches inhale → hold → exhale. Fall back to live breath otherwise.
  let showCloud = false;
  let showRain = false;
  if (active && guideRunning) {
    showCloud = guidePhase === 'inhale' || guidePhase === 'hold';
    showRain = guidePhase === 'exhale';
  } else if (active) {
    showCloud = breathMode === 'inspiration' || breathMode === 'expiration' ||
      cycleStep === 'await-hold' || cycleStep === 'await-exhale';
    showRain = breathMode === 'expiration';
  }
  cloud.classList.toggle('visible', showCloud);
  cloud.classList.toggle('raining', showRain);
  rainLayer.classList.toggle('active', showRain);
}

function formatTimeLeft(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateSessionHud() {
  const timeEl = document.getElementById('sessionTimeValue');
  const cycleEl = document.getElementById('cycleValue');
  const restEl = document.getElementById('restValue');
  const hintEl = document.getElementById('patternHint');
  if (cycleEl) cycleEl.textContent = String(completedCycles);
  if (restEl) restEl.textContent = String(restCount);

  if (gardenPhase === 'playing') {
    const left = SESSION_MS - (performance.now() - sessionStartedAt);
    if (timeEl) timeEl.textContent = formatTimeLeft(left);
    if (hintEl) hintEl.textContent = 'Inhale 4 · Hold 4 · Exhale 8';
  } else if (gardenPhase === 'bonus') {
    if (timeEl) timeEl.textContent = 'Bonus';
    if (hintEl) hintEl.textContent = 'Bonus: Inhale 4 · Hold 4 · Exhale 8';
  } else if (gardenPhase === 'idle') {
    if (timeEl) timeEl.textContent = '1:00';
    if (hintEl) hintEl.textContent = 'Inhale 4 · Hold 4 · Exhale 8';
  }
}

function setGuideVisible(visible) {
  const guide = document.getElementById('breathGuide');
  if (guide) guide.hidden = !visible;
}

function updateGuideUI(progress01) {
  const guide = document.getElementById('breathGuide');
  const dot = document.getElementById('guideDot');
  const text = document.getElementById('guideText');
  if (!guide || !dot || !text) return;

  guide.classList.remove('phase-inhale', 'phase-hold', 'phase-exhale');
  guide.classList.add(`phase-${guidePhase}`);

  const count = Math.max(1, guideSecondsLeft);
  const verb = guidePhase === 'inhale' ? 'Inhale' : guidePhase === 'hold' ? 'Hold' : 'Exhale';
  text.innerHTML = `${verb} for <span class="guide-count">${count}</span>`;

  // Dot gently grows on inhale, holds large, shrinks on exhale.
  let scale = 1;
  if (guidePhase === 'inhale') scale = 0.5 + progress01 * 0.9;
  else if (guidePhase === 'hold') scale = 1.4;
  else scale = 1.4 - progress01 * 0.9;
  dot.style.transform = `scale(${scale.toFixed(3)})`;
}

function stopBreathGuide() {
  guideRunning = false;
  if (guideRAF) {
    cancelAnimationFrame(guideRAF);
    guideRAF = null;
  }
  setGuideVisible(false);
}

function startBreathGuide() {
  stopBreathGuide();
  guideRunning = true;
  guideStepIndex = 0;
  guideCompleteCycles = 0;
  const step = GUIDE_STEPS[0];
  guidePhase = step.phase;
  guideSecondsLeft = step.seconds;
  guidePhaseStartedAt = performance.now();
  guideLastTickAt = guidePhaseStartedAt;
  setGuideVisible(true);
  updateGuideUI(0);
  updateCloudGardenWeather();
  guideRAF = requestAnimationFrame(tickBreathGuide);
}

function tickBreathGuide() {
  if (!guideRunning) return;
  if (gardenPhase !== 'playing' && gardenPhase !== 'bonus') {
    stopBreathGuide();
    return;
  }

  const now = performance.now();
  const deltaSec = Math.min(0.05, (now - guideLastTickAt) / 1000);
  guideLastTickAt = now;

  const step = GUIDE_STEPS[guideStepIndex];
  const elapsed = (now - guidePhaseStartedAt) / 1000;
  const progress = Math.min(1, elapsed / step.seconds);
  const left = Math.max(1, Math.ceil(step.seconds - elapsed));
  if (left !== guideSecondsLeft) {
    guideSecondsLeft = left;
  }
  updateGuideUI(progress);

  // Hold = water soaking in — plants swell larger and larger.
  if (guidePhase === 'hold') {
    growPlantsDuringSoak(deltaSec);
  }

  if (elapsed >= step.seconds) {
    const finishedPhase = guidePhase;
    guideStepIndex = (guideStepIndex + 1) % GUIDE_STEPS.length;
    const next = GUIDE_STEPS[guideStepIndex];
    guidePhase = next.phase;
    guideSecondsLeft = next.seconds;
    guidePhaseStartedAt = now;

    // Completing exhale closes one guided cycle: grow the garden gently.
    if (finishedPhase === 'exhale') {
      guideCompleteCycles += 1;
      completedCycles += 1;
      if (sessionPlants.length === 0) plantSeedling();
      advanceGardenGrowth();
      cycleStep = 'await-inhale';
      if (gardenPhase === 'bonus') {
        playWindSeeds();
        settleNeighbourSeeds();
        finishBonus();
        stopBreathGuide();
        updateSessionHud();
        return;
      }
      updateSessionHud();
    }
    updateCloudGardenWeather();
    updateGuideUI(0);
  }

  guideRAF = requestAnimationFrame(tickBreathGuide);
}

function renderPlants() {
  const root = document.getElementById('gardenPlots');
  if (!root) return;
  root.innerHTML = '';
  for (let i = 0; i < PLOT_COUNT; i++) {
    const slot = document.createElement('div');
    slot.className = 'plant-slot';
    const plant = sessionPlants[i];
    if (plant) {
      const el = document.createElement('span');
      el.className = 'plant' + (plant.stage === 0 ? ' seedling' : '');
      el.textContent = plant.stage === 0 ? SEEDLING : plant.emoji;
      el.title = plant.kind;
      el.style.setProperty('--plant-scale', String(plant.scale || (plant.stage === 0 ? 0.55 : 1)));
      slot.appendChild(el);
    }
    root.appendChild(slot);
  }
}

function applyPlantScales() {
  const nodes = document.querySelectorAll('#gardenPlots .plant');
  sessionPlants.forEach((plant, i) => {
    const el = nodes[i];
    if (!el || !plant) return;
    el.style.setProperty('--plant-scale', String(plant.scale));
    el.classList.toggle('soak', guideRunning && guidePhase === 'hold');
  });
}

// During hold (water absorption), plants swell larger and larger.
function growPlantsDuringSoak(deltaSec) {
  if (!sessionPlants.length || deltaSec <= 0) return;
  let changed = false;
  sessionPlants.forEach(plant => {
    const cap = plant.stage === 0 ? 1.05 : 1.85;
    const next = Math.min(cap, plant.scale + deltaSec * 0.28);
    if (next !== plant.scale) {
      plant.scale = next;
      changed = true;
    }
  });
  if (changed) applyPlantScales();
}

function pulseSoak() {
  document.querySelectorAll('#gardenPlots .plant').forEach(el => {
    el.classList.add('soak');
  });
}

function choosePlantKind() {
  // Gentle mix that drifts as the garden fills — not tied to breath length.
  const counts = { flower: 0, fern: 0, mushroom: 0, vine: 0 };
  sessionPlants.forEach(p => { counts[p.kind] = (counts[p.kind] || 0) + 1; });
  const grown = sessionPlants.filter(p => p.stage > 0).length;
  const keys = Object.keys(PLANT_KINDS);
  // Prefer under-represented kinds; early session leans flower/fern.
  const weights = keys.map(k => {
    let w = 1.2 - (counts[k] || 0) * 0.25;
    if (grown < 2 && (k === 'flower' || k === 'fern')) w += 0.6;
    if (grown >= 3 && (k === 'mushroom' || k === 'vine')) w += 0.5;
    return Math.max(0.2, w);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < keys.length; i++) {
    r -= weights[i];
    if (r <= 0) return keys[i];
  }
  return 'flower';
}

function plantSeedling() {
  if (sessionPlants.length >= PLOT_COUNT) return;
  const kind = choosePlantKind();
  sessionPlants.push({
    kind,
    emoji: pickRandom(PLANT_KINDS[kind].emoji),
    stage: 0,
    scale: 0.5,
  });
  renderPlants();
}

function advanceGardenGrowth() {
  // After a full inhale→hold→exhale cycle: soak has already swollen plants;
  // now mature a seedling and invite new sprouts.
  const seedlings = sessionPlants.filter(p => p.stage === 0);
  if (seedlings.length > 0) {
    const target = pickRandom(seedlings);
    target.stage = 1;
    target.emoji = pickRandom(PLANT_KINDS[target.kind].emoji);
    target.scale = Math.max(target.scale, 1.05);
  }

  if (sessionPlants.length < PLOT_COUNT) {
    plantSeedling();
    if (sessionPlants.length < PLOT_COUNT && Math.random() < 0.4) {
      plantSeedling();
    }
  } else if (seedlings.length === 0) {
    const idx = Math.floor(Math.random() * sessionPlants.length);
    const kind = choosePlantKind();
    sessionPlants[idx] = {
      kind,
      emoji: pickRandom(PLANT_KINDS[kind].emoji),
      stage: 1,
      scale: Math.max(sessionPlants[idx].scale || 1, 1.1),
    };
  }
  renderPlants();
  pulseSoak();
}

function determineBiome() {
  const counts = { flower: 0, fern: 0, mushroom: 0, vine: 0 };
  sessionPlants.forEach(p => { counts[p.kind] = (counts[p.kind] || 0) + 1; });
  let best = BIOMES[0];
  let bestScore = -1;
  BIOMES.forEach(b => {
    const score = b.prefers.reduce((sum, k) => sum + (counts[k] || 0), 0) + Math.random() * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  });
  return best;
}

function bumpRarity(base, steps) {
  const order = ['common', 'uncommon', 'rare', 'legendary'];
  const i = Math.min(order.length - 1, Math.max(0, order.indexOf(base) + steps));
  return order[i];
}

function rollAnimalCard(animal, biome) {
  // Rarity from biome fit, plant mix, repeat visits, and gentle randomness —
  // never from breathing force or session length.
  const kinds = new Set(sessionPlants.map(p => p.kind));
  let bump = 0;
  if (biome.prefers.some(k => kinds.has(k))) bump += 1;
  if (kinds.size >= 3) bump += 1;
  if (visitCount >= 3 && Math.random() < 0.45) bump += 1;
  if (Math.random() < 0.12) bump += 1;
  if (Math.random() < 0.55) bump = Math.max(0, bump - 1); // keep commons common
  const rarity = bumpRarity(animal.base, bump);
  return {
    id: animal.id,
    name: animal.name,
    emoji: animal.emoji,
    rarity,
    at: Date.now(),
  };
}

function spawnAnimals() {
  if (animalsAppeared) return;
  animalsAppeared = true;
  const sky = document.getElementById('sky');
  const airLayer = document.getElementById('animalsLayer');
  const groundLayer = document.getElementById('animalsGroundLayer');
  if (sky) sky.classList.add('phase-animals');
  if (airLayer) airLayer.innerHTML = '';
  if (groundLayer) groundLayer.innerHTML = '';

  // One animal visit per one-minute session.
  const visitor = pickRandom(ANIMALS);
  sessionAnimals = [visitor];
  const flies = visitor.habitat === 'air';
  const layer = flies ? airLayer : groundLayer;
  if (!layer) return;

  const el = document.createElement('span');
  el.className = `visitor ${flies ? 'air' : 'ground'}`;
  el.textContent = visitor.emoji;
  el.title = visitor.name;
  if (flies) {
    el.style.left = `${28 + Math.random() * 40}%`;
    el.style.top = `${14 + Math.random() * 28}%`;
  } else {
    el.style.left = `${18 + Math.random() * 55}%`;
    el.style.bottom = '2px';
  }
  layer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  const prompt = document.getElementById('promptText');
  if (prompt) {
    prompt.textContent = flies
      ? `${visitor.name} is flying over your garden… keep the gentle pattern if you like.`
      : `${visitor.name} is visiting the garden floor… keep the gentle pattern if you like.`;
  }
}

function awardCards() {
  sessionBiome = determineBiome();
  const biomeEl = document.getElementById('endBiomeLabel');
  if (biomeEl) biomeEl.textContent = sessionBiome.label;

  // One animal card per one-minute session — same visitor that appeared.
  const animal = sessionAnimals[0] || pickRandom(ANIMALS);
  const card = rollAnimalCard(animal, sessionBiome);
  earnedCards = [card];
  if (!cardCollection[card.id]) {
    cardCollection[card.id] = { name: card.name, emoji: card.emoji, count: 0, bestRarity: card.rarity };
  }
  cardCollection[card.id].count += 1;
  if (RARITY_RANK[card.rarity] > RARITY_RANK[cardCollection[card.id].bestRarity]) {
    cardCollection[card.id].bestRarity = card.rarity;
  }
  saveJson('pulmoplay.animalCards', cardCollection);

  const tray = document.getElementById('cardTray');
  if (tray) {
    tray.innerHTML = '';
    const el = document.createElement('div');
    el.className = `animal-card rarity-${card.rarity}`;
    el.innerHTML =
      `<span class="card-emoji">${card.emoji}</span>` +
      `<span class="card-name">${card.name}</span>` +
      `<span class="card-rarity">${RARITY_LABEL[card.rarity]}</span>`;
    tray.appendChild(el);
  }
  renderCollection();
}

function renderCollection() {
  const root = document.getElementById('collectionCards');
  if (!root) return;
  const ids = Object.keys(cardCollection);
  if (ids.length === 0) {
    root.innerHTML = '<span class="collection-empty">Play a session to collect animal cards</span>';
    return;
  }
  root.innerHTML = '';
  ids.forEach(id => {
    const c = cardCollection[id];
    const rarity = c.bestRarity || 'common';
    const chip = document.createElement('span');
    chip.className = `collection-chip rarity-${rarity}`;
    chip.innerHTML =
      `${c.emoji} ${c.name} <span class="count">×${c.count}</span>` +
      `<span class="chip-rarity">${RARITY_LABEL[rarity]}</span>`;
    root.appendChild(chip);
  });
}

function recordStateDuration(nextState) {
  const now = performance.now();
  if (stateEnteredAt) {
    const last = stateTimings[stateTimings.length - 1];
    if (last && last.durationMs == null) {
      last.durationMs = Math.round(now - stateEnteredAt);
    }
  }
  stateEnteredAt = now;
  stateTimings.push({ state: nextState, atMs: Math.round(now - sessionStartedAt), durationMs: null });
}

function persistSessionLog(finalized) {
  const log = {
    at: Date.now(),
    completedCycles,
    restCount,
    comfortRating,
    biome: sessionBiome.id,
    plants: sessionPlants.map(p => p.kind),
    cards: earnedCards.map(c => ({ id: c.id, rarity: c.rarity })),
    timings: stateTimings,
    bonusUsed,
    neighbourPlants: neighbourPlants.map(p => p.kind),
    note: 'Records timing, cycles, rests, and optional comfort only — not lung capacity, strength, or cough effectiveness.',
    finalized: !!finalized,
  };
  sessionLogs = [log, ...sessionLogs].slice(0, 20);
  saveJson('pulmoplay.sessionLogs', sessionLogs);
  return log;
}

function updateSessionNote() {
  const el = document.getElementById('sessionNote');
  if (!el) return;
  el.textContent =
    `${completedCycles} breath cycles · ${restCount} rests · cards from ${sessionBiome.label}. ` +
    'Saved for comfort and pattern — not as a measure of lung capacity or strength.';
}

function onGardenBreathChange(previous, mode) {
  if (gardenPhase !== 'playing' && gardenPhase !== 'bonus') return;

  recordStateDuration(mode === 'normal' ? 'hold' : mode === 'inspiration' ? 'inhale' : 'exhale');

  if (mode === 'normal' && previous !== 'normal') {
    // Returning to hold/pause after inhale or exhale counts as a rest.
    if (previous === 'inspiration' || previous === 'expiration') {
      restCount += 1;
    }
  }

  // Sensor still tracks the same gentle pattern the guide coaches:
  // inhale → hold → exhale. Growth is driven by the guide clock so timing
  // stays comfortable; breath changes are recorded for the session log.
  if (gardenPhase === 'playing') {
    if (cycleStep === 'await-inhale' && mode === 'inspiration') {
      cycleStep = 'await-hold';
      if (sessionPlants.length === 0) plantSeedling();
    } else if (cycleStep === 'await-hold' && mode === 'normal') {
      cycleStep = 'await-exhale';
    } else if (cycleStep === 'await-exhale' && mode === 'expiration') {
      cycleStep = 'await-inhale';
    }
  } else if (gardenPhase === 'bonus') {
    if (bonusStep === 'await-inhale' && mode === 'inspiration') {
      bonusStep = 'await-hold';
    } else if (bonusStep === 'await-hold' && mode === 'normal') {
      bonusStep = 'await-exhale';
    } else if (bonusStep === 'await-exhale' && mode === 'expiration') {
      bonusStep = 'await-inhale';
    }
  }
  updateSessionHud();
}

function playWindSeeds() {
  const wind = document.getElementById('windLayer');
  if (!wind) return;
  wind.innerHTML = '';
  wind.classList.add('active');
  for (let i = 0; i < 5; i++) {
    const seed = document.createElement('span');
    seed.className = 'seed-puff';
    seed.style.top = `${30 + Math.random() * 40}%`;
    seed.style.animationDelay = `${(i * 0.12).toFixed(2)}s`;
    wind.appendChild(seed);
  }
}

function settleNeighbourSeeds() {
  const kinds = ['flower', 'fern', 'mushroom', 'vine'];
  neighbourPlants = [];
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const kind = pickRandom(kinds);
    neighbourPlants.push({
      kind,
      emoji: pickRandom(PLANT_KINDS[kind].emoji),
      stage: 1,
    });
  }
  const box = document.getElementById('neighbourPlot');
  const plants = document.getElementById('neighbourPlants');
  if (box) box.hidden = false;
  if (plants) {
    plants.innerHTML = '';
    neighbourPlants.forEach(p => {
      const el = document.createElement('span');
      el.className = 'plant';
      el.textContent = p.emoji;
      plants.appendChild(el);
    });
  }
}

function finishBonus() {
  bonusUsed = true;
  gardenPhase = 'done';
  stopBreathGuide();
  const hint = document.getElementById('bonusHint');
  if (hint) hint.textContent = 'Seeds settled next door. Your animal card stays the same.';
  const bonusBtn = document.getElementById('bonusGardenBtn');
  if (bonusBtn) bonusBtn.disabled = true;
  const prompt = document.getElementById('promptText');
  if (prompt) prompt.textContent = 'Bonus complete — soft wind, new neighbour plants.';
  persistSessionLog(true);
  updateSessionHud();
  updateCloudGardenWeather();
}

function tickSession() {
  if (gardenPhase !== 'playing') return;
  const elapsed = performance.now() - sessionStartedAt;
  const left = SESSION_MS - elapsed;
  updateSessionHud();

  if (left <= ANIMALS_LAST_MS) spawnAnimals();

  if (left <= 0) {
    endSession();
    return;
  }
  sessionTimerRAF = requestAnimationFrame(tickSession);
}

function setGardenUIMode(mode) {
  const prompt = document.getElementById('gardenPrompt');
  const end = document.getElementById('gardenEnd');
  const startBtn = document.getElementById('startGardenBtn');
  if (mode === 'idle' || mode === 'playing' || mode === 'bonus') {
    if (prompt) prompt.hidden = false;
    if (end) end.hidden = true;
    if (startBtn) startBtn.hidden = mode !== 'idle';
  } else {
    if (prompt) prompt.hidden = true;
    if (end) end.hidden = false;
  }
}

function resetGardenWorld() {
  stopBreathGuide();
  sessionPlants = [];
  neighbourPlants = [];
  completedCycles = 0;
  restCount = 0;
  stateTimings = [];
  stateEnteredAt = 0;
  animalsAppeared = false;
  sessionAnimals = [];
  earnedCards = [];
  comfortRating = null;
  bonusUsed = false;
  bonusStep = null;
  cycleStep = 'await-inhale';
  sessionBiome = BIOMES[0];
  guideCompleteCycles = 0;

  const sky = document.getElementById('sky');
  const animals = document.getElementById('animalsLayer');
  const animalsGround = document.getElementById('animalsGroundLayer');
  const wind = document.getElementById('windLayer');
  const neighbour = document.getElementById('neighbourPlot');
  const tray = document.getElementById('cardTray');
  if (sky) sky.classList.remove('phase-animals');
  if (animals) animals.innerHTML = '';
  if (animalsGround) animalsGround.innerHTML = '';
  if (wind) {
    wind.classList.remove('active');
    wind.innerHTML = '';
  }
  if (neighbour) neighbour.hidden = true;
  if (tray) tray.innerHTML = '';
  document.querySelectorAll('.comfort-btn').forEach(b => b.classList.remove('selected'));
  renderPlants();
  updateCloudGardenWeather();
  updateSessionHud();
}

function startGardenSession() {
  ensureAudioContext();
  if (sessionTimerRAF) cancelAnimationFrame(sessionTimerRAF);
  resetGardenWorld();
  gardenPhase = 'playing';
  sessionStartedAt = performance.now();
  stateEnteredAt = sessionStartedAt;
  stateTimings.push({ state: breathMode === 'normal' ? 'hold' : breathMode === 'inspiration' ? 'inhale' : 'exhale', atMs: 0, durationMs: null });

  visitCount += 1;
  localStorage.setItem('pulmoplay.gardenVisits', String(visitCount));

  const prompt = document.getElementById('promptText');
  if (prompt) {
    prompt.textContent = 'Follow the glowing guide — inhale 4, hold 4, exhale 8.';
  }
  setGardenUIMode('playing');
  const demoBtn = document.getElementById('demoSkipBtn');
  if (demoBtn) demoBtn.hidden = true;
  plantSeedling();
  startBreathGuide();
  updateSessionHud();
  updateCloudGardenWeather();
  sessionTimerRAF = requestAnimationFrame(tickSession);
}

// Staff/demo only: jump to the last few seconds so demos do not wait a full minute.
const DEMO_REMAINING_MS = 4_000;
function runDemoVersion() {
  if (gardenPhase === 'playing') {
    sessionStartedAt = performance.now() - (SESSION_MS - DEMO_REMAINING_MS);
    spawnAnimals();
    updateSessionHud();
    return;
  }
  if (gardenPhase !== 'idle' && gardenPhase !== 'done') return;

  startGardenSession();
  // Seed a fuller garden so the demo ending looks lived-in.
  for (let i = 0; i < 5; i++) {
    if (sessionPlants.length < PLOT_COUNT) plantSeedling();
  }
  sessionPlants.forEach(p => {
    p.stage = 1;
    p.emoji = pickRandom(PLANT_KINDS[p.kind].emoji);
    p.scale = 1.15 + Math.random() * 0.35;
  });
  completedCycles = 3;
  renderPlants();
  sessionStartedAt = performance.now() - (SESSION_MS - DEMO_REMAINING_MS);
  spawnAnimals();
  updateSessionHud();
  const prompt = document.getElementById('promptText');
  if (prompt) prompt.textContent = 'Demo version — last 4 seconds (not for patients).';
}

function endSession() {
  if (sessionTimerRAF) cancelAnimationFrame(sessionTimerRAF);
  sessionTimerRAF = null;
  stopBreathGuide();
  recordStateDuration('end');
  gardenPhase = 'complete';

  // Ensure animals visited if the session somehow skipped the window
  if (!animalsAppeared) spawnAnimals();

  awardCards();
  updateSessionNote();
  persistSessionLog(false);

  const prompt = document.getElementById('promptText');
  if (prompt) prompt.textContent = 'Minute complete — keep your card, or try the optional wind bonus.';

  const bonusBtn = document.getElementById('bonusGardenBtn');
  if (bonusBtn) bonusBtn.disabled = false;
  const hint = document.getElementById('bonusHint');
  if (hint) {
    hint.textContent = 'Optional: one more guided breath cycle sends wind carrying seeds to a neighbouring plot. Same core reward either way.';
  }

  setGardenUIMode('complete');
  updateCloudGardenWeather();
  updateSessionHud();
}

function beginBonus() {
  if (gardenPhase !== 'complete' || bonusUsed) return;
  gardenPhase = 'bonus';
  bonusStep = 'await-inhale';
  setGardenUIMode('bonus');
  const promptWrap = document.getElementById('gardenPrompt');
  const end = document.getElementById('gardenEnd');
  if (promptWrap) promptWrap.hidden = false;
  if (end) end.hidden = false;
  const startBtn = document.getElementById('startGardenBtn');
  if (startBtn) startBtn.hidden = true;
  const prompt = document.getElementById('promptText');
  if (prompt) prompt.textContent = 'Bonus cycle: follow inhale 4, hold 4, exhale 8 — wind will carry seeds next door.';
  const bonusBtn = document.getElementById('bonusGardenBtn');
  if (bonusBtn) bonusBtn.disabled = true;
  startBreathGuide();
  updateSessionHud();
  updateCloudGardenWeather();
}

function finishGarden() {
  if (gardenPhase === 'playing') return;
  stopBreathGuide();
  if (gardenPhase === 'bonus') {
    // Ending early still keeps the same core reward (cards already awarded).
    gardenPhase = 'done';
  }
  persistSessionLog(true);
  gardenPhase = 'idle';
  const prompt = document.getElementById('promptText');
  if (prompt) {
    prompt.textContent = 'Breathe gently. Inhale summons a cloud, hold lets it rest, exhale makes it rain.';
  }
  setGardenUIMode('idle');
  updateCloudGardenWeather();
  updateSessionHud();
  renderCollection();
}

function setupCloudGardenUI() {
  const startBtn = document.getElementById('startGardenBtn');
  if (startBtn) startBtn.addEventListener('click', startGardenSession);

  const finishBtn = document.getElementById('finishGardenBtn');
  if (finishBtn) finishBtn.addEventListener('click', finishGarden);

  const bonusBtn = document.getElementById('bonusGardenBtn');
  if (bonusBtn) bonusBtn.addEventListener('click', beginBonus);

  document.querySelectorAll('.comfort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      comfortRating = Number(btn.dataset.comfort);
      document.querySelectorAll('.comfort-btn').forEach(b => b.classList.toggle('selected', b === btn));
      updateSessionNote();
      persistSessionLog(false);
    });
  });

  renderCollection();
  setGardenUIMode('idle');
  updateSessionHud();
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
    if (k === 'arrowup') {
      e.preventDefault();
      if (!isSharpKeyDown) {
        isSharpKeyDown = true;
        document.getElementById('sharpPill').classList.add('active');
      }
      return;
    }
    if (k === 'n') {
      e.preventDefault();
      if (!e.repeat) enterNormal();
      return;
    }
    if (k === 'arrowdown') {
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
    // Finger keys always drive the clarinet. Cloud Garden only listens to
    // the three breath states (I / ↓ / N), so note keys never change rewards.
    triggerNoteOn(index);
  });

  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'arrowup') {
      isSharpKeyDown = false;
      document.getElementById('sharpPill').classList.remove('active');
      return;
    }
    if (k === 'n' || k === 'arrowdown' || k === 'i') return; // breath mode only changes on the n / arrowdown / i keydown itself
    const index = KEY_TO_INDEX[k];
    if (index === undefined) return;
    triggerNoteOff(index);
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
  const on = e => { e.preventDefault(); isSharpKeyDown = true; pill.classList.add('active'); };
  const off = () => { isSharpKeyDown = false; pill.classList.remove('active'); };
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
setupCloudGardenUI();
buildRainLayer();
updateBreathUI();
updateTrackUI();
updateLevelMeter();
renderPlants();
renderCollection();
updateSessionHud();
