import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from './tailwind.config';
import { fileURLToPath, URL } from 'node:url';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mockSignForm, mockSignFormWithPdf } from './src/sign/mock/fixtures';

const SIGN_CONTENT = [
  './sign/index.html',
  './sign/main.tsx',
  './src/sign/**/*.{ts,tsx}',
  './src/components/Button.tsx',
  './src/components/Input.tsx',
];
const MOCK_API_PATH = '/mock-api';
const PRODUCTION_SIGN_API_BASE_URL = 'https://sign-api.ssnow.club';
const MOCK_PLAIN_SLUG = 'plain';
const MOCK_PDF_PATH = '/files/original.pdf';
const PDF_ASSET_DIRS = ['cmaps', 'standard_fonts'];
const pdfjsRoot = fileURLToPath(
  new URL('./node_modules/pdfjs-dist/', import.meta.url),
);
const MOCK_SUBMIT_STATUS: Record<string, number> = {
  stale: 409,
  invalid: 400,
  throttled: 429,
};

function signMockApi(): Plugin {
  return {
    name: 'sign-mock-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(MOCK_API_PATH, (req, res) => {
        const url = new URL(req.url ?? '/', 'http://mock');
        if (url.pathname === MOCK_PDF_PATH) {
          res.setHeader('Content-Type', 'application/pdf');
          return res.end(
            readFileSync(
              new URL('./src/sign/mock/original.pdf', import.meta.url),
            ),
          );
        }
        const match = /^\/sign\/forms\/([^/]+)(\/complete|\/original)?$/.exec(
          url.pathname,
        );
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        const slug = match?.[1];
        if (!slug || slug === 'missing')
          return send(404, { message: 'Not found' });
        const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
        if (match[2] === '/original')
          return send(200, {
            url: `${MOCK_API_PATH}${MOCK_PDF_PATH}`,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          });
        if (!match[2])
          return send(200, {
            ...(slug === MOCK_PLAIN_SLUG
              ? mockSignForm(lang)
              : mockSignFormWithPdf(lang)),
            slug,
          });
        const status = MOCK_SUBMIT_STATUS[slug];
        return status
          ? send(status, {
              statusCode: status,
              message: 'Field Email (email) must be an email',
              error: 'Mock error',
            })
          : send(201, { status: 'signed', emailed: true });
      });
    },
  };
}

function pdfjsAssets(): Plugin {
  let outDir = '';
  return {
    name: 'sign-pdfjs-assets',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      for (const dir of PDF_ASSET_DIRS)
        server.middlewares.use(`/pdfjs/${dir}/`, (req, res, next) => {
          const name = (req.url ?? '').split('?')[0]?.replace(/^\/+/, '');
          if (!name || !/^[\w.-]+$/.test(name)) return next();
          try {
            res.end(readFileSync(join(pdfjsRoot, dir, name)));
          } catch {
            next();
          }
        });
    },
    writeBundle() {
      for (const dir of PDF_ASSET_DIRS)
        cpSync(join(pdfjsRoot, dir), join(outDir, 'pdfjs', dir), {
          recursive: true,
        });
    },
  };
}

const ENV_DIR = fileURLToPath(new URL('.', import.meta.url));

function signApiBaseUrl(mode: string) {
  if (mode === 'mock') return MOCK_API_PATH;
  const { VITE_SIGN_API_BASE_URL } = loadEnv(mode, ENV_DIR, 'VITE_SIGN_');
  if (VITE_SIGN_API_BASE_URL) return VITE_SIGN_API_BASE_URL;
  return mode === 'production' ? PRODUCTION_SIGN_API_BASE_URL : '';
}

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('./sign', import.meta.url)),
  envDir: ENV_DIR,
  publicDir: 'public',
  plugins: [
    react(),
    pdfjsAssets(),
    ...(mode === 'mock' ? [signMockApi()] : []),
  ],
  define: {
    'import.meta.env.VITE_SIGN_API_BASE_URL': JSON.stringify(
      signApiBaseUrl(mode),
    ),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({ ...tailwindConfig, content: SIGN_CONTENT }),
        autoprefixer(),
      ],
    },
  },
  server: { port: 5174 },
  build: {
    outDir: fileURLToPath(new URL('./dist-sign', import.meta.url)),
    emptyOutDir: true,
  },
}));
