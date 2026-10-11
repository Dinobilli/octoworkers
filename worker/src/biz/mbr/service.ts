import type { Context } from 'hono'
import type { AppBindings } from '../../com/bindings'
import { readSession } from '../../com/session'
export function kakaoConfigured(env: AppBindings) {
  return env.ENABLE_KAKAO === 'true' && Boolean(env.KAKAO_REST_API_KEY && env.KAKAO_REDIRECT_URI && !env.KAKAO_REST_API_KEY.startsWith('REPLACE_'))
}
export async function currentMember(c: Context<{ Bindings: AppBindings }>) {
  const session = await readSession(c, 'member')
  if (!session) return null
  return c.env.DB.prepare('SELECT id, name, email FROM members WHERE id = ? AND is_active = 1')
    .bind(session.subject).first<{ id: string; name: string; email: string | null }>()
}
export async function kakaoProfile(env: AppBindings, code: string) {
  const params = new URLSearchParams({ grant_type: 'authorization_code', client_id: env.KAKAO_REST_API_KEY!, redirect_uri: env.KAKAO_REDIRECT_URI!, code })
  if (env.KAKAO_CLIENT_SECRET) params.set('client_secret', env.KAKAO_CLIENT_SECRET)
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', { method: 'POST', body: params, signal: AbortSignal.timeout(8000) })
  const token = await tokenRes.json() as { access_token?: string }
  if (!tokenRes.ok || !token.access_token) throw new Error('Kakao token exchange failed')
  const profileRes = await fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(8000) })
  const profile = await profileRes.json() as { id?: number; kakao_account?: { profile?: { nickname?: string }; email?: string; is_email_valid?: boolean; is_email_verified?: boolean } }
  if (!profileRes.ok || !Number.isSafeInteger(profile.id) || profile.id! <= 0) throw new Error('Invalid Kakao identity')
  const account = profile.kakao_account
  return { kakaoId: String(profile.id), name: account?.profile?.nickname?.slice(0, 100) || '회원', email: account?.is_email_valid && account.is_email_verified ? account.email?.toLowerCase() ?? null : null }
}
