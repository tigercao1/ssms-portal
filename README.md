# SSMS Portal

Instructor + admin web portal for the Snow School Management System. Talks to the
NestJS API (`ssms-api`). Built per `../knowledge-base/.../PORTAL_EXECUTION_PLAN.md`
and `PORTAL_UI_PLAN.md`.

## Stack
React + TypeScript + Vite · React Router · TanStack Query · Supabase JS (auth +
storage) · Tailwind (wired to CSS-variable design tokens).

## Getting started
```bash
cp .env.example .env   # fill in API base + Supabase URL/publishable key
npm install
npm run dev            # http://localhost:5173
```
The API must allow-list this origin via `CORS_ALLOWED_ORIGINS` (already supported
in `ssms-api`).

## Structure
```
src/
  app/        shell + router (Wave 0/1 owned)
  lib/        env, supabase client, api client, query client (Wave 0 owned)
  components/ design-system primitives (W1.6)
  auth/       login / verify / reset / guards (W1.x)
  i18n/       core (W1.5) + messages/{en,zh-CN} (W2.14/W2.15)
  features/
    instructor/  W2.1–W2.4
    admin/       W2.6–W2.13
    reference/   W2.5
  styles/     tokens.css + global.css (W0.2)
```

## Deploys

`.github/workflows/deploy.yml` builds and deploys to Cloudflare after Portal CI
passes on `main`, from the commit CI tested. It is the only deploy path; the
production `VITE_*` values are variables in the `production` GitHub Environment.

## Changes that span the API

The API deploys first and the portal follows:

1. API changes must keep working with the portal that is live now: add fields
   and endpoints, do not remove or rename ones the portal uses until a portal
   release has stopped using them.
2. A portal PR that needs an API change says so in its description:
   `Requires API: ssms-api#60`. The required **API dependency** check stays
   pending until that API PR is merged and deployed to production, then turns
   green (it re-checks every 10 minutes).
3. Merge the API PR, let its Release workflow deploy it, then merge the portal PR.

## Scripts
`dev` · `build` · `preview` · `lint` · `format`

## Status
**Wave 0 scaffold complete** (W0.1–W0.4). Routes render placeholders tagged with
their owning task. Auth, design system, i18n, and features are next (see
`portal-tasks/`).
