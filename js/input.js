// Live note input for play-mode — a USB MIDI keyboard via the Web MIDI API
// when one is plugged in, otherwise the computer keyboard mapped to two
// QWERTY octaves. Either way the consumer just sees noteon/noteoff in MIDI
// note numbers.

// Physical key positions (KeyboardEvent.code), so the piano shape survives
// any keyboard layout. Two full manuals, the classic DAW mapping: bottom row
// = lower-octave whites with blacks on the home row, Q-row = upper whites
// with blacks on the digits. Insertion order matters: where the manuals
// overlap (C+1..E+1), whichever code comes first supplies the on-key label.
const KEY_TO_SEMITONE = new Map([
  // lower manual
  ['KeyZ', 0], ['KeyS', 1], ['KeyX', 2], ['KeyD', 3], ['KeyC', 4],
  ['KeyV', 5], ['KeyG', 6], ['KeyB', 7], ['KeyH', 8], ['KeyN', 9],
  ['KeyJ', 10], ['KeyM', 11],
  // upper manual
  ['KeyQ', 12], ['Digit2', 13], ['KeyW', 14], ['Digit3', 15], ['KeyE', 16],
  ['KeyR', 17], ['Digit5', 18], ['KeyT', 19], ['Digit6', 20], ['KeyY', 21],
  ['Digit7', 22], ['KeyU', 23], ['KeyI', 24], ['Digit9', 25], ['KeyO', 26],
  ['Digit0', 27], ['KeyP', 28],
  // lower-manual tail, duplicates of Q..E (after them, so Q-row labels win)
  ['Comma', 12], ['KeyL', 13], ['Period', 14], ['Semicolon', 15], ['Slash', 16],
]);
const SHIFT_OCTAVES = 24; // a held shift jumps two octaves: the plain span is ~2.4
const QWERTY_VELOCITY = 0.8;
const PUNCT_LABEL = { Comma: ',', Period: '.', Slash: '-', Semicolon: ';' };

export class NoteInput {
  constructor() {
    this.onnoteon = null; // (midi, velocity)
    this.onnoteoff = null; // (midi)
    this.onpedal = null; // (down)
    this.onchange = null; // source or octave changed
    this.baseMidi = 48; // the QWERTY 'Z' key plays C3; Q continues at C4
    this.midiName = null; // connected MIDI device name, if any
    this.attached = false;
    this.held = new Map(); // code -> sounding midi, so octave shifts never strand a note
    this.shiftL = false; // held left shift reaches two octaves down…
    this.shiftR = false; // …held right shift two octaves up

    // Printed key caps for on-screen labels. KeyboardLayoutMap (Chromium)
    // gives the real legend — Ñ instead of ';' on a Spanish keyboard.
    this.labels = new Map();
    for (const code of KEY_TO_SEMITONE.keys())
      this.labels.set(code, PUNCT_LABEL[code] || code.replace(/^(Key|Digit)/, ''));
    navigator.keyboard?.getLayoutMap?.().then((map) => {
      for (const code of KEY_TO_SEMITONE.keys()) {
        const ch = map.get(code);
        if (ch) this.labels.set(code, ch.toUpperCase());
      }
      this.onchange?.();
    });
  }

  get source() {
    return this.midiName ? 'midi' : 'keyboard';
  }

  /** Note the QWERTY 'Z' key plays right now, shifts included. */
  get effectiveBase() {
    return this.baseMidi + (this.shiftL ? -SHIFT_OCTAVES : 0) + (this.shiftR ? SHIFT_OCTAVES : 0);
  }

  /** "C3" for the octave the QWERTY 'Z' key currently plays. */
  get octaveName() {
    return 'C' + (this.effectiveBase / 12 - 1);
  }

