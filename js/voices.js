// The voices panel: mute tracks while listening; in play/practice pick the
// voice that is yours — it goes silent and is the one you are judged on.

import { app } from './app.js';

const voicesPanel = document.getElementById('voices-panel');
const voicesBtn = document.getElementById('btn-voices');

export let playerVoice = 'all'; // 'all' | voice index — live binding for the player
export const mutedVoices = new Set(); // shared live with the sequencer
let lastPieceId = null;

export function initVoices() {
  voicesBtn.addEventListener('click', () => {
    voicesPanel.hidden = !voicesPanel.hidden;
  });
}

/** Per piece start: normalize voices, reset choices on a piece change, render. */
export function prepareVoices(piece) {
  // hand-authored featured pieces have two implicit voices: the hands
  if (!piece.voices) piece.voices = [{ name: 'right hand' }, { name: 'left hand' }];
  app.piece = piece;
  if (piece.id !== lastPieceId) {
    lastPieceId = piece.id;
    playerVoice = 'all';
    mutedVoices.clear();
  }
  voicesBtn.style.display = piece.voices.length > 1 ? '' : 'none';
  if (piece.voices.length < 2) voicesPanel.hidden = true;
  renderVoicesPanel();
}

export function hideVoicesPanel() {
  voicesPanel.hidden = true;
}

function renderVoicesPanel() {
  voicesPanel.replaceChildren();
  if (!app.piece) return;
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
  if (app.mode !== 'listen')
    addRow('🎹 play every voice yourself', { mine: playerVoice === 'all', onPick: () => pickVoice('all') });
  app.piece.voices.forEach((v, i) => {
    const mine = app.mode !== 'listen' && playerVoice === i;
    addRow((mine ? '🎹 ' : '') + v.name, {
      mine,
      muted: mutedVoices.has(i),
      onPick: app.mode === 'listen' ? () => toggleMute(i) : () => pickVoice(i),
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
  app.restart(); // the judge and the silence map depend on it
}
