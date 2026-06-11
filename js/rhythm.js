// Rhythm companions: the metronome, the drum grooves with their kits, and
// the playback-speed selector. All persist across sessions.

import { app, isPlaying } from './app.js';

const beatSelect = document.getElementById('beat-select');
const kitSelect = document.getElementById('kit-select');
const rateSelect = document.getElementById('rate-select');
const metroBtn = document.getElementById('btn-metronome');

let beat = '';
let kit = 'acoustic';
let rate = 1;
let metronome = false;

export const getRate = () => rate;

export function initRhythm() {
  beat = localStorage.getItem('fn-beat') || '';
  if ([...beatSelect.options].some((o) => o.value === beat)) beatSelect.value = beat;
  else beat = '';
  kit = localStorage.getItem('fn-kit') ?? 'acoustic';
  if ([...kitSelect.options].some((o) => o.value === kit)) kitSelect.value = kit;
  else kit = 'acoustic';
  rate = parseFloat(localStorage.getItem('fn-rate')) || 1;
  if ([...rateSelect.options].some((o) => parseFloat(o.value) === rate)) rateSelect.value = String(rate);
  else rate = 1;
  metronome = localStorage.getItem('fn-metronome') === '1';

  beatSelect.classList.toggle('on', !!beat);
  kitSelect.hidden = !beat;
  rateSelect.classList.toggle('on', rate !== 1);
  metroBtn.classList.toggle('on', metronome);

  beatSelect.addEventListener('change', () => {
    beat = beatSelect.value;
    localStorage.setItem('fn-beat', beat);
    beatSelect.classList.toggle('on', !!beat);
    kitSelect.hidden = !beat;
    app.seq?.setDrums(beat || null);
  });
  kitSelect.addEventListener('change', () => {
    kit = kitSelect.value;
    localStorage.setItem('fn-kit', kit);
    if (app.seq) app.seq.drumKit = kit || null;
  });
  rateSelect.addEventListener('change', () => {
    rate = parseFloat(rateSelect.value);
    localStorage.setItem('fn-rate', String(rate));
    rateSelect.classList.toggle('on', rate !== 1);
    if (app.seq && isPlaying()) app.restart(); // the whole clock derives from bpm
  });
  metroBtn.addEventListener('click', () => {
    metronome = !metronome;
    localStorage.setItem('fn-metronome', metronome ? '1' : '0');
    metroBtn.classList.toggle('on', metronome);
    app.seq?.setMetronome(metronome);
  });
}

/** Per piece start: hand the sequencer its rhythm settings. */
export function applyRhythm(seq) {
  seq.setMetronome(metronome);
  seq.setDrums(beat || null);
  seq.drumKit = kit || null;
  updateBeatRecommendations(seq);
}

// Star the grooves that musically fit the piece's *effective* tempo (its
// real beat length × the chosen speed); waltz is keyed to 3/4 instead.
function updateBeatRecommendations(seq) {
  const iv = [];
  for (let i = 1; i < Math.min(seq.beats.length, 65); i++)
    iv.push((seq.beats[i] - seq.beats[i - 1]) * seq.spb);
  iv.sort((a, b) => a - b);
  const bpm = iv.length ? 60 / Math.max(iv[Math.floor(iv.length / 2)], 0.05) : 100;
  const rec = new Set();
  if (seq.beatsPerBar === 3) rec.add('waltz');
  if (bpm < 85) rec.add('bossa');
  if (bpm >= 70 && bpm <= 120) rec.add('pop');
  if (bpm >= 95 && bpm <= 150) rec.add('rock');
  if (bpm >= 110) rec.add('funk');
  for (const o of beatSelect.options) {
    if (!o.value) continue;
    o.textContent = o.value + (rec.has(o.value) ? ' ★' : '');
  }
}
