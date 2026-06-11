// Browser-side Standard MIDI File parser. Resolves event times through the
// full tempo map into real seconds, and reports per-track names and GM
// programs so instruments can be voiced and drawn appropriately.

export function parseMidi(arrayBuffer) {
  const buf = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let pos = 0;
  const read32 = () => { const v = buf.getUint32(pos); pos += 4; return v; };
  const read16 = () => { const v = buf.getUint16(pos); pos += 2; return v; };
  const read8 = () => bytes[pos++];
  const readVarLen = () => {
    let v = 0, b;
    do { b = read8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80);
    return v;
  };
  const ascii = (from, len) => String.fromCharCode(...bytes.slice(from, from + len));

  if (ascii(0, 4) !== 'MThd') throw new Error('not a midi file');
  pos = 8;
  read16(); // format
  const ntrks = read16();
  const division = read16();

  const tracks = [];
  const tempoEvents = [{ tick: 0, usPerQ: 500000 }];
  let timeSig = 0;
  for (let t = 0; t < ntrks; t++) {
    if (ascii(pos, 4) !== 'MTrk') throw new Error('bad track chunk');
    pos += 4;
    const len = read32();
    const end = pos + len;
    let tick = 0, running = 0;
    const events = [];
    const meta = { name: '', program: -1 };
    while (pos < end) {
      tick += readVarLen();
      let status = bytes[pos];
      if (status & 0x80) { pos++; running = status; } else { status = running; }
      const type = status & 0xf0;
      if (type === 0x90 || type === 0x80) {
        const note = read8(), vel = read8();
        events.push({ tick, on: type === 0x90 && vel > 0, note, vel });
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) pos += 2;
      else if (type === 0xc0) { if (meta.program < 0) meta.program = read8(); }
      else if (type === 0xd0) pos += 1;
      else if (status === 0xff) {
        const mtype = read8(), mlen = readVarLen();
        if (mtype === 0x51) tempoEvents.push({ tick, usPerQ: (bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2] });
        else if (mtype === 0x58 && !timeSig) timeSig = bytes[pos]; // numerator: beats per bar
        else if ((mtype === 0x03 || mtype === 0x04) && !meta.name) meta.name = ascii(pos, mlen);
        pos += mlen;
      } else if (status === 0xf0 || status === 0xf7) pos += readVarLen();
      else throw new Error('unknown midi status 0x' + status.toString(16));
    }
    pos = end;
    tracks.push({ events, ...meta });
  }

  // tick → seconds through the tempo map
  tempoEvents.sort((a, b) => a.tick - b.tick);
  const segs = [];
  let acc = 0;
  for (let i = 0; i < tempoEvents.length; i++) {
    const cur = tempoEvents[i];
    if (i > 0) {
      const prev = segs[segs.length - 1];
      acc = prev.startS + ((cur.tick - prev.tick) / division) * (prev.usPerQ / 1e6);
    }
    segs.push({ tick: cur.tick, usPerQ: cur.usPerQ, startS: acc });
  }
  const tickToSec = (tick) => {
    let seg = segs[0];
    for (const s of segs) { if (s.tick <= tick) seg = s; else break; }
    return seg.startS + ((tick - seg.tick) / division) * (seg.usPerQ / 1e6);
  };

  const notes = [];
  tracks.forEach((tr, ti) => {
    const open = {};
    for (const e of tr.events) {
      if (e.on) (open[e.note] ||= []).push(e);
      else {
        const st = (open[e.note] || []).shift();
        if (!st) continue;
        const start = tickToSec(st.tick);
        notes.push({
          track: ti,
          midi: e.note,
          start,
          dur: Math.max(tickToSec(e.tick) - start, 0.05),
          vel: st.vel / 127,
        });
      }
    }
  });
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  const duration = notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0);

  // quarter-note grid in real seconds, walked through the tempo map — this is
  // what a metronome ticks on
  const beats = [];
  if (division > 0) {
    for (let tick = 0; beats.length < 100000; tick += division) {
      const s = tickToSec(tick);
      if (s > duration) break;
      beats.push(s);
    }
  }

  return {
    notes,
    duration,
    beats,
    beatsPerBar: timeSig || 4,
    tracks: tracks.map((t) => ({ name: t.name, program: t.program, noteCount: t.events.filter((e) => e.on).length })),
  };
}
