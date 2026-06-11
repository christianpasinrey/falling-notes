// Composition root: pick a renderer, then wire the feature modules together.
// All shared state lives in app.js; each module owns one concern —
//   playmode.js  input, judging, HUD, mode selector
//   voices.js    per-voice mute / pick-what-you-play panel
//   rhythm.js    metronome, drum grooves, playback speed
//   player.js    playlist, piece lifecycle, transport, frame loop
//   library.js   featured cards, Mutopia explorer, local MIDI files

import { app } from './app.js';
import { initPlayMode, liveInput } from './playmode.js';
import { initVoices } from './voices.js';
import { initRhythm } from './rhythm.js';
import { initPlayer } from './player.js';
import { initLibrary } from './library.js';
import { initPlayground } from './playground.js';

// Prefer the WebGL space journey; fall back to the 2D highway if WebGL or
// the three.js CDN are unavailable.
const stage = document.getElementById('stage');
try {
  const { Visualizer3D } = await import('./visualizer3d.js');
  app.viz = new Visualizer3D(stage);
} catch (err) {
  console.warn('3D renderer unavailable, using 2D fallback:', err);
  const { Visualizer } = await import('./visualizer2d.js');
  app.viz = new Visualizer(stage);
}
app.viz.setLiveInput(liveInput);

initPlayMode();
initVoices();
initRhythm();
initPlayer();
initLibrary();
initPlayground();
