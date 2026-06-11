// Shared mutable state. Feature modules read and write through this single
// object — and main.js wires it up — instead of importing each other in
// cycles. Anything here is "what is happening right now".
export const app = {
  viz: null, // the active renderer (3D or 2D fallback)
  synth: null, // per-piece PianoSynth; null in the menu
  seq: null, // per-piece Sequencer; null in the menu
  judge: null, // scoring, only outside listen mode
  piece: null, // the piece as played (speed-scaled copy when rate ≠ 1)
  mode: 'listen', // 'listen' | 'play' | 'practice'
  paused: false,
  restart: () => {}, // re-runs the current piece; wired by player.js
};

export const isPlaying = () => document.body.classList.contains('playing');

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
