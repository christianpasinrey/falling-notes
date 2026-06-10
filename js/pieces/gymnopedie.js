import { NOTES, TOTAL_BEATS } from './gymnopedie.data.js';

export const gymnopedie = {
  id: 'gymnopedie',
  mood: 'dusk',
  title: 'Gymnopédie № 1',
  composer: 'Erik Satie · 1888',
  marking: 'Lent et douloureux',
  duration: '3:33',
  bpm: 66,
  colors: {
    R: { core: '#bfe0ff', body: '#5aa9f4', glow: 'rgba(111, 183, 255, 0.55)' },
    L: { core: '#c2f5dd', body: '#2ec98e', glow: 'rgba(69, 220, 162, 0.5)' },
  },
  accent: '#6fb7ff',
  notes: NOTES,
  totalBeats: TOTAL_BEATS,
};
