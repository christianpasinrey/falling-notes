// The player: owns the playlist, starts and stops pieces, drives the frame
// loop, and binds transport controls and keyboard shortcuts.

import { PianoSynth } from './synth.js';
import { Sequencer } from './sequencer.js';
import { app, isPlaying } from './app.js';
import { setupRound, teardownPlay, refreshKeyLabels, playFrame } from './playmode.js';
import { prepareVoices, hideVoicesPanel, playerVoice, mutedVoices } from './voices.js';
import { applyRhythm, getRate } from './rhythm.js';

const overlay = document.getElementById('overlay');
const captionTitle = document.getElementById('caption-title');

// A playlist is what prev/next/autoplay walk through: the featured nine, a
// slice of the Mutopia library, or the user's own files.
let playlist = [];
let currentIndex = -1;
let startToken = 0;

/** Play `list` starting at `index`; the library module calls this. */
export function play(list, index) {
  playlist = list;
  start(index);
}

export function initPlayer() {
  app.restart = () => start(currentIndex);

  document.getElementById('btn-prev').addEventListener('click', () => start(currentIndex - 1));
  document.getElementById('btn-next').addEventListener('click', () => start(currentIndex + 1));
  document.getElementById('btn-play').addEventListener('click', togglePause);

  window.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('hidden')) return; // menu: the library handles its own keys
    if (e.code === 'Space') {
      e.preventDefault();
      togglePause();
    } else if ((e.key === 'r' || e.key === 'R') && e.target === document.body && app.mode === 'listen' && !app.piece?.playground) {
      start(currentIndex); // when keys are live, R is a note (F), not restart
    } else if (e.key === 'ArrowRight') {
      start(currentIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      start(currentIndex - 1);
    } else if (e.key === 'Escape') {
      backToMenu();
    }
  });

  requestAnimationFrame(frame);
}

async function start(index) {
  if (!playlist.length) return;
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
  app.onPieceEnd?.(); // leaving whatever was on (recording cleanup etc.)

  // the speed control scales the whole clock — audio, visuals and judging
  // all derive from bpm, so one scaled copy adjusts everything coherently
  const rate = getRate();
  if (rate !== 1) piece = { ...piece, bpm: piece.bpm * rate };

  prepareVoices(piece);

  // A fresh context every run keeps restart trivial and leak-free.
  if (app.synth) app.synth.ctx.close();
  app.synth = new PianoSynth();
  app.seq = new Sequencer(app.synth, piece, {
    playerVoice: app.mode === 'listen' ? null : playerVoice,
    muted: mutedVoices,
  });
  app.seq.onended = () => start(currentIndex + 1); // autoplay: on to the next
  applyRhythm(app.seq);
  app.viz.setPiece(piece);
  setPaused(false);
  setupRound(playerVoice);

  document.documentElement.style.setProperty('--accent', piece.accent);
  document.documentElement.style.setProperty('--hand-r', piece.colors.R.body);
  document.documentElement.style.setProperty('--hand-l', piece.colors.L.body);
  captionTitle.textContent = `${piece.title} — ${piece.composer.split('·')[0].trim()}`;

  app.synth.resume().then(() => {
    if (token !== startToken) return;
    app.seq.start();
    overlay.classList.add('hidden');
    document.body.classList.add('playing');
    refreshKeyLabels();
    app.onPieceStart?.(piece);
  });
}

function backToMenu() {
  startToken++;
  app.onPieceEnd?.();
  app.seq?.stop();
  if (app.synth) app.synth.ctx.close();
  app.synth = null;
  app.seq = null;
  teardownPlay();
  hideVoicesPanel();
  setPaused(false);
  document.body.classList.remove('playing');
  overlay.classList.remove('hidden');
}

function setPaused(value) {
  app.paused = value;
  document.body.classList.toggle('paused', value);
  if (app.synth) (value ? app.synth.suspend() : app.synth.resume());
}

function togglePause() {
  if (app.synth && app.seq) setPaused(!app.paused);
}

function frame() {
  playFrame();
  const seq = app.seq;
  const t = seq ? seq.songTime : -4;
  app.viz.render(t, seq && t > 0 ? t / seq.totalSeconds : 0);
  requestAnimationFrame(frame);
}
