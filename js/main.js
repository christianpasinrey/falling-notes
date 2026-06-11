import { PianoSynth } from './synth.js';
import { Sequencer } from './sequencer.js';
import { PIECES } from './pieces/index.js';
import { loadCatalog, loadCatalogPiece, buildPieceFromMidi } from './catalog.js';
import { NoteInput } from './input.js';
import { Judge } from './judge.js';

const overlay = document.getElementById('overlay');
const piecesEl = document.getElementById('pieces');
const captionTitle = document.getElementById('caption-title');
const explorer = document.getElementById('explorer');
const exSearch = document.getElementById('ex-search');
const exList = document.getElementById('ex-list');
const exCount = document.getElementById('ex-count');

// Prefer the WebGL space journey; fall back to the 2D highway if WebGL or
// the three.js CDN are unavailable.
const stage = document.getElementById('stage');
let viz;
try {
  const { Visualizer3D } = await import('./visualizer3d.js');
  viz = new Visualizer3D(stage);
} catch (err) {
  console.warn('3D renderer unavailable, using 2D fallback:', err);
  const { Visualizer } = await import('./visualizer2d.js');
  viz = new Visualizer(stage);
}

let synth = null;
let seq = null;
let paused = false;

// — play-it-yourself mode —
const input = new NoteInput();
const liveInput = new Map(); // midi -> {vel}, shared with the visualizer
viz.setLiveInput(liveInput);
let mode = localStorage.getItem('fn-mode');
if (!['listen', 'play', 'practice'].includes(mode)) mode = 'listen';
let judge = null;

const playhud = document.getElementById('playhud');
const hudJudge = document.getElementById('hud-judge');
const hudScore = document.getElementById('hud-score');
const hudCombo = document.getElementById('hud-combo');
const hudInput = document.getElementById('hud-input');
const modeHint = document.getElementById('mode-hint');
const modeButtons = document.querySelectorAll('[data-mode]');

const MODE_HINTS = {
  listen: 'sit back — the piano plays itself',
  play: 'the piece falls silent and you play it, scored',
  practice: 'the piece waits for the correct key before moving on',
};

function setMode(m, { restart = false } = {}) {
  mode = m;
  localStorage.setItem('fn-mode', m);
  for (const btn of modeButtons) {
    const on = btn.dataset.mode === m;
    btn.classList.toggle('on', on);
    if (btn.getAttribute('role') === 'radio') btn.setAttribute('aria-checked', String(on));
  }
  if (m !== 'listen') input.enableMidi().then(updateInputStatus);
  updateModeHint();
  if (restart && seq && document.body.classList.contains('playing')) start(currentIndex);
}

function updateModeHint() {
  let text = MODE_HINTS[mode];
  if (mode !== 'listen')
    text += input.midiName ? ` · MIDI: ${input.midiName}` : ' · computer keys, labelled on the piano';
  modeHint.textContent = text;
}

function updateInputStatus() {
  hudInput.textContent = input.midiName
    ? `MIDI · ${input.midiName}`
    : `computer keys · hold L/R shift = 2 octaves down/up · ↑/↓ moves home (Z = ${input.octaveName})`;
  if (judge) judge.fold = input.source === 'keyboard';
  updateModeHint();
  refreshKeyLabels();
}

function refreshKeyLabels() {
  const playing = document.body.classList.contains('playing');
  viz.setKeyLabels(mode !== 'listen' && playing && input.source === 'keyboard' ? input.labelMap() : null);
}

for (const btn of modeButtons) btn.addEventListener('click', () => setMode(btn.dataset.mode, { restart: true }));
setMode(mode);

input.onnoteon = (midi, vel) => {
  if (!synth || paused) return;
  synth.noteOn(midi, vel);
  liveInput.set(midi, { vel });
  if (judge && seq) showJudgement(judge.noteOn(midi, seq.songTime));
};
input.onnoteoff = (midi) => {
  synth?.noteOff(midi);
  liveInput.delete(midi);
};
input.onpedal = (down) => synth?.setPedal(down);
input.onchange = updateInputStatus;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);

let shownGate = '';
function showWaiting(gate) {
  const key = gate.start + ':' + gate.midis.join();
  if (key === shownGate) return;
  shownGate = key;
  judgeAnim?.cancel();
  hudJudge.className = 'wait';
  hudJudge.textContent = '⏸ ' + gate.midis.map(noteName).join(' + ');
}

