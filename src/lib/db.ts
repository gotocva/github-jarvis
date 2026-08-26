import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface ActivityEntry {
  id?: number
  /** Epoch millis when the request completed. */
  ts: number
  method: string
  /** Full request URL; the token is never part of it. */
  url: string
  /** Path portion, e.g. `/orgs/acme/repos`. */
  endpoint: string
  /** Human readable description, e.g. "List organizations". */
  label: string
  status: 'success' | 'error'
  /** HTTP status code, 0 when the request never reached the server. */
  statusCode: number
  durationMs: number
  error?: string
  /** `x-ratelimit-remaining` reported by GitHub for this call. */
  rateRemaining?: number
  /** Login of the account the call was made as. */
  actor?: string
  /** True when the app answered from the local cache instead of the network. */
  fromCache?: boolean
}

export interface CacheRecord<T = unknown> {
  /** Logical resource key, e.g. `octocat|org:acme:repos`. */
  key: string
  data: T
  cachedAt: number
}

export interface JarvisDB extends DBSchema {
  activity: {
    key: number
    value: ActivityEntry
    indexes: { ts: number; status: string; endpoint: string }
  }
  cache: {
    key: string
    value: CacheRecord
    indexes: { cachedAt: number }
  }
}

const DB_NAME = 'github-jarvis'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<JarvisDB>> | null = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<JarvisDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const activity = db.createObjectStore('activity', {
            keyPath: 'id',
            autoIncrement: true,
          })
          activity.createIndex('ts', 'ts')
          activity.createIndex('status', 'status')
          activity.createIndex('endpoint', 'endpoint')
        }
        if (oldVersion < 2) {
          const cache = db.createObjectStore('cache', { keyPath: 'key' })
          cache.createIndex('cachedAt', 'cachedAt')
        }
      },
    })
  }
  return dbPromise
}
