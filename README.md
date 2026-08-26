# GitHub Jarvis

**Live:** https://gotocva.github.io/github-jarvis/

A browser-only control panel for GitHub organizations: browse repositories, see who
has access, grant and revoke permissions in bulk, and keep an auditable log of every
API call the app makes.

Built with **React 19 + Vite**, **shadcn/ui** (new-york) on **Tailwind v4**,
**React Router**, **Zustand** and **IndexedDB** (via `idb`).

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:5273 and sign in with your GitHub username and a personal
access token.

### Token scopes

| Scope | Needed for |
| --- | --- |
| `read:org` | listing your organizations and their members |
| `repo` | listing private repositories, branches and collaborators |
| `admin:org` | removing a user from the organization |

A classic PAT with `repo` + `admin:org` covers everything. Fine-grained tokens work too,
but they report no scopes, so the login screen can't pre-warn you about missing ones.
If your org enforces SSO, authorize the token for that org first.

## Features

**Login** — credentials are validated against `GET /user` and the returned login must
match the username you typed, so a token pasted under the wrong account is rejected up
front. The session is kept in `localStorage`.

**Organizations** (left menu) — every org the token can see. Opening one gives a tab
layout:
- *Repositories* — searchable and filterable by visibility. Click a row to open it.
- *Users* — everyone with access to at least one repo in the org, built by unioning the
  collaborators of every repository. Removing a user revokes them from every repo they
  hold and drops their org membership.

**Repository** — clicking a repo opens its own tab layout:
- *Branches* — multi-select with bulk delete. The default branch and protected branches
  can't be selected. "Load commit dates" costs one call per branch and unlocks stale
  detection (`Stale only (90d+)` and `Select stale`) for cleaning up dead branches.
- *Users* — the repo's collaborators with their permission, multi-select, bulk revoke.
  You can't revoke your own access.

**Give Access** — pick an organization, multi-select users (or type any GitHub username
to invite somebody new), multi-select repositories, choose Read / Write / Admin, and
submit. Every user × repository pair is applied with bounded concurrency and the results
are reported per pair.

**Activity Log** — every GitHub call, with method, status, duration, endpoint and error,
stored in IndexedDB. Filterable, exportable as JSON, and clearable. Cache reads are
recorded too, under a `CACHE` method, so the log always explains where the data on
screen came from.

## Caching

Every list the app displays is written to IndexedDB. On a later visit the view is served
from that local copy — no network call — and shows a **"Loaded from local cache"** banner
with a **Sync with GitHub** button that forces a fresh fetch and overwrites the cache.
Cache entries are scoped per account and cleared on sign out. If a sync fails, the cached
rows stay on screen behind an inline error rather than being thrown away.

## Security notes

The personal access token is held in `localStorage` so the session survives a reload.
Anything with script access to this origin can read it — treat it like a stored password,
scope the token narrowly, and sign out to remove it. There is no backend; every request
goes from your browser straight to `api.github.com`.

## Deployment

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which lints, builds and publishes `dist/` to GitHub Pages at
https://gotocva.github.io/github-jarvis/.

Two things make the subpath work:

- `vite.config.ts` sets `base: '/github-jarvis/'` for builds only, so `npm run dev`
  still serves from the root.
- Pages has no server-side rewrite, so a deep link like `/github-jarvis/activity`
  would 404. `public/404.html` encodes the requested path into a query string and
  `index.html` restores it before React Router mounts.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server on port 5273 |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | oxlint |

## Layout

```
src/
  lib/
    db.ts              IndexedDB schema (activity + cache stores)
    activity-log.ts    Writing and reading the API call log
    response-cache.ts  Cache read/write plus the resolveResource helper
    github.ts          Every GitHub endpoint, logged through one choke point
  store/
    auth.ts            Session (persisted to localStorage)
    orgs.ts            Organization list
    org-data.ts        Per-org repositories and users
    repo-data.ts       Per-repo branches and collaborators
  pages/               login, dashboard, organization, repository, give-access, activity-log
  components/          app shell, tab bodies, multi-select, cache/error banners, ui/ (shadcn)
```
