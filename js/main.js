import { PianoSynth } from './synth.js';
import { Sequencer, noteVoice } from './sequencer.js';
import { PIECES } from './pieces/index.js';
import { loadCatalog, loadCatalogPiece, buildPieceFromMidiSet } from './catalog.js';
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

// — voices: mute tracks while listening, pick the one you play otherwise —
const voicesPanel = document.getElementById('voices-panel');
const voicesBtn = document.getElementById('btn-voices');
let currentPiece = null;
let lastPieceId = null;
let playerVoice = 'all';
const mutedVoices = new Set(); // shared live with the sequencer

voicesBtn.addEventListener('click', () => {
  voicesPanel.hidden = !voicesPanel.hidden;
});

function renderVoicesPanel() {
  voicesPanel.replaceChildren();
  if (!currentPiece) return;
  const addRow = (label, { mine = false, muted = false, onPick, onMute }) => {
    const row = document.createElement('button');
    row.className = 'v-row' + (mine ? ' mine' : '') + (muted ? ' muted' : '');
    if (onMute) {
      const m = document.createElement('span');
      m.className = 'v-mute';
      m.title = muted ? 'unmute' : 'mute';
      m.textContent = muted ? '○' : '◉';
      m.addEventListener('click', (e) => {
        e.stopPropagation();
        onMute();
      });
      row.appendChild(m);
    }
    const name = document.createElement('span');
    name.className = 'v-name';
    name.textContent = label;
    row.appendChild(name);
    row.addEventListener('click', onPick);
    voicesPanel.appendChild(row);
  };
  if (mode !== 'listen')
    addRow('🎹 play every voice yourself', { mine: playerVoice === 'all', onPick: () => pickVoice('all') });
  currentPiece.voices.forEach((v, i) => {
    const mine = mode !== 'listen' && playerVoice === i;
    addRow((mine ? '🎹 ' : '') + v.name, {
      mine,
      muted: mutedVoices.has(i),
      onPick: mode === 'listen' ? () => toggleMute(i) : () => pickVoice(i),
      onMute: () => toggleMute(i),
    });
  });
}

function toggleMute(i) {
  mutedVoices.has(i) ? mutedVoices.delete(i) : mutedVoices.add(i);
  renderVoicesPanel(); // the sequencer shares the set — applies within the look-ahead
}

function pickVoice(v) {
  if (v === playerVoice) return;
  playerVoice = v;
  start(currentIndex); // the judge and the silence map depend on it
}

input.onnoteon = (midi, vel) => {
  if (!synth || paused) return;
  synth.noteOn(midi, vel);
  liveInput.set(midi, { vel });
  if (judge && seq) {
    const result = judge.noteOn(midi, seq.songTime);
    showJudgement(result);
    if (result === 'perfect' || result === 'good') viz.hitBurst(midi, result);
  }
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
  let text = '⏸ ' + gate.midis.map(noteName).join(' + ');
  if (input.source === 'keyboard') {
    // scoring folds octaves on QWERTY, so the plain-zone key always works
    const keys = [...new Set(gate.midis.map((m) => input.keyForPitch(m)).filter(Boolean))];
    if (keys.length) text += ` — press ${keys.join(' + ')}`;
  }
  hudJudge.textContent = text;
}

let judgeAnim = null;
function showJudgement(result) {
  shownGate = '';
  hudJudge.textContent = result === 'extra' ? '·' : result;
  hudJudge.className = result;
  judgeAnim?.cancel();
  const pop = result === 'perfect' ? 1.7 : 1.3;
  judgeAnim = hudJudge.animate(
    [
      { opacity: 1, transform: `scale(${pop})` },
      { opacity: 1, transform: 'scale(1)', offset: 0.22 },
      { opacity: 0, transform: 'scale(0.96)' },
    ],
    { duration: 950, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'forwards' }
  );
  hudScore.textContent = String(Math.round(judge.score));
  const combo = judge.combo > 1 ? `×${judge.combo}` : '';
  if (combo && combo !== hudCombo.textContent)
    hudCombo.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  hudCombo.textContent = combo;
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

  // hand-authored featured pieces have two implicit voices: the hands
  if (!piece.voices) piece.voices = [{ name: 'right hand' }, { name: 'left hand' }];
  currentPiece = piece;
  if (piece.id !== lastPieceId) {
    lastPieceId = piece.id;
    playerVoice = 'all';
    mutedVoices.clear();
  }

  // A fresh context every run keeps restart trivial and leak-free.
  if (synth) synth.ctx.close();
  synth = new PianoSynth();
  seq = new Sequencer(synth, piece, {
    playerVoice: mode === 'listen' ? null : playerVoice,
    muted: mutedVoices,
  });
  seq.onended = () => start(currentIndex + 1); // autoplay: on to the next
  viz.setPiece(piece);
  setPaused(false);
  voicesBtn.style.display = piece.voices.length > 1 ? '' : 'none';
  if (piece.voices.length < 2) voicesPanel.hidden = true;
  renderVoicesPanel();

  liveInput.clear();
  shownGate = '';
  viz.setTargets(null);
  if (mode !== 'listen') {
    // you are judged on (and fitted to) the voice you chose to play
    const mine = seq.notes.filter((n) => playerVoice === 'all' || noteVoice(n) === playerVoice);
    judge = new Judge(
      mine.map(([midi, beat]) => ({ midi, start: beat * seq.spb })),
      { fold: input.source === 'keyboard' }
    );
    let lo = 108, hi = 21;
    for (const [midi] of mine) {
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
  viz.setTargets(null);
  playhud.hidden = true;
  voicesPanel.hidden = true;
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
  loadLocalMidi(midiFile.files);
  midiFile.value = ''; // so picking the same files again still fires change
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  loadLocalMidi(e.dataTransfer.files);
});

// One file plays as-is (its tracks are the voices); several files merge into
// one piece where each FILE is a voice — mixing unrelated songs is on you.
async function loadLocalMidi(fileList) {
  const picked = [...(fileList || [])].filter((f) => /\.(mid|midi|kar)$/i.test(f.name));
  if (!picked.length) return;
  const files = await Promise.all(picked.map(async (f) => ({ buf: await f.arrayBuffer(), name: f.name })));
  playlist = [{
    label: picked.length === 1 ? picked[0].name : `${picked.length} MIDI files`,
    load: async () => buildPieceFromMidiSet(files),
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
      viz.setTargets(gate ? gate.midis : null);
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
