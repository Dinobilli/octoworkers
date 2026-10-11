import { readdirSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, lstatSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
export const TEMPLATE_ROOTS = ['apps', 'packages', 'worker', '_templates', 'docs', 'scripts', '.github', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', '.gitignore', 'README.md', 'AGENTS.md', 'CLAUDE.md']
const skip = new Set(['node_modules', 'dist', '.git', '.wrangler', '.wrangler-dry', '.wrangler-dry-staging', 'coverage', 'public', 'daily', '.private', '.codex', '.claude', '.aws'])
export function files(root, prefix = '') {
  const output = []
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name)
    if (entry.isSymbolicLink() || skip.has(entry.name) || (/^(\.env|\.dev\.vars)/.test(entry.name) && !entry.name.endsWith('.example')) || /\.(pem|key|p12|tgz)$/.test(entry.name) || entry.name === 'wrangler.local.jsonc' || entry.name === 'CLAUDE.local.md') continue
    if (entry.isDirectory()) output.push(...files(root, relative))
    else output.push(relative)
  }
  return output
}
export function validate(config) {
  for (const key of ['slug', 'scope']) if (!/^[a-z][a-z0-9-]{0,49}$/.test(config[key])) throw new Error(`Invalid ${key}`)
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(config.domain)) throw new Error('Invalid domain')
  if (!/^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/.test(config.email)) throw new Error('Invalid email')
  if (!['basic', 'full'].includes(config.preset)) throw new Error('Preset must be basic or full')
  if (config.groble && !config.kakao) throw new Error('Groble member checkout requires Kakao in this template')
}
export function customize(text, c) {
  // Most specific tokens first; replacements are literal, never regex replacement strings.
  const replacements = [ ['REPLACE_WITH_ADMIN_EMAIL', c.email], ['REPLACE_WITH_DOMAIN', c.domain], ['founder@example.com', c.email], ['owner@example.com', c.email], ['admin.example.com', `admin.${c.domain}`], ['example.com', c.domain], ['admin.octoworkers.com', `admin.${c.domain}`], ['app.octoworkers.com', `app.${c.domain}`], ['octoworkers.com', c.domain], ['@octoworkers/', `@${c.scope}/`], ['octoworkers', c.slug], ['옥토워커스', c.slug] ]
  for (const [from, to] of replacements) text = text.split(from).join(to)
  return text
}
export function configure(base, c) {
  for (const env of [base, base.env.staging]) {
    const staging = env === base.env.staging
    Object.assign(env.vars, { ENABLE_KAKAO: String(c.kakao), ENABLE_GROBLE: String(c.groble), ENABLE_AI: String(c.preset === 'full'), ENABLE_AGENTS: String(c.preset === 'full'), ENABLE_VECTOR: 'false', ENABLE_EXAMPLES: String(c.preset === 'full'),
      KAKAO_REDIRECT_URI: c.kakao ? `https://${staging ? 'staging.' : ''}${c.domain}/api/members/kakao/callback` : '' })
    if (c.preset === 'full') {
      env.ai = { binding: 'AI' }
      env.durable_objects = { bindings: [{ name: 'OpsAgent', class_name: 'OpsAgent' }] }
      env.migrations = [{ tag: 'v1', new_sqlite_classes: ['OpsAgent'] }]
    }
  }
  return base
}
export function scaffold(template, target, config) {
  validate(config)
  if (existsSync(target) && (lstatSync(target).isSymbolicLink() || readdirSync(target).length)) throw new Error('Destination must be an empty directory')
  mkdirSync(target, { recursive: true })
  for (const relative of files(template)) {
    const destination = path.join(target, relative)
    mkdirSync(path.dirname(destination), { recursive: true })
    if (/\.(png|jpe?g|gif|ico|woff2?|ttf|webp|pdf|zip)$/i.test(relative)) copyFileSync(path.join(template, relative), destination)
    else writeFileSync(destination, customize(readFileSync(path.join(template, relative), 'utf8'), config))
  }
  const configPath = path.join(target, 'worker/wrangler.jsonc')
  writeFileSync(configPath, JSON.stringify(configure(JSON.parse(readFileSync(configPath, 'utf8')), config), null, 2) + '\n')
  const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8'))
  delete pkg.scripts['build:cli']; delete pkg.scripts['test:cli']
  pkg.scripts.test = `pnpm --filter @${config.scope}/worker test`
  writeFileSync(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  // The generator itself is not a dependency of generated applications.
  writeFileSync(path.join(target, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n  - worker\n')
  const local = readFileSync(path.join(target, 'worker/.dev.vars.example'), 'utf8')
    .replace('owner@example.com', config.email).replace(/ADMIN_LOGIN_PASSWORD=.*/, `ADMIN_LOGIN_PASSWORD=${randomBytes(24).toString('base64url')}`)
    .replace('ENABLE_KAKAO=false', `ENABLE_KAKAO=${config.kakao}`).replace('ENABLE_GROBLE=false', `ENABLE_GROBLE=${config.groble}`)
  writeFileSync(path.join(target, 'worker/.dev.vars'), local, { mode: 0o600 })
  return target
}
