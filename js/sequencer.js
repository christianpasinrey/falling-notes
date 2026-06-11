// Look-ahead scheduler: walks a piece's score and hands notes to the synth
// slightly early, keeping sample-accurate timing on the AudioContext clock.

const LOOKAHEAD_S = 0.15;
const TICK_MS = 25;
const LEAD_IN_S = 2.4; // silence before the first note so bars fall into view

export class Sequencer {
  constructor(synth, piece, { silent = false } = {}) {
    this.synth = synth;
    this.piece = piece;
    this.silent = silent; // play-mode: the clock and visuals run, the user supplies the sound
    // The look-ahead walk requires chronological order; piece data may be
    // authored voice-by-voice, so never assume it.
    this.notes = [...piece.notes].sort((a, b) => a[1] - b[1]);
    this.spb = 60 / piece.bpm; // seconds per beat
    this.totalSeconds = piece.totalBeats * this.spb;
    this.startCtxTime = 0;
    this.nextIndex = 0;
    this.timer = null;
    this.onended = null;
  }

  /** Song-position in seconds; negative during the lead-in. */
  get songTime() {
    return this.synth.now - this.startCtxTime - LEAD_IN_S;
  }

  start() {
    this.startCtxTime = this.synth.now;
    this.nextIndex = 0;
    this.#run();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Practice mode: pin song-time at t by sliding the clock origin forward. */
  holdAt(t) {
    this.startCtxTime += this.songTime - t;
  }

  #run() {
    const notes = this.notes;
    this.timer = setInterval(() => {
      const horizon = this.songTime + LOOKAHEAD_S;
      while (this.nextIndex < notes.length) {
        const [midi, startBeat, durBeats, , vel, patch] = notes[this.nextIndex];
        const startS = startBeat * this.spb;
        if (startS > horizon) break;
        const when = this.startCtxTime + LEAD_IN_S + startS;
        if (!this.silent) this.synth.playNote(midi, when, durBeats * this.spb, vel, patch || 'piano');
        this.nextIndex++;
      }
      if (this.nextIndex >= notes.length && this.songTime > this.totalSeconds + 3) {
        this.stop();
        this.onended?.();
      }
    }, TICK_MS);
  }
}
