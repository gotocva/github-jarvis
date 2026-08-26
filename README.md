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
- *Dashboard* — see Analytics below.
- *Branches* — multi-select with bulk delete. The default branch and protected branches
  can't be selected. "Load commit dates" costs one call per branch and unlocks stale
  detection (`Stale only (90d+)` and `Select stale`) for cleaning up dead branches.
- *Users* — the repo's collaborators with their permission, multi-select, bulk revoke.
  You can't revoke your own access.

**User** — clicking a login anywhere opens that person's page:
- *Dashboard* — see Analytics below.
- *Repository access* — every repository they hold, with the permission.

**Access Management** — two tabs:

- *Give access* — pick an organization or your own account, multi-select users (or type
  any GitHub username to invite somebody new), multi-select repositories, choose
  Read / Write / Admin, and submit. Every user × repository pair is applied with bounded
  concurrency and the results are reported per pair.
- *Revoke access* — type a username, search, and get every repository that account can
  reach across **all** organizations and your personal repositories, with the permission
  on each. Everything is pre-selected, so revoking the lot is one click; organization
  membership is offered alongside, since repo access alone often isn't the whole grant.

  The search reads live rather than from cache. A stale list answering "no access" for
  somebody who has it is the one wrong answer an audit screen must not give, and
  conditional requests make the re-read cheap. For the same reason, an organization
  whose repositories could not be read is reported as skipped rather than silently
  counted as clean.

**Activity Log** — every GitHub call, with method, status, duration, endpoint and error,
stored in IndexedDB. Filterable, exportable as JSON, and clearable. Cache reads are
recorded too, under a `CACHE` method, so the log always explains where the data on
screen came from.

## Analytics

Both Dashboard tabs are built from `GET /repos/{owner}/{repo}/stats/contributors`,
which returns weekly commits, additions and deletions per contributor. That is one
call per repository rather than walking `/commits` page by page, so a whole
repository — or a person's whole footprint in an organization — costs a handful of
requests instead of hundreds. The trade-off is that GitHub buckets by week, so the
date filter resolves to week boundaries rather than exact days. GitHub answers 202
while it builds that cache; the client retries with backoff and the UI says which
repositories are still computing.

The user dashboard scopes its fan-out to the repositories that person actually holds
access to (from the org Users tab) rather than every repository in the organization.

Each dashboard has a filter row that scopes everything below it:

- A **date range** picker — presets first, custom range behind a hairline in the
  footer.
- A **multi-select**: repositories on the user dashboard, contributors on the
  repository dashboard.

Both then render the same four things: a KPI row, weekly commits over time, a ranked
bar chart, a diverging added/removed chart, and a table view carrying every number.

Chart colors are the validated palette in `src/index.css` (`--chart-*`), stepped
separately for the light and dark surfaces. Categorical hues are assigned in fixed
order and never cycled; bars over nominal categories all wear one hue rather than a
value ramp; additions/removals use a diverging warm/cool pair around a neutral zero.
Every chart ships a tooltip and a table-view twin, so no value is reachable only by
hovering.

## Rate limit

GitHub allows 5,000 authenticated REST calls an hour, and this app spends them in
three places that multiply with the size of an organization: the org Users tab reads
`/collaborators` once per repository, the branch view reads one commit per branch, and
the user dashboard reads statistics once per repository.

Two things keep that affordable:

- **Conditional requests.** Every GET carries the ETag of the last response
  (`If-None-Match`). GitHub answers `304 Not Modified` when nothing changed, which it
  does **not** charge against the rate limit — so re-syncing unchanged data is free.
  The bodies are kept in IndexedDB, because a 304 carries none.
- **The response cache below** — a cache hit makes no request at all.

The Activity Log separates "rate-limited calls" from free ones (cache hits plus 304s),
so the cost of any action is visible.

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
    http-cache.ts      ETag store behind conditional requests
    github-resources.ts Cached reads shared by more than one caller
    github.ts          Every GitHub endpoint, logged through one choke point
  store/
    auth.ts            Session (persisted to localStorage)
    orgs.ts            Organization list
    org-data.ts        Per-org repositories and users
    repo-data.ts       Per-repo branches and collaborators
    analytics.ts       Pure aggregation: raw weekly stats -> chart-ready slices
  store/
    stats.ts           Per-repo contribution statistics
    theme.ts           Light / dark / system
  pages/               login, dashboard, organization, repository, user, give-access, activity-log
  components/
    dashboard/         Stat tiles, charts, table view, the shared analytics body
    ...                app shell, tab bodies, multi-select, cache/error banners, ui/ (shadcn)
```
