import { NOTES, TOTAL_BEATS } from './nocturne.data.js';

export const nocturne = {
  id: 'nocturne',
  mood: 'rêverie',
  title: 'Nocturne Op. 9 № 2',
  composer: 'F. Chopin · 1832',
  marking: 'Andante, in E-flat major',
  duration: '3:22',
  bpm: 60, // one beat = one second (timing baked from the MIDI tempo map)
  colors: {
    R: { core: '#fff0c8', body: '#e8c258', glow: 'rgba(240, 208, 110, 0.55)' },
    L: { core: '#c8e0d8', body: '#4f9c84', glow: 'rgba(95, 170, 145, 0.5)' },
  },
  accent: '#f0d06e',
  notes: NOTES,
  totalBeats: TOTAL_BEATS,
};
