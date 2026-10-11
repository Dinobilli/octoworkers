import { useEffect, useState } from 'react'
import { apiFetch } from '../../../com/api/client'
export function LoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [providers, setProviders] = useState<{ password: boolean; github: boolean } | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { apiFetch<{ password: boolean; github: boolean }>('/api/auth/providers').then(setProviders).catch(() => setError('로그인 설정을 불러오지 못했습니다.')) }, [])
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await onLogin(email, password) } catch (e) { setError(e instanceof Error ? e.message : '로그인에 실패했습니다.') } finally { setBusy(false) }
  }
  return <main className="login-shell"><section className="login-card">
    <span>Admin Login</span><h1>관리 콘솔</h1><p>등록된 관리자 계정으로 로그인하세요.</p>
    {!providers && !error && <p>불러오는 중…</p>}
    {providers?.github && <a href="/api/auth/github">GitHub으로 로그인</a>}
    {providers?.password && <form className="form-grid" onSubmit={submit}>
      <label>이메일<input autoComplete="username" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>비밀번호<input autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} /></label>
      <button disabled={busy} type="submit">{busy ? '로그인 중…' : '로그인'}</button>
    </form>}
    {providers && !providers.password && !providers.github && <p>관리자 로그인이 설정되지 않았습니다. 사이트 운영자에게 문의하세요.</p>}
    {error && <p role="alert">{error}</p>}
  </section></main>
}
