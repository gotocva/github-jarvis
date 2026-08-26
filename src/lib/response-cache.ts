import { recordActivity } from './activity-log'
import { getDB, type CacheRecord } from './db'

export interface CachedRead<T> {
  data: T
  cachedAt: number
}

/**
 * Cache keys are scoped by account so signing in as somebody else never serves
 * the previous user's data.
 */
export function cacheKey(actor: string | undefined, resource: string) {
  return `${actor ?? 'anonymous'}|${resource}`
}

export async function readCache<T>(key: string): Promise<CachedRead<T> | null> {
  try {
    const record = (await (await getDB()).get('cache', key)) as CacheRecord<T> | undefined
    if (!record) return null
    return { data: record.data, cachedAt: record.cachedAt }
  } catch {
    // A browser with IndexedDB blocked simply behaves as a cache miss.
    return null
  }
}

export async function writeCache<T>(key: string, data: T) {
  try {
    await (await getDB()).put('cache', { key, data, cachedAt: Date.now() })
  } catch {
    // Never let a cache write failure break the request that produced the data.
  }
}

export async function deleteCache(key: string) {
  try {
    await (await getDB()).delete('cache', key)
  } catch {
    /* ignore */
  }
}

/** Drops every cached response, e.g. on sign out. */
export async function clearCache() {
  try {
    await (await getDB()).clear('cache')
  } catch {
    /* ignore */
  }
}

export async function cacheSize() {
  try {
    return await (await getDB()).count('cache')
  } catch {
    return 0
  }
}

export interface ResolvedResource<T> {
  data: T
  fromCache: boolean
  cachedAt: number
}

/**
 * Serves a resource from IndexedDB when a copy exists, and only calls GitHub on
 * a miss or an explicit sync. Cache hits are recorded in the activity log too,
 * so the log always explains where the data on screen came from.
 */
export async function resolveResource<T>({
  key,
  label,
  force,
  actor,
  fetcher,
}: {
  key: string
  /** Human readable description used for the cache-hit log entry. */
  label: string
  force: boolean
  actor?: string
  fetcher: () => Promise<T>
}): Promise<ResolvedResource<T>> {
  if (!force) {
    const hit = await readCache<T>(key)
    if (hit) {
      await recordActivity({
        ts: Date.now(),
        method: 'CACHE',
        url: key,
        endpoint: key.split('|').slice(1).join('|'),
        label: `${label} (from local cache)`,
        status: 'success',
        statusCode: 200,
        durationMs: 0,
        actor,
        fromCache: true,
      })
      return { data: hit.data, fromCache: true, cachedAt: hit.cachedAt }
    }
  }

  const data = await fetcher()
  await writeCache(key, data)
  return { data, fromCache: false, cachedAt: Date.now() }
}
