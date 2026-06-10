// Soft piano voice built on Web Audio: a harmonically-rich periodic wave per
// note, percussive envelope, pitch-dependent decay, gentle lowpass, and a
// procedurally generated hall reverb. No samples, no dependencies.

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

    // One shared wave: amplitudes fall off like a felt-hammer piano.
    const harmonics = [0, 1, 0.42, 0.2, 0.1, 0.06, 0.035, 0.02];
    const real = new Float32Array(harmonics.length).fill(0);
    this.wave = this.ctx.createPeriodicWave(real, Float32Array.from(harmonics));
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
  playNote(midi, when, duration, velocity = 0.7) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.wave);
    osc.frequency.value = freq;

    // Faint octave partial for hammer brightness, decays quickly.
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = freq * 2;
    const shimmerGain = ctx.createGain();

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 7, 9000), when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 2.2, 700), when + 2.2);
    filter.Q.value = 0.4;

    const amp = ctx.createGain();

    // Lower notes ring longer, like real strings.
    const decay = 4.2 - (midi - 21) * 0.028;
    const peak = 0.16 * (0.35 + 0.65 * velocity);

    // Hammer strike, quick settle to half, then a slow singing tail that
    // keeps long notes audible for their whole written duration.
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peak, when + 0.006);
    amp.gain.setTargetAtTime(peak * 0.5, when + 0.006, 0.18);
    amp.gain.setTargetAtTime(peak * 0.08, when + 0.7, Math.max(decay * 0.8, 1.2));

    const release = 0.6;
    const end = when + duration;
    amp.gain.setTargetAtTime(0.0001, end, release / 3);

    shimmerGain.gain.setValueAtTime(peak * 0.25, when);
    shimmerGain.gain.setTargetAtTime(0.0001, when + 0.005, 0.18);

    osc.connect(filter);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);

    osc.start(when);
    shimmer.start(when);
    const stopAt = end + release * 2;
    osc.stop(stopAt);
    shimmer.stop(stopAt);
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
