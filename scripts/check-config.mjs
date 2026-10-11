import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
const { values } = parseArgs({ options: { env: { type: 'string' } } })
if (values.env && values.env !== 'staging') throw new Error('Only staging or production (omit --env) is supported')
const config = JSON.parse(readFileSync(resolve(import.meta.dirname, '../worker/wrangler.jsonc'), 'utf8'))
const selected = values.env ? config.env?.[values.env] : config
const errors = []
if (!selected) errors.push('Environment is missing')
if (selected) {
  for (const [key, value] of Object.entries(selected.vars ?? {})) if (/REPLACE_WITH/.test(String(value))) errors.push(`${key} still contains a placeholder`)
  if (!['session', 'hybrid', 'cloudflare-access'].includes(selected.vars?.ADMIN_ACCESS_MODE)) errors.push('Production authentication must be enabled')
  if (!selected.d1_databases?.[0]?.database_id || selected.d1_databases.some(db => db.database_id.includes('REPLACE_'))) errors.push('D1 database IDs are missing')
  if (selected.kv_namespaces?.some(kv => kv.id.includes('REPLACE_'))) errors.push('KV namespace IDs are missing')
  const vars = selected.vars ?? {}
  if (vars.ADMIN_ACCESS_MODE === 'cloudflare-access' || vars.ADMIN_ACCESS_MODE === 'hybrid') {
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(vars.CF_ACCESS_TEAM_DOMAIN ?? '') || !vars.CF_ACCESS_AUD) errors.push('Access team domain and audience are required')
  }
  if (vars.ENABLE_GROBLE === 'true' && vars.ENABLE_KAKAO !== 'true') errors.push('Member checkout requires the Kakao module')
  if (vars.ENABLE_KAKAO === 'true') {
    try {
      const callback = new URL(vars.KAKAO_REDIRECT_URI)
      if (callback.protocol !== 'https:' || callback.pathname !== '/api/members/kakao/callback' || callback.hostname !== vars.APP_DOMAIN || callback.search || callback.hash || callback.username || callback.password) errors.push('Kakao callback must use the configured HTTPS application origin')
    } catch { errors.push('Kakao callback is missing or invalid') }
  }
  if (vars.ENABLE_AGENTS === 'true' && !selected.durable_objects?.bindings?.some(binding => binding.class_name === 'OpsAgent')) errors.push('Agents module requires an OpsAgent binding in this environment')

  if (values.env && selected.d1_databases?.some(db => config.d1_databases.some(prod => prod.database_id === db.database_id))) errors.push('Staging must use a separate D1 database')
  if (values.env && selected.kv_namespaces?.some(kv => config.kv_namespaces.some(prod => prod.id === kv.id))) errors.push('Staging must use a separate KV namespace')
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('Deploy configuration verified. Set environment-specific secrets separately.')
