import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AppBindings, D1PreparedStatementLike } from '../../src/com/bindings'
export function database() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync(resolve('migrations')).filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(resolve('migrations', file), 'utf8'))
  return { sqlite, db: { prepare(query: string): D1PreparedStatementLike {
    let values: Array<string | number | null> = []
    return { bind(...args: unknown[]) { values = args as typeof values; return this },
      async first<T>() { return (sqlite.prepare(query).get(...values) ?? null) as T | null },
      async all<T>() { return { results: sqlite.prepare(query).all(...values) as T[] } },
      async run() { return sqlite.prepare(query).run(...values) },
    }
  } } }
}
export function environment(db: AppBindings['DB']): AppBindings {
  return { DB: db, ASSETS: { fetch: async () => new Response('asset') }, APP_KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
    ENV_NAME: 'production', APP_DOMAIN: 'demo.test', ADMIN_DOMAIN: 'admin.demo.test', ADMIN_ACCESS_MODE: 'session', ADMIN_LOGIN_EMAIL: 'owner@demo.test', ADMIN_LOGIN_PASSWORD: 'long-random-test-password',
    ENABLE_KAKAO: 'true', ENABLE_GROBLE: 'true', KAKAO_REST_API_KEY: 'test-client', KAKAO_REDIRECT_URI: 'https://demo.test/api/members/kakao/callback', GROBLE_WEBHOOK_SECRET: 'test-webhook-secret', ENABLE_AI: 'false', ENABLE_AGENTS: 'true' }
}
