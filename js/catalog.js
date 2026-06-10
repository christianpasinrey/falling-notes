// The full Mutopia library: loads the crawled catalog, expands multi-movement
// collections, and turns any MIDI engraving into a playable piece on demand.

import { parseMidi } from './midi.js';

let catalogPromise = null;
const pieceCache = new Map();

export function loadCatalog() {
  catalogPromise ||= Promise.all([
    fetch('assets/catalog.json').then((r) => r.json()),
    fetch('assets/files.json').then((r) => r.json()),
  ]).then(([entries, files]) => {
    const items = [];
    for (const entry of entries) {
      const fs = files[entry.id];
      if (!fs?.length) continue;
      fs.forEach((file, i) => {
        items.push({
          entry,
          file,
          movement: fs.length > 1 ? i + 1 : 0,
          label: entry.title + (fs.length > 1 ? ` · ${roman(i + 1)}` : ''),
        });
      });
    }
    return { entries, items };
  });
  return catalogPromise;
}

export async function loadCatalogPiece(item) {
  const key = item.file;
  if (pieceCache.has(key)) return pieceCache.get(key);

  const buf = await fetch('assets/midi/' + item.file).then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.arrayBuffer();
  });
  const { notes, duration, tracks } = parseMidi(buf);

  // voice each track; first two note-bearing tracks get the R/L color pair
  const noteTracks = tracks.map((t, i) => ({ ...t, i })).filter((t) => t.noteCount > 0);
  const handByTrack = {}, patchByTrack = {};
  noteTracks.forEach((t, rank) => {
    handByTrack[t.i] = rank % 2 === 0 ? 'R' : 'L';
    patchByTrack[t.i] = classifyPatch(t.name, t.program, item.entry.instruments);
  });

  // pick the visual deck from the dominant instrument family
  const famCount = { piano: 0, strings: 0, wind: 0 };
  for (const n of notes) {
    const p = patchByTrack[n.track] || 'piano';
    if (p === 'pluck' || p === 'bow') famCount.strings++;
    else if (p === 'wind' || p === 'voice') famCount.wind++;
    else famCount.piano++;
  }
  const deck = Object.entries(famCount).sort((a, b) => b[1] - a[1])[0][0];

  const hue = (item.entry.id * 137.508) % 360;
  const hue2 = (hue + 150) % 360;
  const piece = {
    id: 'mutopia-' + item.file,
    mood: (item.entry.style || 'classical').toLowerCase(),
    title: item.label,
    composer: `${item.entry.composer}`,
    marking: item.entry.instruments + (item.entry.license !== 'Public Domain' ? ` · ${shortLicense(item.entry.license)}` : ''),
    duration: fmtDur(duration),
    bpm: 60, // beat = second; timing resolved through the MIDI tempo map
    colors: {
      R: { core: `hsl(${hue}, 75%, 82%)`, body: `hsl(${hue}, 70%, 62%)`, glow: `hsla(${hue}, 80%, 65%, 0.55)` },
      L: { core: `hsl(${hue2}, 65%, 80%)`, body: `hsl(${hue2}, 60%, 58%)`, glow: `hsla(${hue2}, 70%, 60%, 0.5)` },
    },
    accent: `hsl(${hue}, 75%, 68%)`,
    deck,
    notes: notes.map((n) => [n.midi, n.start, n.dur, handByTrack[n.track] || 'L', n.vel, patchByTrack[n.track] || 'piano']),
    totalBeats: duration,
  };
  pieceCache.set(key, piece);
  if (pieceCache.size > 24) pieceCache.delete(pieceCache.keys().next().value);
  return piece;
}

const PATCH_KEYWORDS = [
  ['organ|harmonium', 'organ'],
  ['harpsichord|cembalo|clavecin|clavi', 'pluck'],
  ['piano|pianoforte|keyboard', 'piano'],
  ['guitar|guitarra|lute|theorbo|vihuela|mandolin|harp|zither|banjo|ukulele', 'pluck'],
  ['violin|viola|cello|violoncello|contrabass|double bass|fiddle|strings|string quartet', 'bow'],
  ['flute|flauto|recorder|piccolo|oboe|clarinet|bassoon|fagott|horn|trumpet|trombone|tuba|bagpipe|accordion|whistle|wind', 'wind'],
  ['voice|soprano|mezzo|alto|tenor|baritone|bass voice|choir|chorus|vocal|canto|song', 'voice'],
];

function classifyPatch(trackName, program, instruments) {
  const probe = (s) => {
    if (!s) return null;
    const low = s.toLowerCase();
    // \b prefix so "flute" can't match "lute"
    for (const [re, patch] of PATCH_KEYWORDS) if (new RegExp('\\b(?:' + re + ')').test(low)) return patch;
    return null;
  };
  const byName = probe(trackName);
  if (byName) return byName;
  if (program >= 0) {
    if (program <= 5) return 'piano';
    if (program <= 7) return 'pluck'; // harpsichord, clavinet
    if (program <= 15) return 'pluck';
    if (program <= 23) return 'organ';
    if (program <= 31) return 'pluck'; // guitars
    if (program <= 39) return 'pluck'; // basses
    if (program <= 47) return program === 46 ? 'pluck' : 'bow'; // strings, 46 = harp
    if (program <= 51) return 'bow'; // ensembles
    if (program <= 54) return 'voice';
    if (program <= 79) return 'wind'; // brass, reeds, pipes
  }
  return probe(instruments) || 'piano';
}

function shortLicense(l) {
  return l
    .replace('Creative Commons Attribution-ShareAlike', 'CC BY-SA')
    .replace('Creative Commons Attribution', 'CC BY');
}

function fmtDur(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

function roman(n) {
  const R = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return R[n] || String(n);
}
