import { PianoSynth } from './synth.js';
import { Sequencer } from './sequencer.js';
import { PIECES } from './pieces/index.js';

const overlay = document.getElementById('overlay');
const piecesEl = document.getElementById('pieces');
const captionTitle = document.getElementById('caption-title');

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
let currentIndex = -1;

// — build the piece cards —
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
  card.addEventListener('click', () => start(i));
  piecesEl.appendChild(card);
});

function start(index) {
  currentIndex = ((index % PIECES.length) + PIECES.length) % PIECES.length;
  const piece = PIECES[currentIndex];

  // A fresh context every run keeps restart trivial and leak-free.
  if (synth) synth.ctx.close();
  synth = new PianoSynth();
  seq = new Sequencer(synth, piece);
  seq.onended = () => start(currentIndex + 1); // autoplay: on to the next
  viz.setPiece(piece);
  setPaused(false);

  document.documentElement.style.setProperty('--accent', piece.accent);
  document.documentElement.style.setProperty('--hand-r', piece.colors.R.body);
  document.documentElement.style.setProperty('--hand-l', piece.colors.L.body);
  captionTitle.textContent = `${piece.title} — ${piece.composer.split('·')[0].trim()}`;

  synth.resume().then(() => {
    seq.start();
    overlay.classList.add('hidden');
    document.body.classList.add('playing');
  });
}

function backToMenu() {
  seq?.stop();
  if (synth) synth.ctx.close();
  synth = null;
  seq = null;
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

window.addEventListener('keydown', (e) => {
  const inMenu = !overlay.classList.contains('hidden');
  if (inMenu) return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePause();
  } else if (e.key === 'r' || e.key === 'R') {
    start(currentIndex);
  } else if (e.key === 'ArrowRight') {
    start(currentIndex + 1);
  } else if (e.key === 'ArrowLeft') {
    start(currentIndex - 1);
  } else if (e.key === 'Escape') {
    backToMenu();
  }
});

function frame() {
  const t = seq ? seq.songTime : -4;
  viz.render(t, seq && t > 0 ? t / seq.totalSeconds : 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
