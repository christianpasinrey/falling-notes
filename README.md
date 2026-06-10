# Falling Notes

A journey through space where the music is visible: a 3D piano floats among
streaming stars while glowing note-blocks arrive from deep space and land on
their key at the exact moment they sound. All audio is synthesized live in the
browser — no samples, no frameworks beyond three.js from a CDN, no build step.

**[▶ Listen & watch](https://christianpasinrey.github.io/falling-notes/)**

## The library

| Mood | Piece | |
| --- | --- | --- |
| morning | **Prelude in C, BWV 846** — J. S. Bach, 1722 | Mutopia Project engraving |
| dusk | **Gymnopédie № 1** — Erik Satie, 1888 | Mutopia Project engraving, repeat unfolded |
| mystery | **Gnossienne № 1** — Erik Satie, 1890 | Mutopia Project engraving |
| letter | **Für Elise** — L. v. Beethoven, 1810 | Mutopia Project engraving |
| rêverie | **Nocturne Op. 9 № 2** — F. Chopin, 1832 | Mutopia Project engraving |
| night | **Moonlight Sonata · I** — L. v. Beethoven, 1801 | Mutopia Project engraving |
| moonlight | **Clair de Lune** — Claude Debussy, 1905 | Mutopia Project engraving |
| storm | **L'estate · Presto** — Antonio Vivaldi, 1725 | piano-roll arrangement made for this page |
| dawn | **Aurora** — Claude, 2026 | an original piece: after the dusk and the storm, first light |

Autoplay chains the pieces; prev / next / pause controls float at the top.

## How it works

| File | Role |
| --- | --- |
| `js/synth.js` | Piano voice in pure Web Audio: harmonic periodic wave, hammer transient, two-stage singing decay, procedural hall reverb |
| `js/sequencer.js` | Look-ahead scheduler — notes are queued on the `AudioContext` clock for sample-accurate timing |
| `js/visualizer3d.js` | three.js space journey: perspective piano, volumetric notes, bloom, streaming starfield, nebulas |
| `js/visualizer2d.js` | Canvas 2D fallback when WebGL or the CDN are unavailable |
| `js/keyboard.js` | 88-key geometry (A0–C8) shared by both renderers |
| `js/pieces/` | Each piece as `[midi, beat, duration, hand, velocity]` data plus tempo and color palette |
| `tools/midi2data.mjs` | Converts a MIDI engraving into piece data through its full tempo map |

The visuals never drift from the audio because both derive from the same clock:
a note's position in space is a pure function of `AudioContext.currentTime`.

## Controls

- **click a card** — play
- **space / ⏯** — pause · resume
- **← →** — previous / next piece
- **r** — restart · **esc** — back to the menu

## Adding a piece

```bash
node tools/midi2data.mjs score.mid --id mypiece --hands 1:R,2:L > js/pieces/mypiece.data.js
```

Then wrap it with a small module declaring title, mood, tempo and colors
(see `js/pieces/bach846.js`) and register it in `js/pieces/index.js`.

## License

Code: MIT. All composers here are long in the public domain; the Vivaldi
arrangement and *Aurora* are released to the public domain as well.
