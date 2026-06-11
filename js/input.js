// Live note input for play-mode — a USB MIDI keyboard via the Web MIDI API
// when one is plugged in, otherwise the computer keyboard mapped to two
// QWERTY octaves. Either way the consumer just sees noteon/noteoff in MIDI
// note numbers.

// Physical key positions (KeyboardEvent.code), so the piano shape survives
// any keyboard layout: home row = white keys, the row above = black keys.
const KEY_TO_SEMITONE = new Map([
  ['KeyA', 0], ['KeyW', 1], ['KeyS', 2], ['KeyE', 3], ['KeyD', 4],
  ['KeyF', 5], ['KeyT', 6], ['KeyG', 7], ['KeyY', 8], ['KeyH', 9],
  ['KeyU', 10], ['KeyJ', 11], ['KeyK', 12], ['KeyO', 13], ['KeyL', 14],
  ['KeyP', 15], ['Semicolon', 16],
]);
const QWERTY_VELOCITY = 0.8;

export class NoteInput {
  constructor() {
    this.onnoteon = null; // (midi, velocity)
    this.onnoteoff = null; // (midi)
    this.onpedal = null; // (down)
    this.onchange = null; // source or octave changed
    this.baseMidi = 60; // the QWERTY 'A' key plays middle C
    this.midiName = null; // connected MIDI device name, if any
    this.attached = false;
    this.held = new Map(); // code -> sounding midi, so octave shifts never strand a note

    // Printed key caps for on-screen labels. KeyboardLayoutMap (Chromium)
    // gives the real legend — Ñ instead of ';' on a Spanish keyboard.
    this.labels = new Map();
    for (const code of KEY_TO_SEMITONE.keys())
      this.labels.set(code, code === 'Semicolon' ? ';' : code.replace('Key', ''));
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

  /** "C4" for the octave the QWERTY 'A' key currently plays. */
  get octaveName() {
    return 'C' + (this.baseMidi / 12 - 1);
  }

  /** midi -> key-cap label for the current QWERTY octave. */
  labelMap() {
    const m = new Map();
    for (const [code, semi] of KEY_TO_SEMITONE) m.set(this.baseMidi + semi, this.labels.get(code));
    return m;
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
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      const next = Math.min(Math.max(this.baseMidi + (e.code === 'KeyZ' ? -12 : 12), 24), 84);
      if (next !== this.baseMidi) {
        this.baseMidi = next;
        this.onchange?.();
      }
      return;
    }
    const semi = KEY_TO_SEMITONE.get(e.code);
    if (semi === undefined || this.held.has(e.code)) return;
    const midi = this.baseMidi + semi;
    this.held.set(e.code, midi);
    this.onnoteon?.(midi, QWERTY_VELOCITY);
  };

  #keyup = (e) => {
    const midi = this.held.get(e.code);
    if (midi === undefined) return;
    this.held.delete(e.code);
    this.onnoteoff?.(midi);
  };
}
