import { parseArgs } from 'node:util'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string', default: 'Owner' }, remote: { type: 'boolean', default: false }, env: { type: 'string' } } })
if (!values.email || !/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(values.email) || values.name.length > 100 || (values.env && values.env !== 'staging')) {
  console.error('Usage: pnpm admin:bootstrap --email owner@example.com [--name Owner] [--remote] [--env staging]'); process.exit(1)
}
const quote = value => `'${value.replaceAll("'", "''")}'`
const directory = mkdtempSync(join(tmpdir(), 'octoworkers-owner-'))
try {
  const file = join(directory, 'bootstrap.sql')
  writeFileSync(file, `INSERT INTO admin_users (email, name, role, is_active, created_at, updated_at)
    SELECT ${quote(values.email.toLowerCase())}, ${quote(values.name)}, 'super_admin', 1, datetime('now'), datetime('now')
    WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE role = 'super_admin' AND is_active = 1)
    ON CONFLICT(email) DO NOTHING;\nSELECT email, role FROM admin_users WHERE role = 'super_admin' AND is_active = 1;`, { mode: 0o600 })
  const result = spawnSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', values.remote ? '--remote' : '--local', ...(values.env ? ['--env', values.env] : []), '--file', file], { cwd: resolve(import.meta.dirname, '../worker'), stdio: 'inherit', shell: false })
  process.exitCode = result.status ?? 1
} finally { rmSync(directory, { recursive: true, force: true }) }
