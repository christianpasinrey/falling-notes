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
  const piece = buildPieceFromMidi(buf, {
    id: 'mutopia-' + item.file,
    idSeed: item.entry.id,
    title: item.label,
    composer: item.entry.composer,
    mood: (item.entry.style || 'classical').toLowerCase(),
    marking: item.entry.instruments + (item.entry.license !== 'Public Domain' ? ` · ${shortLicense(item.entry.license)}` : ''),
    instruments: item.entry.instruments,
  });
  pieceCache.set(key, piece);
  if (pieceCache.size > 24) pieceCache.delete(pieceCache.keys().next().value);
  return piece;
}

/**
 * Several local MIDI files become ONE piece: each file is a voice, aligned at
 * t=0, so a split-track song (or any mix the user dares) plays as a whole and
 * the voices panel can mute each file or hand it to the player.
 */
export function buildPieceFromMidiSet(files /* [{buf, name}] */) {
  const clean = (n) => n.replace(/\.(mid|midi|kar)$/i, '').replace(/[_-]+/g, ' ').trim();
  if (files.length === 1)
    return buildPieceFromMidi(files[0].buf, {
      idSeed: seedFrom(files[0].name),
      title: clean(files[0].name),
      composer: 'your file',
      mood: 'yours',
    });

  const allNotes = [];
  const voices = [];
  const famCount = { piano: 0, strings: 0, wind: 0 };
  let duration = 0;
  files.forEach((f, vi) => {
    const { notes, duration: d, tracks } = parseMidi(f.buf);
    const named = tracks.find((t) => t.name);
    const program = tracks.find((t) => t.program >= 0)?.program ?? -1;
    const patch = classifyPatch(named?.name, program, '');
    voices.push({ name: clean(f.name), patch });
    const hand = vi % 2 === 0 ? 'R' : 'L';
    for (const n of notes) allNotes.push([n.midi, n.start, n.dur, hand, n.vel, patch, vi]);
    if (patch === 'pluck' || patch === 'bow') famCount.strings += notes.length;
    else if (patch === 'wind' || patch === 'voice') famCount.wind += notes.length;
    else famCount.piano += notes.length;
    duration = Math.max(duration, d);
  });
  allNotes.sort((a, b) => a[1] - b[1]);

  const title = files.length === 2
    ? files.map((f) => clean(f.name)).join(' + ')
    : `${clean(files[0].name)} + ${files.length - 1} more`;
  const hue = (files.reduce((a, f) => a + seedFrom(f.name), 0) * 137.508) % 360;
  const hue2 = (hue + 150) % 360;
  return {
    id: 'midi-set-' + files.map((f) => f.name).join('|'),
    mood: 'yours',
    title,
    composer: `${files.length} files, one piece`,
    marking: voices.map((v) => v.name).join(' · '),
    duration: fmtDur(duration),
    bpm: 60,
    colors: {
      R: { core: `hsl(${hue}, 75%, 82%)`, body: `hsl(${hue}, 70%, 62%)`, glow: `hsla(${hue}, 80%, 65%, 0.55)` },
      L: { core: `hsl(${hue2}, 65%, 80%)`, body: `hsl(${hue2}, 60%, 58%)`, glow: `hsla(${hue2}, 70%, 60%, 0.5)` },
    },
    accent: `hsl(${hue}, 75%, 68%)`,
    deck: Object.entries(famCount).sort((a, b) => b[1] - a[1])[0][0],
    voices,
    notes: allNotes,
    totalBeats: duration,
  };
}

const seedFrom = (name) => [...name].reduce((a, c) => a + c.charCodeAt(0), 0);

/** Turn any Standard MIDI File into a playable piece — catalog entries and
 *  user-supplied local files alike. Nothing ever leaves the browser. */
export function buildPieceFromMidi(buf, { id, idSeed = 0, title = 'untitled', composer = '', mood = 'midi', marking = '', instruments = '' } = {}) {
  const { notes, duration, tracks } = parseMidi(buf);

  // voice each track; first two note-bearing tracks get the R/L color pair
  const noteTracks = tracks.map((t, i) => ({ ...t, i })).filter((t) => t.noteCount > 0);
  const handByTrack = {}, patchByTrack = {}, voiceByTrack = {};
  noteTracks.forEach((t, rank) => {
    handByTrack[t.i] = rank % 2 === 0 ? 'R' : 'L';
    patchByTrack[t.i] = classifyPatch(t.name, t.program, instruments);
    voiceByTrack[t.i] = rank;
  });
  const voices = noteTracks.map((t, rank) => ({
    name: (t.name || '').trim() || `voice ${rank + 1}`,
    patch: patchByTrack[t.i],
  }));

  // pick the visual deck from the dominant instrument family
  const famCount = { piano: 0, strings: 0, wind: 0 };
  for (const n of notes) {
    const p = patchByTrack[n.track] || 'piano';
    if (p === 'pluck' || p === 'bow') famCount.strings++;
    else if (p === 'wind' || p === 'voice') famCount.wind++;
    else famCount.piano++;
  }
  const deck = Object.entries(famCount).sort((a, b) => b[1] - a[1])[0][0];

  const hue = (idSeed * 137.508) % 360;
  const hue2 = (hue + 150) % 360;
  return {
    id: id || 'midi-' + title,
    mood,
    title,
    composer,
    marking,
    duration: fmtDur(duration),
    bpm: 60, // beat = second; timing resolved through the MIDI tempo map
    colors: {
      R: { core: `hsl(${hue}, 75%, 82%)`, body: `hsl(${hue}, 70%, 62%)`, glow: `hsla(${hue}, 80%, 65%, 0.55)` },
      L: { core: `hsl(${hue2}, 65%, 80%)`, body: `hsl(${hue2}, 60%, 58%)`, glow: `hsla(${hue2}, 70%, 60%, 0.5)` },
    },
    accent: `hsl(${hue}, 75%, 68%)`,
    deck,
    voices,
    notes: notes.map((n) => [n.midi, n.start, n.dur, handByTrack[n.track] || 'L', n.vel, patchByTrack[n.track] || 'piano', voiceByTrack[n.track] ?? 0]),
    totalBeats: duration,
  };
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
