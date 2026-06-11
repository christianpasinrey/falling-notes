// Canvas renderer — a 3D note highway. Notes are born at the vanishing point,
// fly down a perspective lane and land on their key at the exact moment they
// sound. Starfield + nebula sky, depth fog, a receding time-grid, and soft
// impact light keep the music visible and alive.

import { buildLayout } from './keyboard.js';

const FALL_S = 5; // seconds a note travels from the horizon to the keys
const DEPTH = 0.55; // perspective rate: s = 1 / (1 + z * DEPTH)

const GLYPHS = ['♪', '♫', '♩', '\u{1D11E}', '\u{1D122}'];

// colour for keys the user presses in play-mode (no hand attached)
const USER_COLORS = { core: '#f4f8ff', body: '#cfe0ff', glow: 'rgba(205, 224, 255, 0.55)' };

export class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.spawned = new Set();
    this.notes = [];
    this.accent = '#6fb7ff';
    this.liveInput = null; // midi -> {vel}: keys the user is holding right now
    this.keyLabels = null; // midi -> key-cap letter, for QWERTY play-mode
    this.colors = {
      R: { core: '#bfe0ff', body: '#5aa9f4', glow: 'rgba(111, 183, 255, 0.55)' },
      L: { core: '#c2f5dd', body: '#2ec98e', glow: 'rgba(69, 220, 162, 0.5)' },
    };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setPiece(piece) {
    const spb = 60 / piece.bpm;
    this.colors = piece.colors;
    this.accent = piece.accent;
    this.notes = piece.notes.map(([midi, startBeat, durBeats, hand, vel]) => ({
      midi,
      start: startBeat * spb,
      end: (startBeat + durBeats) * spb,
      hand,
      vel,
    }));
    this.reset();
  }

  reset() {
    this.particles.length = 0;
    this.spawned.clear();
  }

  /** Share a live map of midi -> {vel} for keys the user is holding. */
  setLiveInput(map) {
    this.liveInput = map;
  }

  /** Paint a key-cap label on each mapped piano key (midi -> letter), or null to clear. */
  setKeyLabels(labels) {
    this.keyLabels = labels;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.kbH = Math.max(86, Math.min(this.h * 0.17, 150));
    this.hitY = this.h - this.kbH;
    this.horizonY = this.h * 0.16;
    this.layout = buildLayout(this.w);
    this.bg = this.#makeBackground();
    this.#makeSky();
  }

  // perspective scale for a time-distance z (seconds until impact)
  #s(z) {
    return 1 / (1 + Math.max(z, 0) * DEPTH);
  }

  // project a keyboard x and a depth z to screen space
  #project(x, z) {
    const s = this.#s(z);
    const cx = this.w / 2 + Math.sin((this.t || 0) * 0.04) * this.w * 0.008;
    return {
      x: cx + (x - cx) * s,
      y: this.horizonY + (this.hitY - this.horizonY) * s,
      s,
    };
  }

  /** songTime in seconds (negative during lead-in); progress 0..1. */
  render(songTime, progress) {
    const { ctx, w, h, hitY } = this;
    this.t = songTime;

    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    this.#drawSky(songTime);
    this.#drawGrid(songTime);

    // collect visible notes, then paint far-to-near
    const active = new Map();
    const visible = [];
    for (const n of this.notes) {
      const zFront = n.start - songTime;
      if (zFront > FALL_S || songTime > n.end + 0.3) continue;
      if (songTime >= n.start && songTime < n.end) {
        const prev = active.get(n.midi);
        if (!prev || n.start > prev.start) active.set(n.midi, n);
        const key = n.midi + ':' + n.start;
        if (!this.spawned.has(key)) {
          this.spawned.add(key);
          this.#spawnParticles(n);
        }
      }
      visible.push(n);
    }
    visible.sort((a, b) => (b.start - songTime) - (a.start - songTime));
    for (const n of visible) this.#drawNote(n, songTime);

    // keys the user is physically holding override the scheduled lighting
    if (this.liveInput) {
      for (const [midi, v] of this.liveInput)
        active.set(midi, { midi, hand: 'U', vel: v.vel ?? 0.8, start: songTime });
    }

    this.#drawImpactGlow(active);
    this.#drawKeyboard(active);
    this.#drawParticles();

    if (progress > 0) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = this.accent;
      ctx.fillRect(0, 0, w * Math.min(progress, 1), 2);
      ctx.globalAlpha = 1;
    }
  }

  #drawNote(n, songTime) {
    const { ctx } = this;
    const key = this.layout.keys.get(n.midi);
    if (!key) return;
    const c = this.colors[n.hand];

    const zFront = Math.max(n.start - songTime, 0);
    const zBack = Math.min(n.end - songTime, FALL_S + 2);
    if (zBack <= 0) return;

    const x0 = key.x + (key.black ? 0.5 : 1.5);
    const x1 = key.x + key.w - (key.black ? 0.5 : 1.5);
    const f0 = this.#project(x0, zFront);
    const f1 = this.#project(x1, zFront);
    const b0 = this.#project(x0, zBack);
    const b1 = this.#project(x1, zBack);

    const sounding = songTime >= n.start && songTime < n.end;
    // fog: far notes fade in from the horizon
    const fog = Math.min(Math.max(1.25 - zFront / FALL_S, 0.12), 1);

    ctx.save();
    ctx.globalAlpha = fog;
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = sounding ? 30 : 18 * f0.s;

    const grad = ctx.createLinearGradient(0, b0.y, 0, f0.y);
    grad.addColorStop(0, c.body);
    grad.addColorStop(1, sounding ? '#ffffff' : c.core);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(f1.x, f1.y);
    ctx.lineTo(f0.x, f0.y);
    ctx.closePath();
    ctx.fill();

    // bright leading edge — the part about to touch the key
    if (f0.s > 0.45) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = sounding ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
      ctx.fillRect(f0.x, f0.y - 2, f1.x - f0.x, 2);
    }
    ctx.restore();
  }

  #drawImpactGlow(active) {
    if (!active.size) return;
    const { ctx, hitY } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [midi, n] of active) {
      const key = this.layout.keys.get(midi);
      if (!key) continue;
      const cx = key.x + key.w / 2;
      const r = key.w * 3.2;
      const g = ctx.createRadialGradient(cx, hitY, 0, cx, hitY, r);
      const c = this.colors[n.hand] || USER_COLORS;
      g.addColorStop(0, c.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5 * n.vel + 0.2;
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, hitY - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  #drawGrid(songTime) {
    const { ctx, w } = this;
    ctx.save();
    // receding time rings, one per second of travel — the road moves
    const phase = 1 - ((songTime % 1) + 1) % 1;
    for (let i = 0; i < FALL_S; i++) {
      const z = i + phase;
      const p = this.#project(0, z);
      const q = this.#project(w, z);
      ctx.globalAlpha = 0.05 * p.s;
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    // lane edges converging on the vanishing point
    for (const xe of [0, w]) {
      const near = this.#project(xe, 0);
      const far = this.#project(xe, FALL_S * 2);
      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      ctx.moveTo(near.x, near.y);
      ctx.lineTo(far.x, far.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- sky ----

  #makeSky() {
    const count = Math.floor((this.w * this.h) / 9000);
    const rand = mulberry32(42);
    this.stars = Array.from({ length: count }, () => ({
      x: rand(),
      y: rand() * 0.85,
      size: 0.4 + rand() * 1.3,
      tw: 2 + rand() * 4,
      ph: rand() * Math.PI * 2,
    }));
    const grand = mulberry32(7);
    this.glyphs = Array.from({ length: 7 }, (_, i) => ({
      ch: GLYPHS[i % GLYPHS.length],
      x: grand(),
      y: 0.1 + grand() * 0.5,
      size: 18 + grand() * 30,
      speed: 0.004 + grand() * 0.008,
      sway: grand() * Math.PI * 2,
    }));
    // musical glyph support check (avoids tofu boxes on odd platforms)
    const ctx = this.ctx;
    ctx.font = '30px "Cormorant Garamond", Georgia, serif';
    const clef = ctx.measureText('\u{1D11E}').width;
    const tofu = ctx.measureText('￿').width;
    if (Math.abs(clef - tofu) < 0.5)
      this.glyphs = this.glyphs.filter((g) => g.ch.length === 1);
  }

  #drawSky(songTime) {
    const { ctx, w, h } = this;
    const t = Math.max(songTime, 0);

    // nebula tinted with the piece accent, breathing slowly
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.3);
    const cx = w / 2;
    const g = ctx.createRadialGradient(cx, this.horizonY, 0, cx, this.horizonY, h * 0.75);
    g.addColorStop(0, this.#tint(0.10 + breathe * 0.05));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // stars with gentle twinkle and parallax drift
    ctx.save();
    ctx.fillStyle = '#cdd8ee';
    for (const s of this.stars) {
      const x = ((s.x + t * 0.0012) % 1) * w;
      const y = s.y * h;
      ctx.globalAlpha = 0.16 + 0.2 * (0.5 + 0.5 * Math.sin(t * (2 * Math.PI / s.tw) + s.ph));
      ctx.beginPath();
      ctx.arc(x, y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    // ghost glyphs adrift in the upper sky
    ctx.fillStyle = this.accent;
    ctx.textAlign = 'center';
    for (const gl of this.glyphs) {
      const x = ((gl.x + t * gl.speed * 0.1) % 1) * w;
      const y = gl.y * h + Math.sin(t * 0.25 + gl.sway) * 12;
      ctx.globalAlpha = 0.05;
      ctx.font = `${gl.size}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText(gl.ch, x, y);
    }
    ctx.restore();
  }

  #tint(alpha) {
    // accent hex → rgba with given alpha
    const hex = this.accent.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ---- keyboard & particles ----

  #drawKeyboard(active) {
    const { ctx, w, hitY, kbH } = this;
    const { keys } = this.layout;

    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, hitY - 5, w, 5);
    ctx.fillStyle = this.#tint(0.22);
    ctx.fillRect(0, hitY - 5, w, 1);

    for (const [midi, k] of keys) {
      if (k.black) continue;
      const lit = active.get(midi);
      const g = ctx.createLinearGradient(0, hitY, 0, hitY + kbH);
      if (lit) {
        const c = this.colors[lit.hand] || USER_COLORS;
        g.addColorStop(0, c.body);
        g.addColorStop(0.7, c.core);
        g.addColorStop(1, '#fff');
      } else {
        g.addColorStop(0, '#b7bcc7');
        g.addColorStop(0.12, '#e4e7ee');
        g.addColorStop(1, '#f7f8fb');
      }
      ctx.fillStyle = g;
      ctx.fillRect(k.x + 0.5, hitY, k.w - 1, kbH);
      if (lit) {
        ctx.save();
        ctx.shadowColor = (this.colors[lit.hand] || USER_COLORS).glow;
        ctx.shadowBlur = 18;
        ctx.fillRect(k.x + 0.5, hitY, k.w - 1, kbH);
        ctx.restore();
      }
    }

    const bH = kbH * 0.62;
    for (const [midi, k] of keys) {
      if (!k.black) continue;
      const lit = active.get(midi);
      const g = ctx.createLinearGradient(0, hitY, 0, hitY + bH);
      if (lit) {
        const c = this.colors[lit.hand] || USER_COLORS;
        g.addColorStop(0, c.body);
        g.addColorStop(1, c.core);
      } else {
        g.addColorStop(0, '#05070b');
        g.addColorStop(0.85, '#16191f');
        g.addColorStop(1, '#2a2e36');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(k.x, hitY, k.w, bH, [0, 0, 3, 3]);
      ctx.fill();
    }

    // QWERTY play-mode: paint the computer key cap on its piano key
    if (this.keyLabels) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const size = Math.max(10, Math.min(this.layout.whiteW * 0.55, 16));
      ctx.font = `600 ${size}px system-ui, -apple-system, sans-serif`;
      for (const [midi, label] of this.keyLabels) {
        const k = keys.get(midi);
        const { ch, mod } = typeof label === 'string' ? { ch: label, mod: null } : label;
        if (!k || !ch) continue;
        const cx = k.x + k.w / 2;
        const text = mod ? '⇧' + ch : ch;
        ctx.globalAlpha = mod ? 0.65 : 1;
        if (k.black) {
          ctx.fillStyle = '#dfe6f2';
          ctx.fillText(text, cx, hitY + bH - size * 0.9);
        } else {
          ctx.fillStyle = '#39414f';
          ctx.fillText(text, cx, hitY + kbH - size * 0.9);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  #spawnParticles(n) {
    const key = this.layout.keys.get(n.midi);
    if (!key) return;
    const c = this.colors[n.hand];
    const count = 5 + Math.round(n.vel * 6);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: key.x + key.w * Math.random(),
        y: this.hitY - 2,
        vx: (Math.random() - 0.5) * 40,
        vy: -(22 + Math.random() * 70),
        life: 1,
        size: 1 + Math.random() * 2.2,
        color: c.glow,
      });
    }
  }

  #drawParticles() {
    const { ctx } = this;
    const dt = 1 / 60;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 30 * dt;
      p.life -= dt / 1.1;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life * 0.8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  #makeBackground() {
    const g = this.ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#020307');
    g.addColorStop(0.55, '#04060c');
    g.addColorStop(1, '#0a1020');
    return g;
  }
}

// deterministic small PRNG so the sky doesn't reshuffle on every resize
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
