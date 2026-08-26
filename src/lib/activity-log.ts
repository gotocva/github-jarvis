import { getDB, type ActivityEntry, type JarvisDB } from './db'
import type { IDBPDatabase } from 'idb'

export type { ActivityEntry } from './db'

/** Entries beyond this are trimmed oldest-first so the store cannot grow forever. */
const MAX_ENTRIES = 5000

type Listener = (entry: ActivityEntry) => void
const listeners = new Set<Listener>()

/** Subscribe to newly recorded calls so open views can refresh live. */
export function onActivity(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function recordActivity(entry: ActivityEntry) {
  try {
    const db = await getDB()
    const id = await db.add('activity', entry)
    const stored = { ...entry, id: id as number }
    listeners.forEach((l) => l(stored))
    void trim(db)
    return stored
  } catch {
    // A failed log write must never break the request it was describing.
    return entry
  }
}

async function trim(db: IDBPDatabase<JarvisDB>) {
  const count = await db.count('activity')
  if (count <= MAX_ENTRIES) return
  const tx = db.transaction('activity', 'readwrite')
  let cursor = await tx.store.index('ts').openCursor()
  let toDelete = count - MAX_ENTRIES
  while (cursor && toDelete > 0) {
    await cursor.delete()
    toDelete -= 1
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function listActivity(limit = 500): Promise<ActivityEntry[]> {
  const db = await getDB()
  const out: ActivityEntry[] = []
  let cursor = await db.transaction('activity').store.index('ts').openCursor(null, 'prev')
  while (cursor && out.length < limit) {
    out.push(cursor.value)
    cursor = await cursor.continue()
  }
  return out
}

export async function countActivity() {
  const db = await getDB()
  return db.count('activity')
}

export async function clearActivity() {
  const db = await getDB()
  await db.clear('activity')
}