let judgeAnim = null;
function showJudgement(result) {
  shownGate = '';
  hudJudge.textContent = result === 'extra' ? '·' : result;
  hudJudge.className = result;
  judgeAnim?.cancel();
  judgeAnim = hudJudge.animate(
    [{ opacity: 1, transform: 'scale(1.18)' }, { opacity: 1, transform: 'scale(1)', offset: 0.25 }, { opacity: 0 }],
    { duration: 900, easing: 'ease-out', fill: 'forwards' }
  );
  hudScore.textContent = String(Math.round(judge.score));
  hudCombo.textContent = judge.combo > 1 ? `×${judge.combo}` : '';
}

// A playlist is what prev/next/autoplay walk through: the featured nine, or
// whatever slice of the Mutopia library the explorer currently shows.
const featured = PIECES.map((p) => ({ label: p.title, load: async () => p }));
let playlist = featured;
let currentIndex = -1;
let startToken = 0;

// — featured cards —
PIECES.forEach((piece, i) => {
  const card = document.createElement('button');
  card.className = 'card';
  card.style.setProperty('--accent', piece.accent);
  for (const field of ['mood', 'title', 'composer', 'marking', 'duration']) {
    const span = document.createElement('span');
    span.className = field;
    span.textContent = piece[field];
    card.appendChild(span);
  }
  card.addEventListener('click', () => {
    playlist = featured;
    start(i);
  });
  piecesEl.appendChild(card);
});

async function start(index) {
  const token = ++startToken;
  currentIndex = ((index % playlist.length) + playlist.length) % playlist.length;
  const item = playlist[currentIndex];

  let piece;
  try {
    captionTitle.textContent = `loading — ${item.label}…`;
    piece = await item.load();
  } catch (err) {
    console.error('could not load piece:', err);
    captionTitle.textContent = `could not load ${item.label}`;
    return;
  }
  if (token !== startToken) return; // a newer start superseded this one

  // A fresh context every run keeps restart trivial and leak-free.
  if (synth) synth.ctx.close();
  synth = new PianoSynth();
  seq = new Sequencer(synth, piece, { silent: mode !== 'listen' });
  seq.onended = () => start(currentIndex + 1); // autoplay: on to the next
  viz.setPiece(piece);
  setPaused(false);

  liveInput.clear();
  shownGate = '';
  if (mode !== 'listen') {
    judge = new Judge(
      seq.notes.map(([midi, beat]) => ({ midi, start: beat * seq.spb })),
      { fold: input.source === 'keyboard' }
    );
    let lo = 108, hi = 21;
    for (const [midi] of seq.notes) {
      if (midi < lo) lo = midi;
      if (midi > hi) hi = midi;
    }
    input.fitTo(lo, hi);
    input.attach();
    hudScore.textContent = '0';
    hudCombo.textContent = '';
    hudJudge.textContent = '';
    playhud.hidden = false;
  } else {
    judge = null;
    input.detach();
    playhud.hidden = true;
  }

  document.documentElement.style.setProperty('--accent', piece.accent);
  document.documentElement.style.setProperty('--hand-r', piece.colors.R.body);
  document.documentElement.style.setProperty('--hand-l', piece.colors.L.body);
  captionTitle.textContent = `${piece.title} — ${piece.composer.split('·')[0].trim()}`;

  synth.resume().then(() => {
    if (token !== startToken) return;
    seq.start();
    overlay.classList.add('hidden');
    document.body.classList.add('playing');
    refreshKeyLabels();
  });
}

function backToMenu() {
  startToken++;
  seq?.stop();
  if (synth) synth.ctx.close();
  synth = null;
  seq = null;
  judge = null;
  input.detach();
  liveInput.clear();
  viz.setKeyLabels(null);
  playhud.hidden = true;
  setPaused(false);
  document.body.classList.remove('playing');
  overlay.classList.remove('hidden');
}

function setPaused(value) {
  paused = value;
  document.body.classList.toggle('paused', paused);
  if (synth) (paused ? synth.suspend() : synth.resume());
}

function togglePause() {
  if (synth && seq) setPaused(!paused);
}

