#!/usr/bin/env node
// Crawl the Mutopia Project listing into assets/catalog.json.
// Polite: one page (10 pieces) per ~400ms. Run: node tools/crawl_mutopia.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://www.mutopiaproject.org/cgibin/make-table.cgi';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

const pieces = [];
for (let startat = 0; ; startat += 10) {
  const url = `${BASE}?startat=${startat}&searchingfor=&preview=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} at startat=${startat}`);
  const html = await res.text();

  const blocks = html.split('<table class="table-bordered result-table">').slice(1);
  if (blocks.length === 0) break;

  for (const block of blocks) {
    const rows = [...block.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
      [...m[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => c[1])
    );
    if (rows.length < 4) continue;
    const [r1, r2, r3] = rows;
    const id = (block.match(/piece-info\.cgi\?id=(\d+)/) || [])[1];
    // anchor on the link text — the first .zip in a block can be LilyPond sources
    const mid = (block.match(/href="(https:\/\/www\.mutopiaproject\.org\/ftp\/[^"]+?\.(?:mid|zip))">\s*\.mid files?/) || [])[1];
    if (!id || !mid) continue;
    pieces.push({
      id: Number(id),
      title: strip(r1[0]),
      composer: strip(r1[1]).replace(/^by\s+/, ''),
      opus: strip(r1[2] || ''),
      instruments: strip((r2[0] || '').replace(/^for\s+/i, '')).replace(/^for\s+/i, ''),
      style: strip(r2[2] || ''),
      license: strip(r3[1] || ''),
      date: strip(r3[3] || ''),
      mid: mid.replace('https://www.mutopiaproject.org/ftp/', ''),
    });
  }
  process.stderr.write(`\rstartat=${startat}  pieces=${pieces.length}   `);
  await sleep(400);
}

pieces.sort((a, b) => a.id - b.id);
mkdirSync('assets', { recursive: true });
writeFileSync('assets/catalog.json', JSON.stringify(pieces));
console.error(`\ndone: ${pieces.length} pieces -> assets/catalog.json`);
