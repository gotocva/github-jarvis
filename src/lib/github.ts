import { recordActivity } from './activity-log'

const API_ROOT = 'https://api.github.com'

export class GitHubError extends Error {
  readonly statusCode: number
  readonly documentationUrl?: string

  constructor(message: string, statusCode: number, documentationUrl?: string) {
    super(message)
    this.name = 'GitHubError'
    this.statusCode = statusCode
    this.documentationUrl = documentationUrl
  }
}

export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  name: string | null
  html_url: string
  type: string
}

export interface Organization {
  login: string
  id: number
  avatar_url: string
  description: string | null
}

export interface Repository {
  id: number
  name: string
  full_name: string
  private: boolean
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  archived: boolean
  default_branch: string
  updated_at: string
  visibility: string
}

export interface Collaborator extends GitHubUser {
  role_name?: string
  permissions?: {
    admin: boolean
    maintain?: boolean
    push: boolean
    triage?: boolean
    pull: boolean
  }
}

export type AccessPermission = 'pull' | 'push' | 'admin'

export const PERMISSION_LABELS: Record<AccessPermission, string> = {
  pull: 'Read',
  push: 'Write',
  admin: 'Admin',
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Human readable description recorded in the activity log. */
  label: string
  token: string
  actor?: string
  /** Status codes to treat as a successful no-content result. */
  okStatuses?: number[]
}

interface GitHubResponse<T> {
  data: T
  headers: Headers
  status: number
}

/**
 * Single choke point for every GitHub call: performs the request, then writes a
 * record of it to the activity log whether it succeeded or failed.
 */
export async function ghRequest<T>(
  path: string,
  { method = 'GET', body, label, token, actor, okStatuses = [] }: RequestOptions,
): Promise<GitHubResponse<T>> {
  const url = path.startsWith('http') ? path : `${API_ROOT}${path}`
  const endpoint = url.replace(API_ROOT, '')
  const startedAt = performance.now()

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Network request failed'
    await recordActivity({
      ts: Date.now(),
      method,
      url,
      endpoint,
      label,
      status: 'error',
      statusCode: 0,
      durationMs: Math.round(performance.now() - startedAt),
      error: message,
      actor,
    })
    throw new GitHubError(message, 0)
  }

  const durationMs = Math.round(performance.now() - startedAt)
  const rateRemaining = response.headers.get('x-ratelimit-remaining')

  let payload: unknown = null
  if (response.status !== 204 && response.status !== 205) {
    const text = await response.text()
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }
  }

  const ok = response.ok || okStatuses.includes(response.status)
  const errorMessage = ok
    ? undefined
    : (payload as { message?: string })?.message || `${response.status} ${response.statusText}`

  await recordActivity({
    ts: Date.now(),
    method,
    url,
    endpoint,
    label,
    status: ok ? 'success' : 'error',
    statusCode: response.status,
    durationMs,
    error: errorMessage,
    rateRemaining: rateRemaining === null ? undefined : Number(rateRemaining),
    actor,
  })

  if (!ok) {
    throw new GitHubError(
      errorMessage ?? 'GitHub request failed',
      response.status,
      (payload as { documentation_url?: string })?.documentation_url,
    )
  }

  return { data: payload as T, headers: response.headers, status: response.status }
}

/** Follows `Link: rel="next"` until GitHub runs out of pages. */
export async function ghPaginate<T>(
  path: string,
  options: Omit<RequestOptions, 'method' | 'body'>,
  { perPage = 100, maxPages = 20 }: { perPage?: number; maxPages?: number } = {},
): Promise<T[]> {
  const separator = path.includes('?') ? '&' : '?'
  let next: string | null = `${path}${separator}per_page=${perPage}`
  const all: T[] = []
  let page = 0

  while (next && page < maxPages) {
    const { data, headers }: GitHubResponse<T[]> = await ghRequest<T[]>(next, options)
    if (Array.isArray(data)) all.push(...data)
    next = parseNextLink(headers.get('link'))
    page += 1
  }
  return all
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null
  for (const part of link.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/)
    if (match) return match[1]
  }
  return null
}

/** Runs tasks with a bounded concurrency so we don't burst GitHub's rate limit. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  let done = 0

  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
      done += 1
      onProgress?.(done, items.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

export async function validateCredentials(username: string, token: string) {
  const { data, headers } = await ghRequest<GitHubUser>('/user', {
    label: 'Validate credentials',
    token,
    actor: username,
  })

  if (data.login.toLowerCase() !== username.trim().toLowerCase()) {
    throw new GitHubError(
      `This token belongs to "${data.login}", not "${username.trim()}".`,
      401,
    )
  }

  const scopes = (headers.get('x-oauth-scopes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return { user: data, scopes }
}

export function listOrganizations(token: string, actor?: string) {
  return ghPaginate<Organization>('/user/orgs', {
    label: 'List organizations',
    token,
    actor,
  })
}

export function getOrganization(org: string, token: string, actor?: string) {
  return ghRequest<Organization & { name?: string; public_repos?: number }>(`/orgs/${org}`, {
    label: `Get organization ${org}`,
    token,
    actor,
  }).then((r) => r.data)
}

/**
 * Repositories owned by the signed-in account. A personal account has no
 * `/orgs/{login}/repos` endpoint, so it needs this one instead.
 */
