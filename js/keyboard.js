// 88-key layout (A0..C8): geometry for both the drawn keyboard and the
// falling-note lanes. White keys split the full width; black keys sit on top.

export const FIRST_MIDI = 21; // A0
export const LAST_MIDI = 108; // C8

const BLACK_IN_OCTAVE = new Set([1, 3, 6, 8, 10]); // C#, D#, F#, G#, A#

export const isBlack = (midi) => BLACK_IN_OCTAVE.has(midi % 12);

export function buildLayout(width) {
  let whiteCount = 0;
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) if (!isBlack(m)) whiteCount++;

  const whiteW = width / whiteCount;
  const blackW = whiteW * 0.58;
  const keys = new Map();

  let wIndex = 0;
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
    if (!isBlack(m)) {
      keys.set(m, { x: wIndex * whiteW, w: whiteW, black: false });
      wIndex++;
    } else {
      // centered on the boundary between the two neighbouring white keys
      keys.set(m, { x: wIndex * whiteW - blackW / 2, w: blackW, black: true });
    }
  }
  return { keys, whiteW, blackW, whiteCount };
}
