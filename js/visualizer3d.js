// Three.js renderer — a journey through space. The piano floats among
// streaming stars; notes arrive as glowing blocks from deep space and land on
// their key at the exact moment they sound. Bloom makes the music luminous.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildLayout } from './keyboard.js';

const SPEED = 9; // world units per second of music
const HORIZON = 70; // how far away notes are born
const FALL_S = HORIZON / SPEED;
const STAR_COUNT = 1100;

export class Visualizer3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020308);
    this.scene.fog = new THREE.FogExp2(0x030510, 0.016);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);

    this.notes = [];
    this.live = new Map(); // note -> mesh
    this.pool = [];
    this.spb = 1;
    this.lastT = -4;
    this.liveInput = null; // midi -> {vel}: keys the user is holding right now
    this.userColor = new THREE.Color(0xe9f2ff);

    this.#buildPiano();
    this.#buildStrings();
    this.#buildWind();
    this.deck = 'piano';
    this.#buildSpace();
    this.#buildLights();
    this.#buildParticles();

    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.6);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------- scene construction ----------

  #buildPiano() {
    // 52 white keys of width 1 → x spans [-26, 26]
    this.layout = buildLayout(52);
    this.keys = new Map();
    const piano = new THREE.Group();

    // seesaw pivot at 30% from the back: the near side (toward the viewer)
    // sinks under the finger and the far side lifts slightly
    const whiteGeo = new THREE.BoxGeometry(0.94, 0.5, 5.8);
    whiteGeo.translate(0, -0.25, 1.16);
    const blackGeo = new THREE.BoxGeometry(0.56, 0.55, 3.6);
    blackGeo.translate(0, -0.2, 0.72);

    for (const [midi, k] of this.layout.keys) {
      const mat = new THREE.MeshStandardMaterial(
        k.black
          ? { color: 0x14171e, roughness: 0.35, metalness: 0.2 }
          : { color: 0xdfe3ea, roughness: 0.6, metalness: 0.03 }
      );
      const mesh = new THREE.Mesh(k.black ? blackGeo : whiteGeo, mat);
      mesh.position.set(k.x + k.w / 2 - 26, k.black ? 0.45 : 0.25, k.black ? 1.08 : 1.74);
      piano.add(mesh);
      this.keys.set(midi, { mesh, mat, black: k.black, press: 0, hand: null });
    }

    // a slim glowing rail where notes land
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(53.4, 0.1, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x6fb7ff })
    );
    rail.position.set(0, 0.42, -0.1);
    piano.add(rail);
    this.rail = rail;

    // base under the keys, so the piano reads as an object floating in space
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(53.6, 1.1, 6.4),
      new THREE.MeshStandardMaterial({ color: 0x0a0d15, roughness: 0.5, metalness: 0.35 })
    );
    base.position.set(0, -0.62, 2.9);
    piano.add(base);

    this.scene.add(piano);
    this.deckPiano = piano;
  }

  // a harp standing where the piano was: one string per pitch, longer = lower
  #buildStrings() {
    const g = new THREE.Group();
    this.strings = new Map();
    const geo = new THREE.BoxGeometry(0.09, 1, 0.09);
    geo.translate(0, 0.5, 0); // grow upward from the base
    for (const [midi, k] of this.layout.keys) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xb9c4d6, roughness: 0.3, metalness: 0.75,
        emissive: 0x000000, emissiveIntensity: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const h = 2.6 + ((108 - midi) / 87) * 6.5;
      mesh.scale.y = h;
      mesh.position.set(k.x + k.w / 2 - 26, 0, 2.2);
      g.add(mesh);
      this.strings.set(midi, { mesh, mat, baseX: k.x + k.w / 2 - 26, press: 0, hand: null });
    }
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(53.6, 0.9, 5.2),
      new THREE.MeshStandardMaterial({ color: 0x141021, roughness: 0.45, metalness: 0.3 })
    );
    board.position.set(0, -0.5, 2.6);
    g.add(board);
    const yoke = new THREE.Mesh(
      new THREE.BoxGeometry(53.6, 0.35, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.4, metalness: 0.5 })
    );
    yoke.position.set(0, 9.4, 2.2);
    g.add(yoke);
    g.visible = false;
    this.scene.add(g);
    this.deckStrings = g;
  }

  // a great flute lying across space: one tone hole per pitch
  #buildWind() {
    const g = new THREE.Group();
    this.holes = new Map();
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 53.8, 24),
      new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 0.35, metalness: 0.6 })
    );
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, 0.5, 2.4);
    g.add(tube);
    const lip = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 0.6, 24),
      new THREE.MeshStandardMaterial({ color: 0x6a563a, roughness: 0.3, metalness: 0.7 })
    );
    lip.rotation.z = Math.PI / 2;
    lip.position.set(-27, 0.5, 2.4);
    g.add(lip);
    const holeGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 16);
    for (const [midi, k] of this.layout.keys) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0a0805, roughness: 0.5, emissive: 0x000000, emissiveIntensity: 0,
      });
      const mesh = new THREE.Mesh(holeGeo, mat);
      mesh.position.set(k.x + k.w / 2 - 26, 1.32, k.black ? 1.9 : 2.55);
      g.add(mesh);
      this.holes.set(midi, { mesh, mat, baseY: 1.32, press: 0 });
    }
    g.visible = false;
    this.scene.add(g);
    this.deckWind = g;
  }

  #buildSpace() {
    // streaming starfield — slower than the notes for parallax depth
    const pos = new Float32Array(STAR_COUNT * 3);
    const col = new Float32Array(STAR_COUNT * 3);
    this.starVel = new Float32Array(STAR_COUNT);
    const tmp = new THREE.Color();
    for (let i = 0; i < STAR_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 220;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 120 + 18;
      pos[i * 3 + 2] = -Math.random() * 220 + 10;
      this.starVel[i] = 1.5 + Math.random() * 4.5;
      tmp.setHSL(0.55 + Math.random() * 0.15, 0.3, 0.55 + Math.random() * 0.35);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.85, fog: false })
    );
    this.scene.add(this.stars);

    // distant nebulas — soft tinted clouds that breathe with the piece
    const tex = makeGlowTexture();
    this.nebulas = [];
    for (const [x, y, z, s] of [[-60, 30, -160, 150], [70, 16, -180, 190], [0, 44, -200, 230]]) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, color: 0x3a5a9f, transparent: true, opacity: 0.16, fog: false, depthWrite: false })
      );
      sprite.position.set(x, y, z);
      sprite.scale.set(s, s * 0.55, 1);
      this.scene.add(sprite);
      this.nebulas.push(sprite);
    }
  }

  #buildLights() {
    this.scene.add(new THREE.AmbientLight(0x2a3a55, 1.1));
    const sun = new THREE.DirectionalLight(0xbcd2ff, 1.4);
    sun.position.set(4, 18, 16);
    this.scene.add(sun);
    this.lampL = new THREE.PointLight(0x45dca2, 0, 38, 1.6);
    this.lampL.position.set(-11, 4, 1);
    this.lampR = new THREE.PointLight(0x6fb7ff, 0, 38, 1.6);
    this.lampR.position.set(11, 4, 1);
    this.scene.add(this.lampL, this.lampR);
  }

  #buildParticles() {
    const MAX = 500;
    this.pMax = MAX;
    this.pData = []; // {life, vx, vy, vz}
    const pos = new Float32Array(MAX * 3).fill(9999);
    const col = new Float32Array(MAX * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.pPoints = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.22, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    );
    this.pHead = 0;
    this.scene.add(this.pPoints);
  }

  // ---------- piece ----------

  setPiece(piece) {
    this.spb = 60 / piece.bpm;
    this.piece = piece;
    this.notes = piece.notes
      .map(([midi, b, d, hand, vel]) => ({ midi, start: b * this.spb, end: (b + d) * this.spb, hand, vel }))
      .sort((a, b) => a.start - b.start);

    const cR = new THREE.Color(piece.colors.R.body);
    const cL = new THREE.Color(piece.colors.L.body);
    this.noteMats = {
      R: new THREE.MeshStandardMaterial({ color: cR.clone().multiplyScalar(0.32), emissive: cR, emissiveIntensity: 0.5, roughness: 0.35 }),
      L: new THREE.MeshStandardMaterial({ color: cL.clone().multiplyScalar(0.32), emissive: cL, emissiveIntensity: 0.5, roughness: 0.35 }),
      Rhot: new THREE.MeshStandardMaterial({ color: cR.clone().multiplyScalar(0.4), emissive: cR.clone().lerp(new THREE.Color(0xffffff), 0.15), emissiveIntensity: 0.85, roughness: 0.3 }),
      Lhot: new THREE.MeshStandardMaterial({ color: cL.clone().multiplyScalar(0.4), emissive: cL.clone().lerp(new THREE.Color(0xffffff), 0.15), emissiveIntensity: 0.85, roughness: 0.3 }),
    };
    this.handColors = { R: cR, L: cL };
    this.lampL.color.copy(cL);
    this.lampR.color.copy(cR);
    this.rail.material.color.copy(new THREE.Color(piece.accent)).multiplyScalar(0.55);
    const neb = new THREE.Color(piece.accent).lerp(new THREE.Color(0x223a6a), 0.55);
    for (const s of this.nebulas) s.material.color.copy(neb);

    this.deck = piece.deck || 'piano';
    this.deckPiano.visible = this.deck === 'piano';
    this.deckStrings.visible = this.deck === 'strings';
    this.deckWind.visible = this.deck === 'wind';
    this.reset();
  }

  reset() {
    for (const [, mesh] of this.live) this.#release(mesh);
    this.live.clear();
    this.scanFrom = 0;
    this.lastT = -4;
  }

  // ---------- play-mode input ----------

  /** Share a live map of midi -> {vel} for keys the user is holding. */
  setLiveInput(map) {
    this.liveInput = map;
  }

  /** Float a key-cap label over each mapped piano key (midi -> letter), or null to clear. */
  setKeyLabels(labels) {
    if (!this.labelGroup) {
      this.labelGroup = new THREE.Group();
      this.scene.add(this.labelGroup);
      this.labelTex = new Map();
    }
    for (const s of this.labelGroup.children) s.material.dispose();
    this.labelGroup.clear();
    if (!labels) return;
    for (const [midi, ch] of labels) {
      const k = this.layout.keys.get(midi);
      if (!k || !ch) continue;
      let tex = this.labelTex.get(ch);
      if (!tex) {
        tex = makeLabelTexture(ch);
        this.labelTex.set(ch, tex);
      }
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0.92 })
      );
      sprite.position.set(k.x + k.w / 2 - 26, k.black ? 1.0 : 0.55, k.black ? 2.6 : 4.7);
      sprite.scale.set(0.62, 0.62, 1);
      sprite.renderOrder = 10;
      this.labelGroup.add(sprite);
    }
  }

  // ---------- per-frame ----------

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(t, progress) {
    const dt = Math.min(Math.max(t - this.lastT, 0), 0.1) || 1 / 60;
    this.lastT = t;

    // weightless camera drift
    const ct = Math.max(t, 0);
    this.camera.position.set(
      Math.sin(ct * 0.11) * 1.1,
      8.2 + Math.sin(ct * 0.07) * 0.45,
      14.5
    );
    this.camera.lookAt(Math.sin(ct * 0.11) * 0.4, 1.0, -16);

    this.#updateStars(dt);
    this.#updateNotes(t);
    this.#updateKeys(t, dt);
    this.#updateParticles(dt);

    const breathe = 0.13 + 0.05 * Math.sin(ct * 0.25);
    for (const s of this.nebulas) s.material.opacity = breathe;

    this.composer.render();
    this.#drawProgress(progress);
  }

  #updateStars(dt) {
    const pos = this.stars.geometry.attributes.position;
    for (let i = 0; i < STAR_COUNT; i++) {
      let z = pos.array[i * 3 + 2] + this.starVel[i] * dt;
      if (z > 16) {
        z = -220 - Math.random() * 30;
        pos.array[i * 3] = (Math.random() - 0.5) * 220;
        pos.array[i * 3 + 1] = (Math.random() - 0.5) * 120 + 18;
      }
      pos.array[i * 3 + 2] = z;
    }
    pos.needsUpdate = true;
  }

  #updateNotes(t) {
    // spawn notes entering the horizon window
    while (this.scanFrom < this.notes.length && this.notes[this.scanFrom].start - t < FALL_S) {
      const n = this.notes[this.scanFrom++];
      if (t < n.end + 0.3) this.live.set(n, this.#acquire(n));
    }
    // rewind support (restart) is handled via reset()

    for (const [n, mesh] of this.live) {
      const zFront = -(n.start - t) * SPEED; // 0 at impact, negative while far
      const len = Math.max((n.end - n.start) * SPEED, 0.55);
      const sounding = t >= n.start && t < n.end;

      // while sounding the block keeps sliding under the rail and shrinks
      const consumed = Math.max(Math.min(zFront, len), 0);
      const remain = len - consumed;
      mesh.scale.z = Math.max(remain, 0.001);
      mesh.position.z = Math.min(zFront, 0) - remain / 2 - 0.1;
      mesh.material = sounding
        ? this.noteMats[n.hand + 'hot']
        : this.noteMats[n.hand];

      if (sounding && !n.burst) {
        n.burst = true;
        this.#burst(n);
      }
      if (t > n.end + 0.05 || remain <= 0.01) {
        this.#release(mesh);
        this.live.delete(n);
      }
    }
  }

  #acquire(n) {
    const k = this.layout.keys.get(n.midi);
    let mesh = this.pool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.noteMats?.R);
      this.scene.add(mesh);
    }
    mesh.visible = true;
    const black = k?.black;
    mesh.scale.set(black ? 0.5 : 0.84, black ? 0.42 : 0.5, 1);
    mesh.position.set((k ? k.x + k.w / 2 : 0) - 26, black ? 1.25 : 0.85, -HORIZON);
    n.burst = false;
    return mesh;
  }

  #release(mesh) {
    mesh.visible = false;
    this.pool.push(mesh);
  }

  #updateKeys(t, dt) {
    let energyL = 0, energyR = 0;
    const activeByMidi = new Map();
    for (const [n] of this.live) {
      if (t >= n.start && t < n.end) {
        activeByMidi.set(n.midi, n);
        if (n.hand === 'L') energyL += n.vel; else energyR += n.vel;
      }
    }
    // keys the user is physically holding override the scheduled lighting
    if (this.liveInput) {
      for (const [midi, v] of this.liveInput)
        activeByMidi.set(midi, { midi, hand: 'U', vel: v.vel ?? 0.8 });
    }
    const tNow = this.lastT;
    if (this.deck === 'piano') {
      for (const [midi, k] of this.keys) {
        const n = activeByMidi.get(midi);
        k.press += ((n ? 1 : 0) - k.press) * Math.min(dt * 18, 1);
        k.mesh.rotation.x = k.press * 0.055;
        if (n) {
          k.mat.emissive.copy(this.handColors?.[n.hand] || this.userColor);
          k.mat.emissiveIntensity = 0.55 * k.press * (0.5 + n.vel * 0.5);
        } else {
          k.mat.emissiveIntensity *= k.press < 0.02 ? 0 : 0.9;
        }
      }
    } else if (this.deck === 'strings') {
      for (const [midi, s] of this.strings) {
        const n = activeByMidi.get(midi);
        // strings keep ringing a moment after the note ends
        s.press += ((n ? 1 : 0) - s.press) * Math.min(dt * (n ? 22 : 2.2), 1);
        s.mesh.position.x = s.baseX + Math.sin(tNow * 55 + midi) * 0.07 * s.press;
        if (n) {
          s.mat.emissive.copy(this.handColors?.[n.hand] || this.userColor);
          s.mat.emissiveIntensity = 0.9 * (0.5 + n.vel * 0.5);
        } else {
          s.mat.emissiveIntensity *= 0.95;
        }
      }
    } else {
      for (const [midi, h] of this.holes) {
        const n = activeByMidi.get(midi);
        h.press += ((n ? 1 : 0) - h.press) * Math.min(dt * 16, 1);
        h.mesh.position.y = h.baseY + h.press * 0.16;
        if (n) {
          h.mat.emissive.copy(this.handColors?.[n.hand] || this.userColor);
          h.mat.emissiveIntensity = 1.1 * (0.4 + n.vel * 0.6);
        } else {
          h.mat.emissiveIntensity *= 0.9;
        }
      }
    }
    this.lampL.intensity = Math.min(energyL * 7, 16);
    this.lampR.intensity = Math.min(energyR * 7, 16);
  }

  #burst(n) {
    const k = this.layout.keys.get(n.midi);
    if (!k) return;
    const c = this.handColors[n.hand];
    const x = k.x + k.w / 2 - 26;
    const y = k.black ? 1.25 : 0.85;
    const count = 6 + Math.round(n.vel * 8);
    const pos = this.pPoints.geometry.attributes.position;
    const col = this.pPoints.geometry.attributes.color;
    for (let i = 0; i < count; i++) {
      const idx = this.pHead = (this.pHead + 1) % this.pMax;
      pos.array[idx * 3] = x + (Math.random() - 0.5) * 0.6;
      pos.array[idx * 3 + 1] = y + Math.random() * 0.2;
      pos.array[idx * 3 + 2] = 0.1;
      col.array[idx * 3] = c.r; col.array[idx * 3 + 1] = c.g; col.array[idx * 3 + 2] = c.b;
      this.pData[idx] = {
        life: 1,
        vx: (Math.random() - 0.5) * 3.5,
        vy: 2 + Math.random() * 4.5,
        vz: Math.random() * 2.5,
      };
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  #updateParticles(dt) {
    const pos = this.pPoints.geometry.attributes.position;
    const col = this.pPoints.geometry.attributes.color;
    for (let i = 0; i < this.pMax; i++) {
      const p = this.pData[i];
      if (!p || p.life <= 0) continue;
      p.life -= dt / 0.9;
      if (p.life <= 0) {
        pos.array[i * 3 + 1] = 9999;
        continue;
      }
      pos.array[i * 3] += p.vx * dt;
      pos.array[i * 3 + 1] += p.vy * dt;
      pos.array[i * 3 + 2] += p.vz * dt;
      p.vy -= 6 * dt;
      col.array[i * 3] *= 0.97; col.array[i * 3 + 1] *= 0.97; col.array[i * 3 + 2] *= 0.97;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  #drawProgress(progress) {
    // tiny DOM-free progress: reuse the bloom-friendly rail brightness instead
    // of a 2D overlay; the page already shows piece position via the rail glow.
    if (!this.progressEl) {
      this.progressEl = document.createElement('div');
      Object.assign(this.progressEl.style, {
        position: 'fixed', top: '0', left: '0', height: '2px', width: '0%',
        background: 'currentColor', opacity: '0.4', zIndex: 4, pointerEvents: 'none',
        transition: 'width 0.3s linear',
      });
      document.body.appendChild(this.progressEl);
    }
    this.progressEl.style.color = this.piece?.accent || '#6fb7ff';
    this.progressEl.style.width = `${Math.min(Math.max(progress, 0), 1) * 100}%`;
  }
}

function makeLabelTexture(ch) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.arc(48, 48, 40, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(7, 11, 22, 0.82)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(150, 190, 255, 0.85)';
  ctx.stroke();
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '600 42px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, 48, 50);
  return new THREE.CanvasTexture(c);
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
