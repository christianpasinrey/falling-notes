# Falling Notes

A journey through space where the music is visible — and playable. A 3D piano
floats among streaming stars while glowing note-blocks arrive from deep space
and land on their key at the exact moment they sound. Listen to the library,
or plug in a MIDI keyboard (or just use your computer keys) and play the
pieces yourself. All audio is synthesized live in the browser — no samples,
no frameworks beyond three.js from a CDN, no build step, nothing uploaded.

**[▶ Listen · play · practice](https://christianpasinrey.github.io/falling-notes/)**

## Three modes

| Mode | What happens |
| --- | --- |
| **✧ listen** | The piano plays itself; sit back and watch the notes land |
| **♪ play** | The piece falls silent — you supply the sound and get scored: ±180 ms hit window, perfect/good/miss, combo multiplier |
| **❋ practice** | Synthesia-style learning: the piece freezes at the next unplayed note or chord, names it in the HUD (and the computer key that plays it), pulses the target key on the piano, and resumes the instant you hit it |

Modes can be switched from the menu or mid-piece from the floating controls —
the piece restarts in the chosen mode.

## Playing it yourself

- **USB MIDI keyboard** — detected via the Web MIDI API (Chrome, Edge,
  Firefox; hot-plug supported, sustain pedal included). Exact notes required.
- **Computer keyboard** — the classic DAW dual-manual mapping: `Z X C V B N M`
  are the lower octave's white keys (blacks on `S D G H J`), `Q W E R T Y U I
  O P` the upper (blacks on `2 3 5 6 7 9 0`). Held **left/right Shift** reach
  two octaves down/up, `↑/↓` relocate home, and every reachable key shows its
  key-cap (or shift-combo) right on the piano. The home octave auto-fits each
  piece's range, and scoring folds octaves — the right pitch class counts from
  any octave.

## Voices

Any piece with more than one voice (hands, staves, MIDI tracks) gets a voices
panel in the controls: while listening, mute or unmute each voice; while
playing or practicing, choose which voice is *yours* — it falls silent and is
the one you are judged on while the others accompany you.

## Your own MIDI files

The **♬ open your own MIDI file** button (or dropping `.mid` files anywhere on
the page) plays local files instantly: parsed in the browser through their
full tempo map, never uploaded. Drop **several files at once** and they merge
into a single piece — each file becomes a voice, aligned at t=0, so
split-track songs work naturally (and mixing unrelated songs is your own
beautiful problem).

## Playground

Free play: no falling notes, just the piano (and any groove/tempo you pick)
responding to what you press. Hit **⏺ record** and when you stop you can
**download the audio** of your take or **copy a share link** — the notes are
compressed into the URL itself, so there is no upload and no server: whoever
opens the link gets your recording as a playable piece, falling notes and all,
ready to listen to or learn in practice mode.

## The library

Nine featured pieces — Bach, Satie, Beethoven, Chopin, Debussy, Vivaldi and an
original dawn — plus **all 2124 pieces of the
[Mutopia Project](https://www.mutopiaproject.org/)** through a searchable
explorer (title, composer, instrument, style). Each engraving's MIDI loads on
demand and every track is voiced by instrument family — percussive piano,
plucked or bowed strings, winds, organ, voice — while everything lands on the
3D piano, the instrument a MIDI keyboard player actually has. Every piece
keeps its license metadata as published by Mutopia. This page is a homage to
that project: decades of volunteer engraving, made visible.

## How it works

| File | Role |
| --- | --- |
| `js/synth.js` | Web Audio instrument voices: harmonic periodic waves, hammer transient, two-stage decay, procedural hall reverb — plus live noteOn/noteOff voices and sustain pedal for the player |
| `js/sequencer.js` | Look-ahead scheduler on the `AudioContext` clock; per-voice muting, player-voice silence, and a practice hold that pins song-time at the next gate |
| `js/input.js` | Live input: Web MIDI (hot-plug, pedal) and the QWERTY dual-manual mapping with shift octaves and per-piece auto-fit |
| `js/judge.js` | Scoring: timed hit windows, combo, octave folding for QWERTY, and the practice gate (next unplayed note/chord) |
| `js/visualizer3d.js` | three.js space journey: perspective piano, volumetric notes, bloom, starfield, key-cap labels, pulsing practice targets |
| `js/visualizer2d.js` | Canvas 2D fallback with the same play-mode features when WebGL is unavailable |
| `js/keyboard.js` | 88-key geometry (A0–C8) shared by both renderers |
| `js/midi.js` + `js/catalog.js` | Browser-side Standard MIDI File parsing (full tempo map) and piece building — for the catalog, single local files, and multi-file merges |
| `js/pieces/` | Featured pieces as `[midi, beat, duration, hand, velocity]` data plus tempo and palette |
| `tools/` | Mutopia crawler, MIDI mirror, and `midi2data.mjs` converter |

The visuals never drift from the audio because both derive from the same
clock: a note's position in space is a pure function of
`AudioContext.currentTime`.

## Controls

- **click a card** — play · **✧ ♪ ❋** — switch mode (menu or in-piece)
- **space / ⏯** — pause · resume · **← →** — previous / next piece
- **esc** — back to the menu · **r** — restart (listen mode)
- **≡** — voices panel: mute tracks, or pick the one you play
- **drop a `.mid` file (or several) anywhere** — play your own music

## Adding a featured piece

```bash
node tools/midi2data.mjs score.mid --id mypiece --hands 1:R,2:L > js/pieces/mypiece.data.js
```

Then wrap it with a small module declaring title, mood, tempo and colors
(see `js/pieces/bach846.js`) and register it in `js/pieces/index.js`.

## License

Code: MIT. All featured composers are long in the public domain; the Vivaldi
arrangement and *Aurora* are released to the public domain as well. Mutopia
pieces carry their own Public Domain or Creative Commons licenses. The piano
sound uses samples from the
[Salamander Grand Piano](https://github.com/sfzinstruments/SalamanderGrandPiano)
by Alexander Holm (CC-BY), loaded progressively with the procedural synth as
fallback; every other instrument remains pure Web Audio synthesis.
