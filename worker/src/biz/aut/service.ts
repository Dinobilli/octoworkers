import type { Context } from 'hono'
import type { AppBindings } from '../../com/bindings'
import { issueSession, clearSession, readSession, beginOAuth, consumeOAuth } from '../../com/session'
export function loginConfigured(env: AppBindings) {
  return Boolean(env.ADMIN_LOGIN_EMAIL && env.ADMIN_LOGIN_PASSWORD && !env.ADMIN_LOGIN_PASSWORD.startsWith('replace-'))
}
export const issueAdminSession = (c: Context<{ Bindings: AppBindings }>, email: string) => issueSession(c, 'admin', email.toLowerCase())
export const clearAdminSession = (c: Context<{ Bindings: AppBindings }>) => clearSession(c, 'admin')
export async function readAdminSession(c: Context<{ Bindings: AppBindings }>) {
  const session = await readSession(c, 'admin')
  return session ? { email: session.subject } : null
}
export const generateOAuthState = (c: Context<{ Bindings: AppBindings }>) => beginOAuth(c, 'github')
export const verifyOAuthState = (c: Context<{ Bindings: AppBindings }>, state?: string) => consumeOAuth(c, 'github', state)

// H-2: 타이밍 안전 비밀번호 비교
export async function validateCredentials(env: AppBindings, email: string, password: string) {
  if (env.ADMIN_LOGIN_EMAIL?.toLowerCase() !== email.toLowerCase()) return false

  const expected = new TextEncoder().encode(env.ADMIN_LOGIN_PASSWORD ?? '')
  const actual = new TextEncoder().encode(password)

  if (expected.byteLength !== actual.byteLength) return false

  const expectedBuf = await crypto.subtle.digest('SHA-256', expected)
  const actualBuf = await crypto.subtle.digest('SHA-256', actual)

  const a = new Uint8Array(expectedBuf)
  const b = new Uint8Array(actualBuf)
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

export function githubConfigured(env: AppBindings) {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
}

export function buildGithubAuthUrl(env: AppBindings, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state,
  })
  return `https://github.com/login/oauth/authorize?${params}`
}

export async function exchangeGithubCode(env: AppBindings, code: string, redirectUri: string) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  })
  const data = (await res.json()) as { access_token?: string; error?: string }
  if (!data.access_token) throw new Error(data.error ?? 'GitHub token exchange failed')
  return data.access_token
}

export async function fetchGithubUser(accessToken: string) {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Octoworkers', Accept: 'application/json' },
  })
  if (!res.ok) throw new Error('Failed to fetch GitHub user')
  const user = (await res.json()) as { login: string; email: string | null; avatar_url: string; name: string | null }

  const emailRes = await fetch('https://api.github.com/user/emails', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Octoworkers', Accept: 'application/json' },
  })
  if (!emailRes.ok) throw new Error('Verified email required')
  const emails = await emailRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>
  user.email = emails.find(e => e.primary && e.verified)?.email.toLowerCase() ?? null

  return user
}

export function isAllowedGithubUser(env: AppBindings, login: string) {
  const allowed = (env.GITHUB_ALLOWED_USERS ?? '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean)
  if (allowed.length === 0) return false
  return allowed.includes(login.toLowerCase())
}
