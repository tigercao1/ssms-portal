import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';

const API = 'https://api.github.com/repos/tigercao1/ssms-api';
const MAIN = ['c1', 'c2', 'c3', 'c4'];
const APP_DEPLOY = { environment: 'production-app-deploys', task: 'deploy:app' };
const PRODUCTION_JOB = { environment: 'production', task: 'deploy' };

let pulls;
let deployments;

function merged(number, mergeCommit) {
  pulls.set(number, {
    number,
    state: 'closed',
    merged: true,
    merge_commit_sha: mergeCommit,
  });
}

function opened(number) {
  pulls.set(number, {
    number,
    state: 'open',
    merged: false,
    merge_commit_sha: null,
  });
}

function deployed(record, sha) {
  deployments.unshift({ id: deployments.length + 1, ...record, sha });
}

function compareStatus(base, head) {
  const diff = MAIN.indexOf(head) - MAIN.indexOf(base);
  if (diff === 0) return 'identical';
  return diff > 0 ? 'ahead' : 'behind';
}

async function evaluate(body) {
  vi.resetModules();
  const script = await import('./api-dependency.mjs');
  return script.evaluate({ body });
}

beforeEach(() => {
  pulls = new Map();
  deployments = [];
  server.use(
    http.get(`${API}/pulls/:number`, ({ params }) => {
      const pr = pulls.get(Number(params.number));
      return pr
        ? HttpResponse.json(pr)
        : new HttpResponse(null, { status: 404 });
    }),
    http.get(`${API}/deployments`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      return HttpResponse.json(
        deployments.filter(
          (d) =>
            d.environment === query.get('environment') &&
            (!query.has('task') || d.task === query.get('task')),
        ),
      );
    }),
    http.get(`${API}/deployments/:id/statuses`, () =>
      HttpResponse.json([{ state: 'success' }]),
    ),
    http.get(`${API}/compare/:range`, ({ params }) => {
      const [base, head] = String(params.range).split('...');
      return HttpResponse.json({ status: compareStatus(base, head) });
    }),
  );
});

describe('API dependency', () => {
  it('passes once the Release has deployed a commit containing the merge commit', async () => {
    merged(60, 'c2');
    deployed(APP_DEPLOY, 'c3');

    await expect(evaluate('Requires API: ssms-api#60')).resolves.toMatchObject({
      state: 'success',
      description: 'All deployed: ssms-api#60',
    });
  });

  it('stays pending when only backup or migration jobs have run on the merge commit', async () => {
    merged(60, 'c3');
    deployed(APP_DEPLOY, 'c1');
    deployed(PRODUCTION_JOB, 'c3');
    deployed(PRODUCTION_JOB, 'c3');

    await expect(evaluate('Requires API: ssms-api#60')).resolves.toMatchObject({
      state: 'pending',
      description:
        'ssms-api#60 merged, waiting for the API Release to deploy it',
    });
  });

  it('stays pending when the app has never been deployed by the Release', async () => {
    merged(60, 'c3');
    deployed(PRODUCTION_JOB, 'c3');

    await expect(evaluate('Requires API: ssms-api#60')).resolves.toMatchObject({
      state: 'pending',
      description: 'ssms-api#60 merged; no API production deployment found',
    });
  });

  it('stays pending while the deployed commit is older than the merge commit', async () => {
    merged(60, 'c3');
    deployed(APP_DEPLOY, 'c2');

    await expect(evaluate('Requires API: ssms-api#60')).resolves.toMatchObject({
      state: 'pending',
      description:
        'ssms-api#60 merged, waiting for the API Release to deploy it',
    });
  });

  it('stays pending until the API PR is merged', async () => {
    opened(60);
    deployed(APP_DEPLOY, 'c4');

    await expect(evaluate('Requires API: ssms-api#60')).resolves.toMatchObject({
      state: 'pending',
      description: 'ssms-api#60 is not merged yet',
    });
  });

  describe('with several dependencies', () => {
    const body = [
      'Requires API: ssms-api#60',
      'Requires API: https://github.com/tigercao1/ssms-api/pull/61',
    ].join('\n');

    it('stays pending while one of them is migrated but not yet deployed', async () => {
      merged(60, 'c2');
      merged(61, 'c3');
      deployed(APP_DEPLOY, 'c2');
      deployed(PRODUCTION_JOB, 'c3');

      await expect(evaluate(body)).resolves.toMatchObject({
        state: 'pending',
        description:
          'ssms-api#61 merged, waiting for the API Release to deploy it',
      });
    });

    it('passes once every one of them is deployed', async () => {
      merged(60, 'c2');
      merged(61, 'c3');
      deployed(PRODUCTION_JOB, 'c3');
      deployed(APP_DEPLOY, 'c3');

      await expect(evaluate(body)).resolves.toMatchObject({
        state: 'success',
        description: 'All deployed: ssms-api#60, ssms-api#61',
      });
    });
  });
});
