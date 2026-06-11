// Playground: free play with no falling notes — pick a groove and a tempo,
// play whatever you feel, record it, download the audio, and share it as a
// link that opens as a playable piece for anyone.

import { app } from './app.js';
import { play } from './player.js';
import { encodeRecording, encodeWavBlob } from './recording.js';

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

let recording = false;
let recStart = 0;
let recNotes = []; // [[midi, startS, durS, 'R', vel]]
const openNotes = new Map(); // midi -> {t, vel}
let proc = null; // ScriptProcessor tapping raw PCM off the mix
let muteNode = null;
let pcmL = [], pcmR = [];

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
    if (recording) stopRecording();
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
    // playing is the mirror of listening: the note is born on the key and
    // departs toward the horizon while you hold it
    app.viz.liveTrailStart?.(midi, vel);
    if (recording) openNotes.set(midi, { t: app.synth.now - recStart, vel });
  } else {
    app.viz.liveTrailEnd?.(midi);
    if (!recording) return;
    const o = openNotes.get(midi);
    if (!o) return;
    openNotes.delete(midi);
    recNotes.push([midi, o.t, Math.max(app.synth.now - recStart - o.t, 0.05), 'R', o.vel]);
  }
}

function startRecording() {
  if (!app.synth || recording) return;
  recording = true;
  recNotes = [];
  openNotes.clear();
  pcmL = [];
  pcmR = [];
  recStart = app.synth.now;

  // tap raw PCM off the full mix; WAV needs no encoder and opens anywhere
  const ctx = app.synth.ctx;
  proc = ctx.createScriptProcessor(4096, 2, 2);
  app.synth.comp.connect(proc);
  muteNode = ctx.createGain();
  muteNode.gain.value = 0; // the processor must reach the destination to run
  proc.connect(muteNode);
  muteNode.connect(ctx.destination);
  proc.onaudioprocess = (e) => {
    pcmL.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    pcmR.push(new Float32Array(e.inputBuffer.getChannelData(1)));
  };

  recBtn.hidden = true;
  stopBtn.hidden = false;
  downloadLink.hidden = true;
  shareBtn.hidden = true;
  statusEl.textContent = '● recording…';
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  const now = app.synth.now - recStart;
  for (const [midi, o] of openNotes) recNotes.push([midi, o.t, Math.max(now - o.t, 0.05), 'R', o.vel]);
  openNotes.clear();

  proc.onaudioprocess = null;
  app.synth.comp.disconnect(proc);
  proc.disconnect();
  muteNode.disconnect();
  proc = muteNode = null;

  const blob = encodeWavBlob(pcmL, pcmR, app.synth.ctx.sampleRate);
  pcmL = pcmR = [];
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = 'falling-notes-recording.wav';
  downloadLink.hidden = false;
  shareBtn.hidden = recNotes.length === 0;
  statusEl.textContent = recNotes.length
    ? `${recNotes.length} notes recorded`
    : 'nothing played — nothing to share';
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
