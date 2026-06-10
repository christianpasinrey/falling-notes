// Antonio Vivaldi — "L'estate" (Summer), III. Presto (1725), the storm.
// Public domain. Piano-roll arrangement made for this page: tremolo descents,
// scale squalls and broken-chord lightning over a driving bass, in G minor.

const N = [];
const add = (midi, start, dur, hand, vel) => N.push([midi, start, dur, hand, vel]);

const S = 0.25; // sixteenth, in beats (3/4 time)

/** One bar of sixteenth-note tremolo on a single pitch. */
function tremoloBar(barBeat, pitch) {
  for (let i = 0; i < 12; i++) add(pitch, barBeat + i * S, S, 'R', i % 4 === 0 ? 0.85 : 0.6);
}

/** One bar of driving eighth-note bass octaves. */
function bassBar(barBeat, root) {
  for (let i = 0; i < 6; i++) add(i % 2 ? root + 12 : root, barBeat + i * 0.5, 0.5, 'L', i % 2 ? 0.55 : 0.8);
}

/** One bar of 12 sixteenths from an explicit pitch list. */
function runBar(barBeat, pitches, vel = 0.72) {
  pitches.forEach((p, i) => add(p, barBeat + i * S, S, 'R', i % 4 === 0 ? vel + 0.12 : vel));
}

let t = 0;

// — tutti: tremolo descending through Gm, F, Eb, D —
function sectionA() {
  const bars = [
    [74, 43], [72, 41], [70, 39], [69, 38],
    [74, 43], [72, 41], [70, 39], [69, 38],
  ];
  for (const [pitch, root] of bars) {
    tremoloBar(t, pitch);
    bassBar(t, root);
    t += 3;
  }
}

// — squalls: scale runs over pedal points —
function sectionB() {
  const downHi = [79, 77, 75, 74, 72, 70, 69, 67, 69, 70, 69, 67];
  const downTop = [82, 81, 79, 77, 75, 74, 72, 70, 72, 74, 72, 70];
  const upLo = [67, 69, 70, 72, 74, 75, 77, 79, 77, 75, 74, 72];
  const upHi = [70, 72, 74, 75, 77, 79, 81, 82, 81, 79, 77, 75];
  for (const run of [downHi, downTop, downHi, downTop]) {
    runBar(t, run);
    bassBar(t, 38); // D pedal
    t += 3;
  }
  for (const run of [upLo, upHi, upLo, upHi]) {
    runBar(t, run);
    bassBar(t, 43); // G pedal
    t += 3;
  }
}

// — solo: broken-chord lightning, thinner air —
function sectionC() {
  const arp = ([a, b, c, d]) => [a, b, c, d, c, b, a, b, c, d, c, b];
  const chords = [
    [[67, 70, 74, 79], 43], // Gm
    [[67, 72, 75, 79], 48], // Cm
    [[66, 69, 72, 74], 50], // D7
    [[67, 70, 74, 79], 43],
  ];
  for (let rep = 0; rep < 2; rep++) {
    for (const [chord, root] of chords) {
      runBar(t, arp(chord), 0.55);
      add(root, t, 1, 'L', 0.7);
      add(root + 12, t + 2, 1, 'L', 0.55);
      t += 3;
    }
  }
}

function coda() {
  runBar(t, [86, 84, 82, 81, 79, 77, 75, 74, 72, 70, 69, 67], 0.8);
  bassBar(t, 43);
  t += 3;
  for (let bar = 0; bar < 3; bar++) {
    for (let beat = 0; beat < 3; beat++) {
      for (const p of [70, 74, 79]) add(p, t + beat, 0.9, 'R', 0.9);
      add(31, t + beat, 0.9, 'L', 0.95);
      add(43, t + beat, 0.9, 'L', 0.8);
    }
    t += 3;
  }
  for (const p of [67, 70, 74, 79]) add(p, t, 3, 'R', 0.9);
  add(31, t, 3, 'L', 0.95);
  add(43, t, 3, 'L', 0.8);
  t += 3;
}

sectionA();
sectionB();
sectionC();
sectionA();
sectionB();
coda();

export const summer = {
  id: 'summer',
  mood: 'storm',
  title: "L'estate · Presto",
  composer: 'Antonio Vivaldi · 1725',
  marking: 'Tempo impetuoso d’estate — arr.',
  duration: '0:51',
  bpm: 160,
  colors: {
    R: { core: '#ffe3a8', body: '#ffb454', glow: 'rgba(255, 180, 84, 0.55)' },
    L: { core: '#ffc9b8', body: '#ef5a3c', glow: 'rgba(255, 105, 71, 0.5)' },
  },
  accent: '#ffb454',
  notes: N,
  totalBeats: t,
};