document.getElementById('btn-prev').addEventListener('click', () => start(currentIndex - 1));
document.getElementById('btn-next').addEventListener('click', () => start(currentIndex + 1));
document.getElementById('btn-play').addEventListener('click', togglePause);

// — library explorer —
let allItems = null;
let shownItems = [];

document.getElementById('explore-btn').addEventListener('click', async () => {
  overlay.classList.add('exploring');
  explorer.hidden = false;
  exSearch.focus();
  if (!allItems) {
    exCount.textContent = 'loading the library…';
    ({ items: allItems } = await loadCatalog());
    renderExplorer('');
  }
});

document.getElementById('ex-back').addEventListener('click', () => {
  overlay.classList.remove('exploring');
  explorer.hidden = true;
});

exSearch.addEventListener('input', () => renderExplorer(exSearch.value));

function renderExplorer(query) {
  const q = query.trim().toLowerCase();
  shownItems = !q
    ? allItems
    : allItems.filter((it) =>
        `${it.label} ${it.entry.composer} ${it.entry.instruments} ${it.entry.style}`.toLowerCase().includes(q)
      );

  exList.replaceChildren();
  const cap = 120;
  for (const it of shownItems.slice(0, cap)) {
    const row = document.createElement('button');
    row.className = 'ex-row';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = it.label;
    const c = document.createElement('span');
    c.className = 'c';
    c.textContent = it.entry.composer;
    const i = document.createElement('span');
    i.className = 'i';
    i.textContent = `${it.entry.instruments} · ${it.entry.style}`;
    row.append(t, c, i);
    row.addEventListener('click', () => {
      const list = shownItems;
      playlist = list.map((x) => ({ label: x.label, load: () => loadCatalogPiece(x) }));
      start(list.indexOf(it));
    });
    exList.appendChild(row);
  }
  exCount.textContent =
    shownItems.length > cap
      ? `showing ${cap} of ${shownItems.length} pieces — keep typing to narrow down`
      : `${shownItems.length} ${shownItems.length === 1 ? 'piece' : 'pieces'}`;
}

// — open your own MIDI: file picker + drop anywhere; nothing leaves the browser —
const midiFile = document.getElementById('midi-file');
document.getElementById('open-midi-btn').addEventListener('click', () => midiFile.click());
midiFile.addEventListener('change', () => {
  loadLocalMidi(midiFile.files[0]);
  midiFile.value = ''; // so picking the same file again still fires change
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = [...e.dataTransfer.files].find((f) => /\.(mid|midi|kar)$/i.test(f.name));
  if (file) loadLocalMidi(file);
});

async function loadLocalMidi(file) {
  if (!file) return;
  const buf = await file.arrayBuffer();
  const title = file.name.replace(/\.(mid|midi|kar)$/i, '').replace(/[_-]+/g, ' ');
  const idSeed = [...file.name].reduce((a, c) => a + c.charCodeAt(0), 0);
  playlist = [{
    label: title,
    load: async () => buildPieceFromMidi(buf, { idSeed, title, composer: 'your file', mood: 'yours' }),
  }];
  start(0);
}

window.addEventListener('keydown', (e) => {
  const inMenu = !overlay.classList.contains('hidden');
  if (inMenu) {
    if (e.key === 'Escape' && !explorer.hidden) {
      overlay.classList.remove('exploring');
      explorer.hidden = true;
    }
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    togglePause();
  } else if ((e.key === 'r' || e.key === 'R') && e.target === document.body && mode === 'listen') {
    start(currentIndex); // outside listen-mode R is a note (F), not restart
  } else if (e.key === 'ArrowRight') {
    start(currentIndex + 1);
  } else if (e.key === 'ArrowLeft') {
    start(currentIndex - 1);
  } else if (e.key === 'Escape') {
    backToMenu();
  }
});

function frame() {
  if (judge && seq && !paused) {
    if (mode === 'practice') {
      // hold the piece at the next unplayed note (or chord) until it lands
      const gate = judge.nextGate();
      if (gate && seq.songTime > gate.start) {
        seq.holdAt(gate.start);
        showWaiting(gate);
      }
    }
    if (judge.update(seq.songTime)) showJudgement('miss');
  }
  const t = seq ? seq.songTime : -4;
  viz.render(t, seq && t > 0 ? t / seq.totalSeconds : 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
