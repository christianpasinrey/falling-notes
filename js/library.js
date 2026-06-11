// Everything the menu offers to play: the featured cards, the Mutopia
// explorer, and the user's own MIDI files (picked or dropped — never uploaded).

import { PIECES } from './pieces/index.js';
import { loadCatalog, loadCatalogPiece, buildPieceFromMidiSet } from './catalog.js';
import { play } from './player.js';
import { setMode } from './playmode.js';
import { decodeRecording } from './recording.js';

const overlay = document.getElementById('overlay');
const piecesEl = document.getElementById('pieces');
const explorer = document.getElementById('explorer');
const exSearch = document.getElementById('ex-search');
const exList = document.getElementById('ex-list');
const exCount = document.getElementById('ex-count');

const featured = PIECES.map((p) => ({ label: p.title, load: async () => p }));

export function initLibrary() {
  // — featured cards —
  PIECES.forEach((piece, i) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.style.setProperty('--accent', piece.accent);
    for (const field of ['mood', 'title', 'composer', 'marking', 'duration']) {
      const span = document.createElement('span');
      span.className = field;
      span.textContent = piece[field];
      card.appendChild(span);
    }
    card.addEventListener('click', () => play(featured, i));
    piecesEl.appendChild(card);
  });

  // — Mutopia explorer —
  document.getElementById('explore-btn').addEventListener('click', async () => {
    overlay.classList.add('exploring');
    explorer.hidden = false;
    exSearch.focus();
    if (!allItems) {
      exCount.textContent = 'loading the library…';
      ({ items: allItems } = await loadCatalog());
      renderExplorer('');
    }
  });
  document.getElementById('ex-back').addEventListener('click', closeExplorer);
  exSearch.addEventListener('input', () => renderExplorer(exSearch.value));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden') && !explorer.hidden) closeExplorer();
  });

  // — open your own MIDI: file picker + drop anywhere —
  const midiFile = document.getElementById('midi-file');
  document.getElementById('open-midi-btn').addEventListener('click', () => midiFile.click());
  midiFile.addEventListener('change', () => {
    loadLocalMidi(midiFile.files);
    midiFile.value = ''; // so picking the same files again still fires change
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    loadLocalMidi(e.dataTransfer.files);
  });

  // — a shared playground recording arrived in the URL: front and centre —
  if (location.hash.startsWith('#r=')) {
    decodeRecording(location.hash.slice(3)).then((piece) => {
      if (!piece) return;
      const modal = document.getElementById('shared-modal');
      const playIt = () => {
        modal.hidden = true;
        play([{ label: piece.title, load: async () => piece }], 0);
      };
      document.getElementById('sm-meta').textContent =
        `${piece.notes.length} notes · ${piece.duration} — played in the Falling Notes playground`;
      document.getElementById('sm-listen').addEventListener('click', () => {
        setMode('listen');
        playIt();
      });
      document.getElementById('sm-practice').addEventListener('click', () => {
        setMode('practice');
        playIt();
      });
      document.getElementById('sm-close').addEventListener('click', () => {
        modal.hidden = true;
        addSharedCard(piece); // still reachable from the menu afterwards
      });
      modal.hidden = false;
    });
  }
}

function addSharedCard(piece) {
  const card = document.createElement('button');
  card.className = 'card shared-card';
  card.style.setProperty('--accent', piece.accent);
  for (const [cls, text] of [
    ['mood', '♪ shared'],
    ['title', piece.title],
    ['composer', piece.composer],
    ['marking', 'press play — or learn it in practice mode'],
    ['duration', piece.duration],
  ]) {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    card.appendChild(span);
  }
  card.addEventListener('click', () => play([{ label: piece.title, load: async () => piece }], 0));
  piecesEl.prepend(card);
}

function closeExplorer() {
  overlay.classList.remove('exploring');
  explorer.hidden = true;
}

let allItems = null;
let shownItems = [];

function renderExplorer(query) {
  const q = query.trim().toLowerCase();
  shownItems = !q
    ? allItems
    : allItems.filter((it) =>
        `${it.label} ${it.entry.composer} ${it.entry.instruments} ${it.entry.style}`.toLowerCase().includes(q)
      );

  exList.replaceChildren();
  const cap = 120;
  for (const it of shownItems.slice(0, cap)) {
    const row = document.createElement('button');
    row.className = 'ex-row';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = it.label;
    const c = document.createElement('span');
    c.className = 'c';
    c.textContent = it.entry.composer;
    const i = document.createElement('span');
    i.className = 'i';
    i.textContent = `${it.entry.instruments} · ${it.entry.style}`;
    row.append(t, c, i);
    row.addEventListener('click', () => {
      const list = shownItems;
      play(
        list.map((x) => ({ label: x.label, load: () => loadCatalogPiece(x) })),
        list.indexOf(it)
      );
    });
    exList.appendChild(row);
  }
  exCount.textContent =
    shownItems.length > cap
      ? `showing ${cap} of ${shownItems.length} pieces — keep typing to narrow down`
      : `${shownItems.length} ${shownItems.length === 1 ? 'piece' : 'pieces'}`;
}

// One file plays as-is (its tracks are the voices); several files merge into
// one piece where each FILE is a voice — mixing unrelated songs is on you.
async function loadLocalMidi(fileList) {
  const picked = [...(fileList || [])].filter((f) => /\.(mid|midi|kar)$/i.test(f.name));
  if (!picked.length) return;
  const files = await Promise.all(picked.map(async (f) => ({ buf: await f.arrayBuffer(), name: f.name })));
  play(
    [{
      label: picked.length === 1 ? picked[0].name : `${picked.length} MIDI files`,
      load: async () => buildPieceFromMidiSet(files),
    }],
    0
  );
}
