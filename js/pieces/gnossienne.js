import { NOTES, TOTAL_BEATS } from './gnossienne.data.js';

export const gnossienne = {
  id: 'gnossienne',
  mood: 'mystery',
  title: 'Gnossienne № 1',
  composer: 'Erik Satie · 1890',
  marking: 'Lent',
  duration: '3:17',
  bpm: 60, // one beat = one second (timing baked from the MIDI tempo map)
  colors: {
    R: { core: '#ffd9c2', body: '#e8884a', glow: 'rgba(240, 156, 96, 0.55)' },
    L: { core: '#d6c2e8', body: '#7e5fa8', glow: 'rgba(146, 116, 190, 0.5)' },
  },
  accent: '#f09c60',
  notes: NOTES,
  totalBeats: TOTAL_BEATS,
};
