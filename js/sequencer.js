// Look-ahead scheduler: walks a piece's score and hands notes to the synth
// slightly early, keeping sample-accurate timing on the AudioContext clock.

const LOOKAHEAD_S = 0.15;
const TICK_MS = 25;
const LEAD_IN_S = 2.4; // silence before the first note so bars fall into view

/** Which voice a note belongs to: element 6 for MIDI-derived pieces,
 *  derived from the hand (R=0, L=1) for the hand-authored featured ones. */
export const noteVoice = (n) => n[6] ?? (n[3] === 'L' ? 1 : 0);

// Drum accompaniment formulas: steps are [beat-in-bar, drum, velocity];
// fractions subdivide the beat, so the groove follows tempo changes too.
const K = 'kick', S = 'snare', H = 'hat', O = 'openhat';
export const DRUM_PATTERNS = {
  rock: { bar: 4, steps: [[0, K, 1], [1, S, 0.9], [2, K, 1], [2.5, K, 0.7], [3, S, 0.9],
    [0, H, 0.7], [0.5, H, 0.4], [1, H, 0.6], [1.5, H, 0.4], [2, H, 0.7], [2.5, H, 0.4], [3, H, 0.6], [3.5, H, 0.4]] },
  pop: { bar: 4, steps: [[0, K, 1], [1.5, K, 0.6], [2.5, K, 0.8], [1, S, 0.9], [3, S, 0.9],
    [0, H, 0.6], [0.5, H, 0.35], [1, H, 0.55], [1.5, H, 0.35], [2, H, 0.6], [2.5, H, 0.35], [3, H, 0.55], [3.5, O, 0.4]] },
  funk: { bar: 4, steps: [[0, K, 1], [0.75, K, 0.7], [2.25, K, 0.8], [1, S, 0.95], [3, S, 0.95], [3.75, S, 0.4],
    [0, H, 0.6], [0.5, H, 0.4], [1, H, 0.6], [1.5, H, 0.4], [2, H, 0.6], [2.5, O, 0.5], [3, H, 0.6], [3.5, H, 0.4]] },
  waltz: { bar: 3, steps: [[0, K, 1], [1, H, 0.5], [2, H, 0.5], [1, S, 0.35], [2, S, 0.3]] },
  bossa: { bar: 4, steps: [[0, K, 0.9], [1.5, K, 0.7], [2, K, 0.9], [3.5, K, 0.7], [0.75, S, 0.45], [2.5, S, 0.45],
    [0, H, 0.5], [0.5, H, 0.35], [1, H, 0.5], [1.5, H, 0.35], [2, H, 0.5], [2.5, H, 0.35], [3, H, 0.5], [3.5, H, 0.35]] },
};

export class Sequencer {
  constructor(synth, piece, { playerVoice = null, muted = new Set() } = {}) {
    this.synth = synth;
    this.piece = piece;
    // playerVoice: null = listen (all voices sound), 'all' = the user plays
    // everything, an index = that voice is the user's (silent here) while the
    // others accompany. muted is shared live with the UI.
    this.playerVoice = playerVoice;
    this.muted = muted;
    // metronome: tick on the piece's beat grid (real beats for MIDI pieces
    // via their tempo map; the integer grid for hand-authored ones)
    this.metronome = false;
    this.drums = null;
    this.beats = piece.beatTimes || Array.from({ length: Math.ceil(piece.totalBeats) + 1 }, (_, i) => i);
    this.beatsPerBar = piece.beatsPerBar || 0;
    this.beatIndex = 0;
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

  setMetronome(on) {
    const wasWalking = this.metronome || !!this.drums;
    this.metronome = on;
    if (!wasWalking && on) this.#syncBeats();
  }

  /** Drum accompaniment: a DRUM_PATTERNS key, or null for silence. */
  setDrums(name) {
    const wasWalking = this.metronome || !!this.drums;
    this.drums = DRUM_PATTERNS[name] || null;
    if (!wasWalking && this.drums) this.#syncBeats();
  }

  #syncBeats() {
    // skip the beats already behind us
    const t = this.songTime;
    let i = 0;
    while (i < this.beats.length && this.beats[i] * this.spb < t) i++;
    this.beatIndex = i;
  }

  #run() {
    const notes = this.notes;
    this.timer = setInterval(() => {
      const horizon = this.songTime + LOOKAHEAD_S;
      while (this.nextIndex < notes.length) {
        const note = notes[this.nextIndex];
        const [midi, startBeat, durBeats, , vel, patch] = note;
        const startS = startBeat * this.spb;
        if (startS > horizon) break;
        const when = this.startCtxTime + LEAD_IN_S + startS;
        const voice = noteVoice(note);
        const silent =
          this.muted.has(voice) || this.playerVoice === 'all' || this.playerVoice === voice;
        if (!silent) this.synth.playNote(midi, when, durBeats * this.spb, vel, patch || 'piano');
        this.nextIndex++;
      }
      if (this.metronome || this.drums) {
        while (this.beatIndex < this.beats.length) {
          const beatS = this.beats[this.beatIndex] * this.spb;
          if (beatS > horizon) break;
          const when = this.startCtxTime + LEAD_IN_S + beatS;
          if (this.metronome)
            this.synth.tick(when, this.beatsPerBar > 1 && this.beatIndex % this.beatsPerBar === 0);
          if (this.drums) {
            // interpolate sub-beat steps to the next beat: rubato-proof groove
            const nextS = this.beatIndex + 1 < this.beats.length
              ? this.beats[this.beatIndex + 1] * this.spb
              : beatS + this.spb;
            const pos = this.beatIndex % this.drums.bar;
            for (const [b, type, vel] of this.drums.steps)
              if (Math.floor(b) === pos) this.synth.drum(type, when + (b - pos) * (nextS - beatS), vel);
          }
          this.beatIndex++;
        }
      }
      if (this.nextIndex >= notes.length && this.songTime > this.totalSeconds + 3) {
        this.stop();
        this.onended?.();
      }
    }, TICK_MS);
  }
}
