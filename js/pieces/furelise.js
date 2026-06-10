import { NOTES, TOTAL_BEATS } from './furelise.data.js';

export const furelise = {
  id: 'furelise',
  mood: 'letter',
  title: 'Für Elise',
  composer: 'L. v. Beethoven · 1810',
  marking: 'Bagatelle in A minor, WoO 59',
  duration: '2:10',
  bpm: 60, // one beat = one second (timing baked from the MIDI tempo map)
  colors: {
    R: { core: '#ffd9e8', body: '#f4699f', glow: 'rgba(255, 128, 174, 0.55)' },
    L: { core: '#ded9f4', body: '#8f86c9', glow: 'rgba(160, 150, 220, 0.5)' },
  },
  accent: '#ff86b3',
  notes: NOTES,
  totalBeats: TOTAL_BEATS,
};
