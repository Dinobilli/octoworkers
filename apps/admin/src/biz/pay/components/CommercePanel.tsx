import { useEffect, useState } from 'react'
import type { AdminProduct, PaymentEventSummary } from '@octoworkers/com'
import { apiFetch } from '../../../com/api/client'
import { Panel } from '../../../com/ui/Panel'
const empty = { id: '', name: '', grobleContentId: '', checkoutUrl: '', amount: 0, paymentType: 'ONE_TIME', active: true }
export function CommercePanel() {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [events, setEvents] = useState<PaymentEventSummary[]>([])
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  async function refresh() {
    const [p, e] = await Promise.all([apiFetch<AdminProduct[]>('/api/admin/commerce/products'), apiFetch<PaymentEventSummary[]>('/api/admin/commerce/events')]); setProducts(p); setEvents(e)
  }
  useEffect(() => { refresh().catch(e => setError(e.message)) }, [])
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setSaved(false)
    try { await apiFetch('/api/admin/commerce/products', { method: 'POST', body: JSON.stringify(form) }); await refresh(); setSaved(true) }
    catch (e) { setError(e instanceof Error ? e.message : '저장 실패') } finally { setBusy(false) }
  }
  return <Panel eyebrow="Commerce" title="그로블 상품 연결">
    <p>그로블에서 만든 결제창을 연결합니다. 가격과 결제 유형은 그로블 상품 설정과 같아야 합니다.</p>
    <form className="form-grid" onSubmit={save}>
      <label>사이트 상품 ID<input required pattern="[a-z0-9][a-z0-9_-]{0,99}" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} /></label>
      <label>상품명<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>그로블 상품 ID<input required value={form.grobleContentId} onChange={e => setForm({ ...form, grobleContentId: e.target.value })} /></label>
      <label>그로블 결제 링크<input required type="url" value={form.checkoutUrl} onChange={e => setForm({ ...form, checkoutUrl: e.target.value })} /></label>
      <label>결제 금액 (원)<input required type="number" min="0" step="1" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></label>
      <label>결제 유형<select value={form.paymentType} onChange={e => setForm({ ...form, paymentType: e.target.value })}><option value="ONE_TIME">단건 결제</option><option value="SUBSCRIPTION">정기 결제</option></select></label>
      <label><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />사이트에 표시</label>
      <button disabled={busy}>저장</button>
    </form>
    {saved && <p role="status">저장했습니다.</p>}{error && <p role="alert">{error}</p>}
    <h3>연결된 상품</h3>{products.map(p => <article className="list-row" key={p.id}><div><strong>{p.name}</strong><p>{p.amount.toLocaleString()}원 · {p.is_active ? '표시 중' : '숨김'}</p></div><button onClick={() => { setForm({ id: p.id, name: p.name, grobleContentId: p.groble_content_id, checkoutUrl: p.checkout_url, amount: p.amount, paymentType: p.payment_type, active: p.is_active === 1 }); setSaved(false) }}>수정</button></article>)}
    <h3>최근 결제 알림</h3><button onClick={() => void refresh().catch(e => setError(e.message))}>새로고침</button>{events.map(e => <article className="list-row" key={e.id}><strong>{e.type}</strong><span>{e.seller_reference ?? e.merchant_uid ?? '연결 대기'}</span><small>{new Date(e.occurred_at).toLocaleString()}</small></article>)}
  </Panel>
}
