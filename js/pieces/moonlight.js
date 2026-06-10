import { NOTES, TOTAL_BEATS } from './moonlight.data.js';

export const moonlight = {
  id: 'moonlight',
  mood: 'night',
  title: 'Moonlight Sonata · I',
  composer: 'L. v. Beethoven · 1801',
  marking: 'Adagio sostenuto, Op. 27 № 2',
  duration: '4:36',
  bpm: 60, // one beat = one second (timing baked from the MIDI tempo map)
  colors: {
    R: { core: '#dbe4ff', body: '#7d96e8', glow: 'rgba(141, 162, 240, 0.55)' },
    L: { core: '#cfd8e8', body: '#54688f', glow: 'rgba(110, 132, 175, 0.5)' },
  },
  accent: '#8da2f0',
  notes: NOTES,
  totalBeats: TOTAL_BEATS,
};
