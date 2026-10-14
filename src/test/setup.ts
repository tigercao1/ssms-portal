import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

const NodeFormData = (
  await new Response('', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).formData()
).constructor as typeof FormData;

function readBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function toNodeBlob(blob: Blob): Promise<Blob> {
  const bytes = await readBytes(blob);
  return blob instanceof File
    ? (new NodeFile([bytes], blob.name, {
        type: blob.type,
        lastModified: blob.lastModified,
      }) as File)
    : (new NodeBlob([bytes], { type: blob.type }) as Blob);
}

async function toNodeBody(body: BodyInit): Promise<BodyInit> {
  if (body instanceof FormData) {
    const form = new NodeFormData();
    for (const [key, value] of body)
      form.append(
        key,
        typeof value === 'string' ? value : await toNodeBlob(value),
      );
    return form;
  }
  return body instanceof Blob ? toNodeBlob(body) : body;
}

function sendJsdomBodiesToNodeFetch() {
  const fetch = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    fetch(
      input,
      init?.body ? { ...init, body: await toNodeBody(init.body) } : init,
    );
}

if (typeof (Promise as { withResolvers?: unknown }).withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value: function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
  });
}

// MSW lifecycle (W3.5) — mock the NestJS API for feature tests.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
  sendJsdomBodiesToNodeFetch();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());
