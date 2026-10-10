// Posts the "API dependency" commit status on portal pull requests.
//
// A PR that needs an API change declares it in its description:
//
//   Requires API: ssms-api#60
//   Requires API: https://github.com/tigercao1/ssms-api/pull/60
//
// The status is success only when every listed API PR is merged and its merge
// commit is contained in the commit currently deployed to the API's
// `production` environment. Until then it is pending, which blocks the merge.
// PRs with no such line pass immediately.
//
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_NAME, GITHUB_EVENT_PATH.
// Set PR_NUMBER to check one PR and DRY_RUN=1 to print instead of posting.

import { readFileSync } from 'node:fs';

const API_REPO = 'tigercao1/ssms-api';
const CONTEXT = 'API dependency';
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const dryRun = process.env.DRY_RUN === '1';

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

export function parseDependencies(body) {
  const numbers = new Set();
  for (const line of (body ?? '').split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]?\s*requires api\s*:\s*(.+)$/i);
    if (!m) continue;
    const refs = m[1].matchAll(
      /(?:ssms-api#|github\.com\/tigercao1\/ssms-api\/pull\/)(\d+)/gi,
    );
    for (const ref of refs) numbers.add(Number(ref[1]));
  }
  return [...numbers].sort((a, b) => a - b);
}

let deployedSha;
async function apiDeployedSha() {
  if (deployedSha !== undefined) return deployedSha;
  const deployments = await gh(
    `repos/${API_REPO}/deployments?environment=production&per_page=20`,
  );
  deployedSha = null;
  for (const d of deployments) {
    const [latest] = await gh(`repos/${API_REPO}/deployments/${d.id}/statuses?per_page=1`);
    if (latest?.state === 'success') {
      deployedSha = d.sha;
      break;
    }
  }
  return deployedSha;
}

async function checkOne(number) {
  const pr = await gh(`repos/${API_REPO}/pulls/${number}`);
  const ref = `ssms-api#${number}`;
  if (!pr.merged) {
    return pr.state === 'closed'
      ? { state: 'failure', text: `${ref} was closed without merging` }
      : { state: 'pending', text: `${ref} is not merged yet` };
  }
  const deployed = await apiDeployedSha();
  if (!deployed) return { state: 'pending', text: `${ref} merged; no API production deployment found` };
  const cmp = await gh(`repos/${API_REPO}/compare/${pr.merge_commit_sha}...${deployed}`);
  if (cmp.status === 'identical' || cmp.status === 'ahead') {
    return { state: 'success', text: `${ref} is deployed` };
  }
  return { state: 'pending', text: `${ref} merged, waiting for the API Release to deploy it` };
}

export async function evaluate(pr) {
  const deps = parseDependencies(pr.body);
  if (deps.length === 0) return { state: 'success', description: 'No API dependency declared' };
  const results = await Promise.all(deps.map(checkOne));
  const rank = { failure: 0, pending: 1, success: 2 };
  const worst = results.reduce((a, b) => (rank[b.state] < rank[a.state] ? b : a));
  const description = (worst.state === 'success'
    ? `All deployed: ${deps.map((n) => `ssms-api#${n}`).join(', ')}`
    : results.filter((r) => r.state !== 'success').map((r) => r.text).join('; ')
  ).slice(0, 140);
  return { state: worst.state, description, target_url: `https://github.com/${API_REPO}/pull/${deps[0]}` };
}

async function post(pr) {
  const status = await evaluate(pr);
  const line = `#${pr.number} @ ${pr.head.sha.slice(0, 7)}: ${status.state} — ${status.description}`;
  if (dryRun) {
    console.log(`[dry run] ${line}`);
    return;
  }
  await gh(`repos/${repo}/statuses/${pr.head.sha}`, {
    method: 'POST',
    body: JSON.stringify({ context: CONTEXT, ...status }),
  });
  console.log(line);
}

async function main() {
  const event = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    : {};
  let prs;
  if (process.env.PR_NUMBER) {
    prs = [await gh(`repos/${repo}/pulls/${process.env.PR_NUMBER}`)];
  } else if (event.pull_request) {
    prs = [await gh(`repos/${repo}/pulls/${event.pull_request.number}`)];
  } else {
    prs = await gh(`repos/${repo}/pulls?state=open&per_page=100`);
  }
  for (const pr of prs) await post(pr);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
