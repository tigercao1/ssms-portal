import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] ?? 'dist-sign';
const FORBIDDEN = [
  'supabase',
  'posthog',
  'pdfjs',
  'react-router',
  '@tanstack',
  '/admin/',
  '/instructor/',
  '/login',
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const found = files(DIST)
  .filter((path) => /\.(js|html|css)$/.test(path))
  .flatMap((path) => {
    const source = readFileSync(path, 'utf8').toLowerCase();
    return FORBIDDEN.filter((marker) => source.includes(marker)).map(
      (marker) => `${path}: ${marker}`,
    );
  });

if (found.length) {
  console.error(
    `Portal code found in the signing site build:\n${found.join('\n')}`,
  );
  process.exit(1);
}
console.log(`${DIST}: no portal code found`);
