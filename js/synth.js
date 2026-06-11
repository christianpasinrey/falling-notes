// Web Audio instrument voices — no samples, no dependencies. One synth serves
// every family through patches: percussive piano, plucked strings, bowed
// strings, winds, organ and voice, all sharing a procedural hall reverb.

const PATCHES = {
  piano: { harmonics: [0, 1, 0.42, 0.2, 0.1, 0.06, 0.035, 0.02], attack: 0.006, env: 'percussive', shimmer: true },
  pluck: { harmonics: [0, 1, 0.55, 0.32, 0.16, 0.08, 0.04, 0.02], attack: 0.004, env: 'pluck', shimmer: true },
  bow: { harmonics: [0, 1, 0.7, 0.45, 0.3, 0.22, 0.15, 0.1, 0.07], attack: 0.09, env: 'sustain', vibrato: { rate: 5.2, cents: 6, delay: 0.25 } },
  wind: { harmonics: [0, 1, 0.16, 0.28, 0.07, 0.05], attack: 0.05, env: 'sustain', vibrato: { rate: 4.6, cents: 4, delay: 0.3 } },
  organ: { harmonics: [0, 1, 0.55, 0.2, 0.45, 0.08, 0.22], attack: 0.012, env: 'sustain' },
  voice: { harmonics: [0, 1, 0.35, 0.1, 0.04], attack: 0.08, env: 'sustain', vibrato: { rate: 5, cents: 8, delay: 0.35 } },
};

export class PianoSynth {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.3;

    this.dry = this.ctx.createGain();
    this.dry.gain.value = 0.75;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.32;

    const reverb = this.ctx.createConvolver();
    reverb.buffer = this.#impulseResponse(2.8, 2.4);

    this.master.connect(this.dry);
    this.master.connect(reverb);
    reverb.connect(this.wet);
    this.dry.connect(comp);
    this.wet.connect(comp);
    comp.connect(this.ctx.destination);

    this.waves = {};
    for (const [name, p] of Object.entries(PATCHES)) {
      const real = new Float32Array(p.harmonics.length).fill(0);
      this.waves[name] = this.ctx.createPeriodicWave(real, Float32Array.from(p.harmonics));
    }

    // live (play-it-yourself) voices, keyed by midi note
    this.liveVoices = new Map();
    this.sustained = [];
    this.pedalDown = false;
  }

  get now() {
    return this.ctx.currentTime;
  }

  resume() {
    return this.ctx.resume();
  }

  suspend() {
    return this.ctx.suspend();
  }

  /** Schedule a note. when/duration in seconds on the AudioContext clock. */
  playNote(midi, when, duration, velocity = 0.7, patch = 'piano') {
    const p = PATCHES[patch] || PATCHES.piano;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const ctx = this.ctx;
    const end = when + duration;

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.waves[patch] || this.waves.piano);
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 7, 9000), when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 2.2, 700), when + 2.2);
    filter.Q.value = 0.4;

    const amp = ctx.createGain();
    const peak = 0.16 * (0.35 + 0.65 * velocity);
    const decay = 4.2 - (midi - 21) * 0.028; // lower notes ring longer
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peak, when + p.attack);

    let release = 0.6;
    if (p.env === 'percussive') {
      amp.gain.setTargetAtTime(peak * 0.5, when + p.attack, 0.18);
      amp.gain.setTargetAtTime(peak * 0.08, when + 0.7, Math.max(decay * 0.8, 1.2));
    } else if (p.env === 'pluck') {
      amp.gain.setTargetAtTime(0.0001, when + p.attack, Math.max(decay * 0.18, 0.25));
      release = 0.3;
    } else {
      // sustain: settle slightly below peak and hold for the written length
      amp.gain.setTargetAtTime(peak * 0.78, when + p.attack, 0.12);
      release = 0.28;
    }
    amp.gain.setTargetAtTime(0.0001, end, release / 3);

    osc.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);

    const stopAt = end + release * 2.5;
    osc.start(when);
    osc.stop(stopAt);

    if (p.shimmer) {
      const shimmer = ctx.createOscillator();
      shimmer.type = 'sine';
      shimmer.frequency.value = freq * 2;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(peak * 0.25, when);
      sg.gain.setTargetAtTime(0.0001, when + 0.005, 0.18);
      shimmer.connect(sg);
      sg.connect(filter);
      shimmer.start(when);
      shimmer.stop(stopAt);
    }

    if (p.vibrato && duration > 0.35) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = p.vibrato.rate;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, when);
      depth.gain.linearRampToValueAtTime(
        freq * (Math.pow(2, p.vibrato.cents / 1200) - 1),
        when + p.vibrato.delay + 0.3
      );
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(when + p.vibrato.delay);
      lfo.stop(stopAt);
    }
  }

  /** Begin a live note now; it rings until noteOff (or the pedal) releases it. */
  noteOn(midi, velocity = 0.8) {
    this.noteOff(midi); // retrigger cleanly
    const when = this.now;
    const p = PATCHES.piano;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.waves.piano);
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 7, 9000), when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 2.2, 700), when + 2.2);
    filter.Q.value = 0.4;

    const amp = ctx.createGain();
    const peak = 0.16 * (0.35 + 0.65 * velocity);
    const decay = 4.2 - (midi - 21) * 0.028;
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peak, when + p.attack);
    amp.gain.setTargetAtTime(peak * 0.5, when + p.attack, 0.18);
    amp.gain.setTargetAtTime(peak * 0.08, when + 0.7, Math.max(decay * 0.8, 1.2));

    osc.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    osc.start(when);
    osc.stop(when + 12); // safety net if a release never arrives

    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = freq * 2;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(peak * 0.25, when);
    sg.gain.setTargetAtTime(0.0001, when + 0.005, 0.18);
    shimmer.connect(sg);
    sg.connect(filter);
    shimmer.start(when);
    shimmer.stop(when + 12);

    this.liveVoices.set(midi, { osc, shimmer, amp });
  }

  noteOff(midi) {
    const v = this.liveVoices.get(midi);
    if (!v) return;
    this.liveVoices.delete(midi);
    if (this.pedalDown) this.sustained.push(v);
    else this.#releaseVoice(v);
  }

  setPedal(down) {
    this.pedalDown = down;
    if (!down) {
      for (const v of this.sustained) this.#releaseVoice(v);
      this.sustained.length = 0;
    }
  }

  #releaseVoice(v) {
    const t = this.now;
    v.amp.gain.setTargetAtTime(0.0001, t, 0.09);
    v.osc.stop(t + 0.8);
    v.shimmer.stop(t + 0.8);
  }

  #impulseResponse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }
}
