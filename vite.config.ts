import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import type { Plugin, ProxyOptions } from 'vite';
import {
  POSTHOG_API_ORIGIN,
  POSTHOG_ASSETS_ORIGIN,
  POSTHOG_PROXY_PATH,
  posthogUpstreamPath,
} from './src/lib/posthogProxy';

const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const pdfjsRoot = fileURLToPath(
  new URL('./node_modules/pdfjs-dist/', import.meta.url),
);

/** Serves pdf.js CMaps, fonts, wasm and ICC profiles at /pdfjs/ and copies them into the build. */
function pdfjsAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pdfjs-assets',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (req, res, next) => {
        const rel = normalize(
          decodeURIComponent((req.url ?? '').split('?')[0] ?? ''),
        );
        const [dir] = rel.replace(/^[/\\]+/, '').split(/[/\\]/);
        const file = join(pdfjsRoot, rel);
        if (
          !dir ||
          !PDFJS_ASSET_DIRS.includes(dir) ||
          !file.startsWith(pdfjsRoot)
        )
          return next();
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        if (file.endsWith('.wasm'))
          res.setHeader('Content-Type', 'application/wasm');
        createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      for (const dir of PDFJS_ASSET_DIRS) {
        cpSync(join(pdfjsRoot, dir), join(outDir, 'pdfjs', dir), {
          recursive: true,
        });
      }
    },
  };
}

function posthogTarget(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    rewrite: (path) => {
      const queryStart = path.search(/[?#]/);
      const pathname = queryStart === -1 ? path : path.slice(0, queryStart);
      const query = queryStart === -1 ? '' : path.slice(queryStart);
      return `${posthogUpstreamPath(pathname) ?? pathname}${query}`;
    },
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.removeHeader('cookie');
        proxyReq.removeHeader('authorization');
      });
    },
  };
}

const posthogDevProxy: Record<string, ProxyOptions> = {
  [`${POSTHOG_PROXY_PATH}/static/`]: posthogTarget(POSTHOG_ASSETS_ORIGIN),
  [`${POSTHOG_PROXY_PATH}/array/`]: posthogTarget(POSTHOG_ASSETS_ORIGIN),
  [`${POSTHOG_PROXY_PATH}/`]: posthogTarget(POSTHOG_API_ORIGIN),
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, proxy: posthogDevProxy },
  preview: { proxy: posthogDevProxy },
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'docs-worker/**', 'worker/**'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Provide stable env so the supabase client + api base resolve in tests.
    env: {
      VITE_API_BASE_URL: 'http://localhost:3000',
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      thresholds: { lines: 50, statements: 50 },
    },
  },
});
