// Play-it-yourself and practice: live input (USB MIDI or QWERTY), judging,
// the centre HUD, and the listen/play/practice mode selector.

import { NoteInput } from './input.js';
import { Judge } from './judge.js';
import { noteVoice } from './sequencer.js';
import { app, isPlaying, noteName } from './app.js';

export const input = new NoteInput();
export const liveInput = new Map(); // midi -> {vel}, shared with the visualizer

const playhud = document.getElementById('playhud');
const hudJudge = document.getElementById('hud-judge');
const hudScore = document.getElementById('hud-score');
const hudCombo = document.getElementById('hud-combo');
const modeHint = document.getElementById('mode-hint');
const modeButtons = document.querySelectorAll('[data-mode]');

const MODE_HINTS = {
  listen: 'sit back — the piano plays itself',
  play: 'the piece falls silent and you play it, scored',
  practice: 'the piece waits for the correct key before moving on',
};

export function initPlayMode() {
  let stored = localStorage.getItem('fn-mode');
  if (!['listen', 'play', 'practice'].includes(stored)) stored = 'listen';
  for (const btn of modeButtons)
    btn.addEventListener('click', () => setMode(btn.dataset.mode, { restart: true }));
  setMode(stored);

  input.onnoteon = (midi, vel) => {
    if (!app.synth || app.paused) return;
    app.synth.noteOn(midi, vel);
    liveInput.set(midi, { vel });
    if (app.judge && app.seq) {
      const result = app.judge.noteOn(midi, app.seq.songTime);
      showJudgement(result);
      if (result === 'perfect' || result === 'good') app.viz.hitBurst(midi, result);
    }
  };
  input.onnoteoff = (midi) => {
    app.synth?.noteOff(midi);
    liveInput.delete(midi);
  };
  input.onpedal = (down) => app.synth?.setPedal(down);
  input.onchange = updateInputStatus;
}

export function setMode(m, { restart = false } = {}) {
  app.mode = m;
  localStorage.setItem('fn-mode', m);
  for (const btn of modeButtons) {
    const on = btn.dataset.mode === m;
    btn.classList.toggle('on', on);
    if (btn.getAttribute('role') === 'radio') btn.setAttribute('aria-checked', String(on));
  }
  if (m !== 'listen') input.enableMidi().then(updateInputStatus);
  updateModeHint();
  if (restart && app.seq && isPlaying()) app.restart();
}

function updateModeHint() {
  let text = MODE_HINTS[app.mode];
  if (app.mode !== 'listen')
    text += input.midiName ? ` · MIDI: ${input.midiName}` : ' · computer keys, labelled on the piano';
  modeHint.textContent = text;
}

function updateInputStatus() {
  if (app.judge) app.judge.fold = input.source === 'keyboard';
  updateModeHint();
  refreshKeyLabels();
}

export function refreshKeyLabels() {
  app.viz.setKeyLabels(
    app.mode !== 'listen' && isPlaying() && input.source === 'keyboard' ? input.labelMap() : null
  );
}

/** Per piece start, once app.seq exists: build (or drop) the judging round. */
export function setupRound(playerVoice) {
  liveInput.clear();
  shownGate = '';
  app.viz.setTargets(null);
  if (app.mode !== 'listen') {
    // you are judged on (and octave-fitted to) the voice you chose to play
    const mine = app.seq.notes.filter((n) => playerVoice === 'all' || noteVoice(n) === playerVoice);
    app.judge = new Judge(
      mine.map(([midi, beat]) => ({ midi, start: beat * app.seq.spb })),
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
    app.judge = null;
    input.detach();
    playhud.hidden = true;
  }
}

/** Back to the menu: release input and clear every play-mode artefact. */
export function teardownPlay() {
  app.judge = null;
  input.detach();
  liveInput.clear();
  app.viz.setKeyLabels(null);
  app.viz.setTargets(null);
  playhud.hidden = true;
}

/** Per animation frame: the practice gate and the miss sweep. */
export function playFrame() {
  if (!app.judge || !app.seq || app.paused) return;
  if (app.mode === 'practice') {
    // hold the piece at the next unplayed note (or chord) until it lands
    const gate = app.judge.nextGate();
    app.viz.setTargets(gate ? gate.midis : null);
    if (gate && app.seq.songTime > gate.start) {
      app.seq.holdAt(gate.start);
      showWaiting(gate);
    }
  }
  if (app.judge.update(app.seq.songTime)) showJudgement('miss');
}

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
  hudScore.textContent = String(Math.round(app.judge.score));
  const combo = app.judge.combo > 1 ? `×${app.judge.combo}` : '';
  if (combo && combo !== hudCombo.textContent)
    hudCombo.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  hudCombo.textContent = combo;
}
