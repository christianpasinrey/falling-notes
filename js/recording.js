// Playground recordings as shareable links. The note events are JSON,
// deflated when the browser can, and tucked into the URL hash — no server,
// nothing uploaded; whoever opens the link rebuilds the piece locally.

const b64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

const unb64url = (str) => {
  const bin = atob(str.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const pump = async (stream) => new Uint8Array(await new Response(stream).arrayBuffer());

/** notes: [[midi, startS, durS, hand, vel]] -> compact hash payload. */
export async function encodeRecording(notes) {
  const compact = notes.map(([m, s, d, h, v]) => [m, round3(s), round3(d), h, round3(v)]);
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  if (typeof CompressionStream !== 'undefined') {
    const gz = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'z' + b64url(await pump(gz));
  }
  return 'p' + b64url(bytes);
}

/** Hash payload -> playable piece, or null if it cannot be read. */
export async function decodeRecording(payload) {
  try {
    const bytes = unb64url(payload.slice(1));
    let json;
    if (payload[0] === 'z') {
      const raw = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      json = new TextDecoder().decode(await pump(raw));
    } else {
      json = new TextDecoder().decode(bytes);
    }
    const notes = JSON.parse(json);
    if (!Array.isArray(notes) || !notes.length) return null;
    return pieceFromRecording(notes);
  } catch {
    return null;
  }
}

export function pieceFromRecording(notes) {
  const duration = notes.reduce((m, n) => Math.max(m, n[1] + n[2]), 0);
  const mins = Math.floor(duration / 60);
  return {
    id: 'recording-' + Math.round(duration * 1000),
    mood: 'shared',
    title: 'a shared recording',
    composer: 'played by a friend',
    marking: 'recorded in the playground',
    duration: `${mins}:${String(Math.round(duration % 60)).padStart(2, '0')}`,
    bpm: 60, // beat = second, like every MIDI-derived piece
    colors: {
      R: { core: '#bfe0ff', body: '#5aa9f4', glow: 'rgba(111, 183, 255, 0.55)' },
      L: { core: '#c2f5dd', body: '#2ec98e', glow: 'rgba(69, 220, 162, 0.5)' },
    },
    accent: '#6fb7ff',
    deck: 'piano',
    notes,
    totalBeats: duration,
  };
}

const round3 = (x) => Math.round(x * 1000) / 1000;
