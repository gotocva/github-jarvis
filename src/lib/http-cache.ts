import { getDB, type HttpRecord } from './db'

/**
 * ETag store for GitHub GET responses.
 *
 * GitHub does not charge a conditional request that comes back `304 Not
 * Modified` against the primary rate limit, but a 304 carries no body — so the
 * body has to be kept here to answer from. Re-syncing unchanged data therefore
 * costs zero quota instead of one call per request.
 */

/** Oldest entries beyond this are dropped so the store cannot grow forever. */
const MAX_ENTRIES = 800

export async function readHttpCache(url: string): Promise<HttpRecord | null> {
  try {
    return (await (await getDB()).get('http', url)) ?? null
  } catch {
    return null
  }
}

export async function writeHttpCache(url: string, etag: string, body: unknown) {
  try {
    const db = await getDB()
    await db.put('http', { url, etag, body, ts: Date.now() })
    void trim(db)
  } catch {
    // Never let a cache write break the request that produced it.
  }
}

/** Refreshes the timestamp so a still-used entry isn't trimmed as stale. */
export async function touchHttpCache(url: string) {
  try {
    const db = await getDB()
    const record = await db.get('http', url)
    if (record) await db.put('http', { ...record, ts: Date.now() })
  } catch {
    /* ignore */
  }
}

export async function clearHttpCache() {
  try {
    await (await getDB()).clear('http')
  } catch {
    /* ignore */
  }
}

type DB = Awaited<ReturnType<typeof getDB>>

async function trim(db: DB) {
  const count = await db.count('http')
  if (count <= MAX_ENTRIES) return
  const tx = db.transaction('http', 'readwrite')
  let cursor = await tx.store.index('ts').openCursor()
  let toDelete = count - MAX_ENTRIES
  while (cursor && toDelete > 0) {
    await cursor.delete()
    toDelete -= 1
    cursor = await cursor.continue()
  }
  await tx.done
}
