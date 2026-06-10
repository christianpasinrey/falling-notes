import { NOTES, TOTAL_BEATS } from './clairdelune.data.js';

export const clairdelune = {
  id: 'clairdelune',
  mood: 'moonlight',
  title: 'Clair de Lune',
  composer: 'Claude Debussy · 1905',
  marking: 'Suite bergamasque, III',
  duration: '5:23',
  bpm: 60, // one beat = one second (timing baked from the MIDI tempo map)
  colors: {
    R: { core: '#f0f3ff', body: '#a9b8e8', glow: 'rgba(196, 208, 255, 0.55)' },
    L: { core: '#e4d6f4', body: '#9a6fd4', glow: 'rgba(168, 122, 232, 0.5)' },
  },
  accent: '#c4d0ff',
  notes: NOTES,
  totalBeats: TOTAL_BEATS,
};