export function listOwnedRepos(token: string, actor?: string) {
  return ghPaginate<Repository>('/user/repos?affiliation=owner&sort=updated', {
    label: 'List your personal repositories',
    token,
    actor,
  })
}

export function listOrgRepos(org: string, token: string, actor?: string) {
  return ghPaginate<Repository>(`/orgs/${org}/repos?sort=updated`, {
    label: `List repositories in ${org}`,
    token,
    actor,
  })
}

export function listOrgMembers(org: string, token: string, actor?: string) {
  return ghPaginate<GitHubUser>(`/orgs/${org}/members`, {
    label: `List members of ${org}`,
    token,
    actor,
  })
}

export function listRepoCollaborators(
  org: string,
  repo: string,
  token: string,
  actor?: string,
) {
  return ghPaginate<Collaborator>(`/repos/${org}/${repo}/collaborators?affiliation=all`, {
    label: `List collaborators of ${org}/${repo}`,
    token,
    actor,
  })
}

export function addCollaborator(
  org: string,
  repo: string,
  username: string,
  permission: AccessPermission,
  token: string,
  actor?: string,
) {
  return ghRequest<{ id?: number; html_url?: string } | null>(
    `/repos/${org}/${repo}/collaborators/${username}`,
    {
      method: 'PUT',
      body: { permission },
      label: `Grant ${PERMISSION_LABELS[permission]} on ${org}/${repo} to ${username}`,
      token,
      actor,
      okStatuses: [201, 204],
    },
  )
}

export function removeCollaborator(
  org: string,
  repo: string,
  username: string,
  token: string,
  actor?: string,
) {
  return ghRequest<null>(`/repos/${org}/${repo}/collaborators/${username}`, {
    method: 'DELETE',
    label: `Remove ${username} from ${org}/${repo}`,
    token,
    actor,
    okStatuses: [204],
  })
}

export function removeOrgMembership(
  org: string,
  username: string,
  token: string,
  actor?: string,
) {
  return ghRequest<null>(`/orgs/${org}/memberships/${username}`, {
    method: 'DELETE',
    label: `Remove ${username} from organization ${org}`,
    token,
    actor,
    okStatuses: [204],
  })
}

export function getUser(username: string, token: string, actor?: string) {
  return ghRequest<GitHubUser>(`/users/${username}`, {
    label: `Look up user ${username}`,
    token,
    actor,
  }).then((r) => r.data)
}

// ---------------------------------------------------------------------------
// Repository detail
// ---------------------------------------------------------------------------

export interface Branch {
  name: string
  commit: { sha: string; url: string }
  protected: boolean
}

export interface BranchCommit {
  sha: string
  commit: {
    message: string
    author: { name: string; email: string; date: string } | null
    committer: { name: string; email: string; date: string } | null
  }
  author: { login: string; avatar_url: string } | null
}

export function getRepository(org: string, repo: string, token: string, actor?: string) {
  return ghRequest<Repository>(`/repos/${org}/${repo}`, {
    label: `Get repository ${org}/${repo}`,
    token,
    actor,
  }).then((r) => r.data)
}

export function listBranches(org: string, repo: string, token: string, actor?: string) {
  return ghPaginate<Branch>(`/repos/${org}/${repo}/branches`, {
    label: `List branches of ${org}/${repo}`,
    token,
    actor,
  })
}

export function getCommit(
  org: string,
  repo: string,
  sha: string,
  token: string,
  actor?: string,
) {
  return ghRequest<BranchCommit>(`/repos/${org}/${repo}/commits/${sha}`, {
    label: `Get commit ${sha.slice(0, 7)} in ${org}/${repo}`,
    token,
    actor,
  }).then((r) => r.data)
}

/** Deletes the `refs/heads/<branch>` ref, which is how GitHub deletes a branch. */
export function deleteBranch(
  org: string,
  repo: string,
  branch: string,
  token: string,
  actor?: string,
) {
  return ghRequest<null>(
    `/repos/${org}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: 'DELETE',
      label: `Delete branch ${branch} in ${org}/${repo}`,
      token,
      actor,
      okStatuses: [204],
    },
  )
}
