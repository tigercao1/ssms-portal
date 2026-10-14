import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import type { Plugin } from 'vite';

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'docs-worker/**'],
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
