// Playground: free play with no falling notes — pick a groove and a tempo,
// play whatever you feel, record it, download the audio, and share it as a
// link that opens as a playable piece for anyone.

import { app } from './app.js';
import { play } from './player.js';
import { encodeRecording } from './recording.js';

const pgBar = document.getElementById('pg-bar');
const recBtn = document.getElementById('pg-record');
const stopBtn = document.getElementById('pg-stop');
const downloadLink = document.getElementById('pg-download');
const shareBtn = document.getElementById('pg-share');
const statusEl = document.getElementById('pg-status');

const playgroundItem = {
  label: 'playground',
  load: async () => ({
    id: 'playground',
    playground: true,
    mood: 'free',
    title: 'playground',
    composer: 'you',
    marking: 'free play — record & share',
    duration: '∞',
    bpm: 100, // the drum grid; the speed selector scales it (50–150)
    totalBeats: 8.64e6, // endless for any human session
    deck: 'piano',
    accent: '#6fb7ff',
    colors: {
      R: { core: '#bfe0ff', body: '#5aa9f4', glow: 'rgba(111, 183, 255, 0.55)' },
      L: { core: '#c2f5dd', body: '#2ec98e', glow: 'rgba(69, 220, 162, 0.5)' },
    },
    notes: [],
  }),
};

let recorder = null;
let recStart = 0;
let recNotes = []; // [[midi, startS, durS, 'R', vel]]
const openNotes = new Map(); // midi -> {t, vel}

export function initPlayground() {
  document.getElementById('playground-btn').addEventListener('click', () => play([playgroundItem], 0));

  app.onPieceStart = (piece) => {
    const on = !!piece.playground;
    pgBar.hidden = !on;
    if (on) {
      resetRecordingUI();
      app.onUserNote = handleUserNote;
    }
  };
  app.onPieceEnd = () => {
    if (recorder) stopRecording();
    app.onUserNote = null;
    pgBar.hidden = true;
  };

  recBtn.addEventListener('click', startRecording);
  stopBtn.addEventListener('click', stopRecording);
  shareBtn.addEventListener('click', shareRecording);
}

function handleUserNote(type, midi, vel) {
  if (type === 'on') {
    app.viz.hitBurst(midi, 'good'); // every press sparkles in free play
    if (recorder) openNotes.set(midi, { t: app.synth.now - recStart, vel });
  } else if (recorder) {
    const o = openNotes.get(midi);
    if (!o) return;
    openNotes.delete(midi);
    recNotes.push([midi, o.t, Math.max(app.synth.now - recStart - o.t, 0.05), 'R', o.vel]);
  }
}

function startRecording() {
  if (!app.synth || recorder) return;
  recNotes = [];
  openNotes.clear();
  recStart = app.synth.now;
  recorder = new MediaRecorder(app.synth.captureStream());
  const chunks = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = 'falling-notes-recording.webm';
    downloadLink.hidden = false;
    shareBtn.hidden = recNotes.length === 0;
    statusEl.textContent = recNotes.length
      ? `${recNotes.length} notes recorded`
      : 'nothing played — nothing to share';
    recorder = null;
  };
  recorder.start();
  recBtn.hidden = true;
  stopBtn.hidden = false;
  downloadLink.hidden = true;
  shareBtn.hidden = true;
  statusEl.textContent = '● recording…';
}

function stopRecording() {
  if (!recorder) return;
  const now = app.synth.now - recStart;
  for (const [midi, o] of openNotes) recNotes.push([midi, o.t, Math.max(now - o.t, 0.05), 'R', o.vel]);
  openNotes.clear();
  recorder.stop();
  recBtn.hidden = false;
  stopBtn.hidden = true;
}

async function shareRecording() {
  const payload = await encodeRecording(recNotes);
  const url = `${location.origin}${location.pathname}#r=${payload}`;
  try {
    await navigator.clipboard.writeText(url);
    statusEl.textContent = `link copied — ${url.length.toLocaleString()} chars`;
  } catch {
    statusEl.textContent = url; // clipboard denied: show it for manual copy
  }
}

function resetRecordingUI() {
  recBtn.hidden = false;
  stopBtn.hidden = true;
  downloadLink.hidden = true;
  shareBtn.hidden = true;
  statusEl.textContent = 'play freely — the piano shows what you press';
}
