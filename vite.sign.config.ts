import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from './tailwind.config';
import { fileURLToPath, URL } from 'node:url';
import { mockSignForm } from './src/sign/mock/fixtures';

const SIGN_CONTENT = [
  './sign/index.html',
  './sign/main.tsx',
  './src/sign/**/*.{ts,tsx}',
  './src/components/Button.tsx',
  './src/components/Input.tsx',
];
const MOCK_API_PATH = '/mock-api';
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
        const match = /^\/sign\/forms\/([^/]+)(\/complete)?$/.exec(
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
        if (!match[2])
          return send(200, {
            ...mockSignForm(
              url.searchParams.get('lang') === 'en' ? 'en' : 'zh',
            ),
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

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('./sign', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: 'public',
  plugins: [react(), ...(mode === 'mock' ? [signMockApi()] : [])],
  define:
    mode === 'mock'
      ? { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(MOCK_API_PATH) }
      : {},
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
