#!/usr/bin/env node
// Download every MIDI in assets/catalog.json into assets/midi/<id>[_n].mid.
// Resumable (skips existing), throttled, extracts .zip collections.
// Emits assets/files.json: { "<id>": ["<id>.mid", ...] }.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const catalog = JSON.parse(readFileSync('assets/catalog.json', 'utf8'));
mkdirSync('assets/midi', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const files = existsSync('assets/files.json')
  ? JSON.parse(readFileSync('assets/files.json', 'utf8'))
  : {};

let done = 0, failed = 0, skipped = 0;
for (const p of catalog) {
  const key = String(p.id);
  if (files[key]?.length && files[key].every((f) => existsSync('assets/midi/' + f))) {
    skipped++;
    continue;
  }
  const url = 'https://www.mutopiaproject.org/ftp/' + p.mid;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());

    if (p.mid.endsWith('.zip')) {
      const tmp = `assets/midi/_tmp_${key}`;
      mkdirSync(tmp, { recursive: true });
      writeFileSync(`${tmp}/a.zip`, buf);
      execFileSync('unzip', ['-o', '-j', '-q', `${tmp}/a.zip`, '-d', tmp], { stdio: 'ignore' });
      const mids = readdirSync(tmp).filter((f) => f.toLowerCase().endsWith('.mid')).sort();
      files[key] = mids.map((f, i) => {
        const name = mids.length > 1 ? `${key}_${i + 1}.mid` : `${key}.mid`;
        renameSync(`${tmp}/${f}`, `assets/midi/${name}`);
        return name;
      });
      rmSync(tmp, { recursive: true, force: true });
    } else {
      writeFileSync(`assets/midi/${key}.mid`, buf);
      files[key] = [`${key}.mid`];
    }
    done++;
  } catch (e) {
    failed++;
    process.stderr.write(`\nFAIL ${key} ${p.mid}: ${e.message}\n`);
  }
  if ((done + failed) % 25 === 0) {
    writeFileSync('assets/files.json', JSON.stringify(files));
    process.stderr.write(`\r${done} downloaded, ${skipped} skipped, ${failed} failed   `);
  }
  await sleep(150);
}
writeFileSync('assets/files.json', JSON.stringify(files));
console.error(`\ndone: ${done} downloaded, ${skipped} already present, ${failed} failed`);
