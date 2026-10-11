import { useEffect, useState } from 'react'
import type { CommerceProduct, FeatureFlags, MemberOrder, MemberProfile, OrderStatus } from '@octoworkers/com'
import { apiFetch } from '../../../com/api/client'
const labels: Record<OrderStatus, string> = { pending: '결제 확인 중', paid: '결제 완료', partially_refunded: '부분 환불 · 이용 권한 확인 필요', refunded: '환불 완료', cancel_requested: '취소·해지 요청', active: '구독 중', past_due: '갱신 결제 확인 필요', terminated: '구독 종료', review_required: '판매자 확인 중' }
export function AccountPage() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null)
  const [member, setMember] = useState<MemberProfile | null>(null)
  const [products, setProducts] = useState<CommerceProduct[]>([])
  const [orders, setOrders] = useState<MemberOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function refresh() {
    setError('')
    try {
      const config = await apiFetch<FeatureFlags>('/api/public/features'); setFlags(config)
      if (config.kakao) {
        const response = await fetch('/api/members/me')
        if (response.status === 401) setMember(null)
        else if (!response.ok) throw new Error('회원 정보를 불러오지 못했습니다.')
        else {
          setMember(await response.json())
          if (config.groble) setOrders(await apiFetch<MemberOrder[]>('/api/payments/orders'))
        }
      }
      if (config.groble) setProducts(await apiFetch<CommerceProduct[]>('/api/payments/products'))
    } catch (e) { setError(e instanceof Error ? e.message : '연결을 확인해 주세요.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  async function checkout(id: string) {
    setBusy(true); setError('')
    try { const result = await apiFetch<{ checkoutUrl: string }>('/api/payments/checkout', { method: 'POST', body: JSON.stringify({ productId: id }) }); window.location.assign(result.checkoutUrl) }
    catch (e) { setError(e instanceof Error ? e.message : '결제를 시작할 수 없습니다.'); setBusy(false) }
  }
  async function logout() { setBusy(true); try { await apiFetch('/api/members/logout', { method: 'POST' }); setMember(null); setOrders([]) } catch { setError('로그아웃에 실패했습니다.') } finally { setBusy(false) } }
  return <main className="account-shell">
    <nav><a href="/">← 홈으로</a></nav>
    <h1>{member ? `${member.name}님의 계정` : '내 계정'}</h1>
    {loading ? <p role="status">불러오는 중…</p> : <>
      {!flags?.kakao && <p>이 사이트는 회원 기능을 사용하지 않습니다.</p>}
      {flags?.kakao && !member && <section className="account-card"><h2>로그인하고 시작하세요</h2><p>카카오 계정으로 가입하고 구매 내역을 확인할 수 있어요.</p><a className="kakao-login" href="/api/members/kakao">카카오 로그인</a></section>}
      {member && <button disabled={busy} onClick={() => void logout()}>로그아웃</button>}
      {flags?.groble && <section><h2>상품</h2><div className="account-grid">
        {products.length === 0 && <p>등록된 상품이 없습니다.</p>}
        {products.map(product => <article key={product.id} className="account-card"><h3>{product.name}</h3><p>{product.amount.toLocaleString('ko-KR')}원 {product.payment_type === 'SUBSCRIPTION' && '· 정기결제'}</p>{member ? <button disabled={busy} onClick={() => void checkout(product.id)}>구매하기</button> : <a href="/api/members/kakao">로그인 후 구매</a>}</article>)}
      </div></section>}
      {member && flags?.groble && <section><h2>구매 내역</h2><p>결제 후 반영까지 잠시 걸릴 수 있어요.</p><button disabled={busy} onClick={() => void refresh()}>새로고침</button>{orders.length === 0 && <p>구매 내역이 없습니다.</p>}{orders.map(order => <article className="account-card" key={order.id}><h3>{order.name}</h3><p>{labels[order.status]}</p><small>{new Date(order.createdAt).toLocaleString('ko-KR')} · {order.amount.toLocaleString('ko-KR')}원</small></article>)}</section>}
    </>}
    {error && <p role="alert">{error}</p>}
  </main>
}
