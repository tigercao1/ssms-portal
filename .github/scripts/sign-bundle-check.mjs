import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const DIST = process.argv[2] ?? 'dist-sign';
const SIGN_API =
  process.env.VITE_SIGN_API_BASE_URL || 'https://sign-api.ssnow.club';
const PORTAL_API = process.env.VITE_API_BASE_URL || 'https://api.ssnow.club';
const FORBIDDEN = [
  PORTAL_API.toLowerCase(),
  'supabase',
  'posthog',
  'react-router',
  '@tanstack',
  '/admin/',
  '/instructor/',
  '/login',
];

const INITIAL_ONLY_FORBIDDEN = ['pdfjs', 'pdf.worker'];
const ASSET_REFERENCE = /(?:src|href)="\/([^"]+\.(?:js|css))"/g;
const STATIC_IMPORT =
  /(?:^|[;}\s])(?:import|export)\s*(?:[\w${},*\s]+from\s*)?["'](\.\.?\/[^"']+)["']/g;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function initialFiles() {
  const html = join(DIST, 'index.html');
  const queue = [html];
  for (const [, ref] of readFileSync(html, 'utf8').matchAll(ASSET_REFERENCE))
    queue.push(join(DIST, ref));
  const seen = new Set();
  while (queue.length) {
    const path = normalize(queue.shift());
    if (seen.has(path)) continue;
    seen.add(path);
    if (!path.endsWith('.js')) continue;
    for (const [, ref] of readFileSync(path, 'utf8').matchAll(STATIC_IMPORT))
      queue.push(join(dirname(path), ref));
  }
  return seen;
}

const initial = initialFiles();
const sources = files(DIST)
  .filter((path) => !normalize(path).startsWith(join(DIST, 'pdfjs')))
  .filter((path) => /\.(js|html|css)$/.test(path))
  .map((path) => [path, readFileSync(path, 'utf8').toLowerCase()]);
const found = sources.flatMap(([path, source]) =>
  [
    ...FORBIDDEN,
    ...(initial.has(normalize(path)) ? INITIAL_ONLY_FORBIDDEN : []),
  ]
    .filter((marker) => source.includes(marker))
    .map((marker) => `${path}: ${marker}`),
);

if (!sources.some(([, source]) => source.includes(SIGN_API.toLowerCase()))) {
  console.error(`${SIGN_API} not found in the signing site build`);
  process.exit(1);
}
if (found.length) {
  console.error(
    `Portal code found in the signing site build:\n${found.join('\n')}`,
  );
  process.exit(1);
}
console.log(`${DIST}: no portal code found`);
