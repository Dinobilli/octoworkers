import { Hono } from 'hono'
import type { AppBindings } from '../../com/bindings'
import { beginOAuth, consumeOAuth, issueSession, clearSession } from '../../com/session'
import { kakaoConfigured, kakaoProfile, currentMember } from './service'
export const memberRoutes = new Hono<{ Bindings: AppBindings }>()
memberRoutes.use('*', async (c, next) => {
  if (c.env.ENABLE_KAKAO !== 'true') return c.json({ message: 'Member module disabled' }, 404)
  await next()
})
memberRoutes.get('/me', async (c) => {
  const member = await currentMember(c)
  return member ? c.json(member) : c.json({ message: '로그인이 필요합니다.' }, 401)
})
memberRoutes.post('/logout', async (c) => { await clearSession(c, 'member'); return c.json({ ok: true }) })
memberRoutes.get('/kakao', async (c) => {
  if (!kakaoConfigured(c.env)) return c.json({ message: '카카오 로그인이 아직 설정되지 않았습니다.' }, 503)
  const redirect = new URL(c.env.KAKAO_REDIRECT_URI!)
  if (redirect.origin !== new URL(c.req.url).origin) return c.json({ message: 'Login origin does not match callback' }, 400)
  const state = await beginOAuth(c, 'kakao')
  const params = new URLSearchParams({ client_id: c.env.KAKAO_REST_API_KEY!, redirect_uri: redirect.href, response_type: 'code', state })
  return c.redirect(`https://kauth.kakao.com/oauth/authorize?${params}`)
})
memberRoutes.get('/kakao/callback', async (c) => {
  if (!kakaoConfigured(c.env)) return c.json({ message: 'Kakao is not configured' }, 503)
  if (!(await consumeOAuth(c, 'kakao', c.req.query('state')))) return c.json({ message: 'Invalid or expired OAuth state' }, 403)
  if (c.req.query('error')) return c.redirect('/account?login=cancelled')
  const code = c.req.query('code')
  if (!code) return c.json({ message: 'Missing authorization code' }, 400)
  try {
    const profile = await kakaoProfile(c.env, code)
    const now = new Date().toISOString()
    const member = await c.env.DB.prepare(`INSERT INTO members (id, kakao_id, name, email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(kakao_id) DO UPDATE SET name = excluded.name, email = excluded.email, updated_at = excluded.updated_at
      RETURNING id, is_active`).bind(crypto.randomUUID(), profile.kakaoId, profile.name, profile.email, now, now).first<{ id: string; is_active: number }>()
    if (!member || member.is_active !== 1) return c.json({ message: 'Account is inactive' }, 403)
    await issueSession(c, 'member', member.id)
    return c.redirect('/account')
  } catch { return c.json({ message: '카카오 로그인에 실패했습니다. 다시 시도해 주세요.' }, 502) }
})
