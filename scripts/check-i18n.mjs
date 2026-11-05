// Lists Dutch texts used with t('…') that have no English translation in
// src/i18n/en.ts (they would show in Dutch for English users).
// Run: npm run check:i18n
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const en = readFileSync('src/i18n/en.ts', 'utf8');
const translated = new Set([...en.matchAll(/^\s*("(?:\\.|[^"\\])*"):/gm)].map((m) => JSON.parse(m[1])));

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx?$/.test(name) && !path.includes('i18n')) files.push(path);
  }
};
walk('src');

const call = /(?<![\w.])t\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
const missing = new Set();
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(call)) {
    const key = m[2].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
    if (!translated.has(key)) missing.add(`${file}: ${key}`);
  }
}
if (missing.size) {
  console.log(`${missing.size} text(s) without an English translation:\n` + [...missing].join('\n'));
  process.exit(1);
}
console.log('All t() texts have an English translation.');
