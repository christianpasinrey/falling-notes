// "Aurora" — an original piece, composed for this page.
// After Satie's dusk and Vivaldi's storm, a dawn: E major, a rocking 6/8,
// arpeggios that climb like first light and a melody that keeps choosing hope.
// Beat unit here is the eighth note (6 per bar).

const N = [];
const add = (midi, start, dur, hand, vel) => N.push([midi, start, dur, hand, vel]);

const MAJ = [0, 7, 12, 16, 19, 16];
const MIN = [0, 7, 12, 15, 19, 15];

/** One bar of left-hand arpeggio: root, fifth, octave, third, fifth, third. */
function arpBar(barBeat, root, shape) {
  shape.forEach((iv, i) => add(root + iv, barBeat + i, 1.15, 'L', i === 0 ? 0.5 : 0.38));
}

/** Melody fragments: arrays of [midi, durEighths, vel?]. Slight legato overlap. */
function melody(barBeat, frags) {
  let at = barBeat;
  for (const [midi, dur, vel = 0.72] of frags) {
    if (midi) add(midi, at, dur * 1.08, 'R', vel);
    at += dur;
  }
}

const E = [40, MAJ], B = [35, MAJ], Csm = [37, MIN], A = [45, MAJ], Gsm = [44, MIN];

let t = 0;
const bar = (chord, frags) => {
  arpBar(t, chord[0], chord[1]);
  if (frags) melody(t, frags);
  t += 6;
};

// — A: a small theme that keeps rising —
function themeA(lastTwoVaried = false) {
  bar(E, [[71, 2], [76, 2], [80, 2]]); // B4 E5 G#5 — first light
  bar(B, [[78, 3], [75, 2], [71, 1]]);
  bar(Csm, [[73, 2], [76, 2], [80, 2]]);
  bar(A, [[81, 3, 0.78], [80, 1], [78, 2]]);
  bar(E, [[80, 2], [76, 2], [71, 2]]);
  bar(B, [[71, 2], [73, 2], [75, 2]]);
  if (lastTwoVaried) {
    bar(A, [[81, 2, 0.78], [80, 2], [78, 2]]);
    bar(B, [[75, 3], [76, 3, 0.78]]);
  } else {
    bar(A, [[76, 4], [73, 2]]);
    bar(B, [[71, 6]]);
  }
}

// — B: the same heart, higher —
function themeB() {
  bar(A, [[73, 2], [76, 2], [81, 2]]);
  bar(B, [[78, 4], [75, 2]]);
  bar(Gsm, [[80, 2, 0.78], [83, 2, 0.78], [78, 2]]);
  bar(Csm, [[80, 3, 0.78], [76, 3]]);
  bar(A, [[78, 2], [76, 2], [73, 2]]);
  bar(B, [[75, 4], [71, 2]]);
  bar(E, [[76, 6]]);
  bar(E, [[null, 3], [83, 3, 0.45]]); // a high shimmer answers
}

function coda() {
  // the accompaniment itself becomes the melody, climbing
  [40, 47, 52, 56, 59, 64].forEach((p, i) => add(p, t + i, 1.2, 'L', 0.5));
  melody(t, [[80, 3, 0.55], [83, 3, 0.5]]);
  t += 6;
  add(40, t, 6, 'L', 0.5);
  add(47, t, 6, 'L', 0.4);
  add(64, t, 6, 'R', 0.5);
  add(76, t, 6, 'R', 0.65);
  t += 6;
}

themeA();
themeB();
themeA(true);
coda();

export const aurora = {
  id: 'aurora',
  mood: 'dawn',
  title: 'Aurora',
  composer: 'Claude · 2026',
  marking: 'Calme, comme une promesse',
  duration: '0:56',
  bpm: 168, // eighth notes
  colors: {
    R: { core: '#ffeebf', body: '#ffcf6e', glow: 'rgba(255, 214, 130, 0.55)' },
    L: { core: '#e2d2ff', body: '#9d7bf4', glow: 'rgba(166, 134, 255, 0.5)' },
  },
  accent: '#ffd479',
  notes: N,
  totalBeats: t,
};
