import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const MIN_OCCURRENCES = 5000;

const files = (await readdir(DATA_DIR)).filter((name) => /^yob\d{4}\.txt$/.test(name));
const counts = new Map();

for (const file of files) {
    const text = await readFile(join(DATA_DIR, file), 'utf8');
    for (const line of text.split('\n')) {
        const parts = line.trim().split(',');
        if (parts.length < 3) {
            continue;
        }
        const name = parts[0].trim();
        const count = Number.parseInt(parts[2], 10);
        if (!name || Number.isNaN(count)) {
            continue;
        }
        counts.set(name, (counts.get(name) || 0) + count);
    }
}

const names = [...counts.entries()]
    .filter(([, total]) => total >= MIN_OCCURRENCES)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));

const outPath = join(DATA_DIR, 'names.json');
await writeFile(outPath, `${JSON.stringify(names)}\n`);
console.log(`Wrote ${names.length} names to data/names.json`);
