import { posthogUpstream } from '../../src/lib/posthogProxy';

export interface Env {
  ASSETS: Fetcher;
}

const STRIPPED_REQUEST_HEADERS = ['cookie', 'authorization'];

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const upstream = posthogUpstream(new URL(request.url));
    if (!upstream) return env.ASSETS.fetch(request);
    return upstream.isAsset
      ? fetchPosthogAsset(request, upstream.url, ctx)
      : forwardToPosthog(request, upstream.url);
  },
} satisfies ExportedHandler<Env>;

async function fetchPosthogAsset(
  request: Request,
  upstream: string,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== 'GET')
    return fetch(upstream, { method: request.method });
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(upstream);
  if (response.ok) ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

async function forwardToPosthog(
  request: Request,
  upstream: string,
): Promise<Response> {
  const headers = new Headers(request.headers);
  for (const name of STRIPPED_REQUEST_HEADERS) headers.delete(name);
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) headers.set('X-Forwarded-For', clientIp);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return fetch(upstream, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : null,
    redirect: request.redirect,
  });
}
