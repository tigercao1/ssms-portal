import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] ?? 'dist-sign';
const SIGN_API =
  process.env.VITE_SIGN_API_BASE_URL || 'https://sign-api.ssnow.club';
const PORTAL_API = process.env.VITE_API_BASE_URL || 'https://api.ssnow.club';
const FORBIDDEN = [
  PORTAL_API.toLowerCase(),
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

const sources = files(DIST)
  .filter((path) => /\.(js|html|css)$/.test(path))
  .map((path) => [path, readFileSync(path, 'utf8').toLowerCase()]);
const found = sources.flatMap(([path, source]) =>
  FORBIDDEN.filter((marker) => source.includes(marker)).map(
    (marker) => `${path}: ${marker}`,
  ),
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
