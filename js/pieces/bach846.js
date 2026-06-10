import { NOTES, TOTAL_BEATS } from './bach846.data.js';

export const bach846 = {
  id: 'bach846',
  mood: 'morning',
  title: 'Prelude in C · BWV 846',
  composer: 'J. S. Bach · 1722',
  marking: 'Das Wohltemperierte Clavier I',
  duration: '2:20',
  bpm: 60, // one beat = one second (timing baked from the MIDI tempo map)
  colors: {
    R: { core: '#c8f4f0', body: '#3ecfc0', glow: 'rgba(82, 222, 208, 0.55)' },
    L: { core: '#cfe9ff', body: '#5a8df4', glow: 'rgba(118, 156, 255, 0.5)' },
  },
  accent: '#52ded0',
  notes: NOTES,
  totalBeats: TOTAL_BEATS,
};
