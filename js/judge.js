// Scores live playing against the written score. Each expected note can be
// hit once inside a timing window around its written start; notes whose
// window closes unplayed become misses.

const WINDOW_S = 0.18; // hit window, either side of the written start
const PERFECT_S = 0.07;

export class Judge {
  /** notes: [{midi, start}] in seconds, sorted by start. */
  constructor(notes, { fold = false } = {}) {
    this.notes = notes.map((n) => ({ midi: n.midi, start: n.start, hit: false }));
    // fold: match by pitch class only — a QWERTY keyboard can't reach the
    // real octaves, so any C counts for any C.
    this.fold = fold;
    this.sweep = 0; // everything before this index has been judged
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, good: 0, miss: 0, extra: 0 };
  }

  /** A key went down at song-time t. Returns 'perfect' | 'good' | 'extra'. */
  noteOn(midi, t) {
    let best = null;
    let bestDt = Infinity;
    for (let i = this.sweep; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.start > t + WINDOW_S) break;
      if (n.hit) continue;
      if (this.fold ? n.midi % 12 !== midi % 12 : n.midi !== midi) continue;
      const dt = Math.abs(n.start - t);
      if (dt < bestDt) {
        best = n;
        bestDt = dt;
      }
    }
    if (!best || bestDt > WINDOW_S) {
      this.counts.extra++;
      this.combo = 0;
      return 'extra';
    }
    best.hit = true;
    const judgement = bestDt <= PERFECT_S ? 'perfect' : 'good';
    this.counts[judgement]++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += (judgement === 'perfect' ? 300 : 100) * (1 + Math.min(this.combo, 50) * 0.02);
    return judgement;
  }

  /** Advance the miss-sweep to song-time t; returns notes newly missed. */
  update(t) {
    let missed = 0;
    while (this.sweep < this.notes.length && this.notes[this.sweep].start < t - WINDOW_S) {
      if (!this.notes[this.sweep].hit) {
        missed++;
        this.counts.miss++;
      }
      this.sweep++;
    }
    if (missed) this.combo = 0;
    return missed;
  }

  /**
   * Practice gate: the earliest unhit note, plus every unhit note struck
   * within the same 50ms (a chord). Null once the piece is fully played.
   */
  nextGate() {
    for (let i = this.sweep; i < this.notes.length; i++) {
      if (this.notes[i].hit) continue;
      const start = this.notes[i].start;
      const midis = [];
      for (let j = i; j < this.notes.length && this.notes[j].start - start < 0.05; j++)
        if (!this.notes[j].hit) midis.push(this.notes[j].midi);
      return { start, midis };
    }
    return null;
  }

  /** 0..1 share of judged notes that were hit. */
  get accuracy() {
    const judged = this.counts.perfect + this.counts.good + this.counts.miss;
    return judged ? (this.counts.perfect + this.counts.good) / judged : 1;
  }
}