  /**
   * midi -> {ch, mod} for every key the QWERTY layout can reach from home:
   * the centre span plain, two octaves left via held left shift (mod 'L'),
   * two octaves right via held right shift (mod 'R'). Plain wins overlaps.
   * Keyed to the home octave so the map stays put while shifts are held.
   */
  labelMap() {
    const m = new Map();
    const zone = (offset, mod) => {
      for (const [code, semi] of KEY_TO_SEMITONE) {
        const midi = this.baseMidi + offset + semi;
        if (midi >= 21 && midi <= 108 && !m.has(midi)) m.set(midi, { ch: this.labels.get(code), mod });
      }
    };
    zone(0, null);
    zone(-SHIFT_OCTAVES, 'L');
    zone(SHIFT_OCTAVES, 'R');
    return m;
  }

  /**
   * Pick the home octave so the piece's range fits inside the reachable
   * window [base-24, base+52]. Prefers C3 when the piece allows it; for
   * ranges wider than the window, centres on the piece instead.
   */
  fitTo(minMidi, maxMidi) {
    const lo = maxMidi - 28 - SHIFT_OCTAVES; // base ≥ lo reaches the piece's top
    const hi = minMidi + SHIFT_OCTAVES; // base ≤ hi reaches its bottom
    const target = lo <= hi ? Math.min(Math.max(48, lo), hi) : (minMidi + maxMidi) / 2 - 14;
    const base = Math.min(Math.max(Math.round(target / 12) * 12, 24), 72);
    if (base !== this.baseMidi) {
      this.baseMidi = base;
      this.onchange?.();
    }
  }

  /** Key-cap that plays this pitch class in the plain zone (scoring folds octaves). */
  keyForPitch(midi) {
    for (const [code, semi] of KEY_TO_SEMITONE)
      if ((this.baseMidi + semi) % 12 === midi % 12) return this.labels.get(code);
    return null;
  }

  /** Request Web MIDI once (prompts for permission); safe to re-call. */
  async enableMidi() {
    if (this.access !== undefined) return;
    this.access = null;
    if (!navigator.requestMIDIAccess) return;
    try {
      this.access = await navigator.requestMIDIAccess();
    } catch {
      return; // permission denied or platform quirk: keyboard fallback stands
    }
    const rescan = () => {
      let name = null;
      for (const port of this.access.inputs.values()) {
        port.onmidimessage = (e) => this.#midiMessage(e);
        name ||= port.name;
      }
      if (name !== this.midiName) {
        this.midiName = name;
        this.onchange?.();
      }
    };
    this.access.onstatechange = rescan; // hot plug / unplug
    rescan();
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.#keydown);
    window.addEventListener('keyup', this.#keyup);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.#keydown);
    window.removeEventListener('keyup', this.#keyup);
    for (const midi of this.held.values()) this.onnoteoff?.(midi);
    this.held.clear();
    this.shiftL = this.shiftR = false;
  }

  #midiMessage(e) {
    if (!this.attached) return;
    const [status, d1, d2] = e.data;
    const type = status & 0xf0;
    if (type === 0x90 && d2 > 0) this.onnoteon?.(d1, d2 / 127);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) this.onnoteoff?.(d1);
    else if (type === 0xb0 && d1 === 64) this.onpedal?.(d2 >= 64);
  }

  #keydown = (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this[e.code === 'ShiftLeft' ? 'shiftL' : 'shiftR'] = true;
      this.onchange?.();
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const next = Math.min(Math.max(this.baseMidi + (e.code === 'ArrowDown' ? -12 : 12), 24), 72);
      if (next !== this.baseMidi) {
        this.baseMidi = next;
        this.onchange?.();
      }
      return;
    }
    const semi = KEY_TO_SEMITONE.get(e.code);
    if (semi === undefined || this.held.has(e.code)) return;
    const midi = this.effectiveBase + semi;
    if (midi < 21 || midi > 108) return;
    this.held.set(e.code, midi);
    this.onnoteon?.(midi, QWERTY_VELOCITY);
  };

  #keyup = (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this[e.code === 'ShiftLeft' ? 'shiftL' : 'shiftR'] = false;
      this.onchange?.();
      return;
    }
    const midi = this.held.get(e.code);
    if (midi === undefined) return;
    this.held.delete(e.code);
    this.onnoteoff?.(midi);
  };
}
