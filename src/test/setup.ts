import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw';
import { File as NodeFile } from 'node:buffer';

const NodeFormData = (
  await new Response('', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).formData()
).constructor as typeof FormData;

async function toNodeFormData(form: FormData): Promise<FormData> {
  const nodeForm = new NodeFormData();
  for (const [key, value] of form)
    nodeForm.append(
      key,
      typeof value === 'string'
        ? value
        : (new NodeFile([await value.arrayBuffer()], value.name, {
            type: value.type,
            lastModified: value.lastModified,
          }) as File),
    );
  return nodeForm;
}

function sendJsdomFormDataToNodeFetch() {
  const fetch = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    fetch(
      input,
      init?.body instanceof FormData
        ? { ...init, body: await toNodeFormData(init.body) }
        : init,
    );
}

// MSW lifecycle (W3.5) — mock the NestJS API for feature tests.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
  sendJsdomFormDataToNodeFetch();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());
