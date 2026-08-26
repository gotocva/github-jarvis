import { listOrgMembers, type GitHubUser } from '@/lib/github'
import { cacheKey, resolveResource } from '@/lib/response-cache'

/**
 * Cached reads shared by more than one caller. Routing them through one key
 * means the second caller gets a local hit instead of repeating the request.
 */
export function cachedOrgMembers(
  org: string,
  token: string,
  actor?: string,
  force = false,
) {
  return resolveResource<GitHubUser[]>({
    key: cacheKey(actor, `org:${org}:members`),
    label: `List members of ${org}`,
    force,
    actor,
    fetcher: () => listOrgMembers(org, token, actor),
  })
}
