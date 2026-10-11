import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { scaffold, files } from '../src/engine.mjs'
const cli = path.resolve(import.meta.dirname, '..')
const root = path.dirname(cli)
test('packaged CLI generates usable projects outside the repository for both presets', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'octoworkers-pack-'))
  try {
    execFileSync('node', [path.join(cli, 'build.js')])
    const result = execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--cache', path.join(temp, 'npm-cache'), '--pack-destination', temp], { cwd: cli, encoding: 'utf8' })
    const pack = JSON.parse(result)[0]
    assert.ok(pack.files.some(f => f.path === 'template/worker/src/index.ts'))
    assert.ok(!pack.files.some(f => /(^|\/)\.dev\.vars(?!\.example)/.test(f.path)))
    execFileSync('tar', ['-xzf', path.join(temp, pack.filename), '-C', temp])
    for (const preset of ['basic', 'full']) {
      const destination = path.join(temp, `demo-${preset}`)
      execFileSync('node', [path.join(temp, 'package/dist/index.mjs'), destination, '--yes', '--scope', 'my-team', '--domain', 'demo.test', '--email', 'owner@demo.test', '--groble', '--preset', preset])
      assert.ok(existsSync(path.join(destination, 'worker/src/biz/pay/routes.ts')))
      const pkg = JSON.parse(readFileSync(path.join(destination, 'worker/package.json'), 'utf8'))
      assert.equal(pkg.name, '@my-team/worker')
      const config = JSON.parse(readFileSync(path.join(destination, 'worker/wrangler.jsonc'), 'utf8'))
      assert.equal(config.vars.ADMIN_LOGIN_EMAIL, 'owner@demo.test')
      assert.equal(config.vars.APP_DOMAIN, 'demo.test')
      assert.equal(config.vars.ENABLE_KAKAO, 'true')
      assert.equal(config.vars.ENABLE_GROBLE, 'true')
      assert.notEqual(config.d1_databases[0].database_id, config.env.staging.d1_databases[0].database_id)
      assert.equal(Boolean(config.durable_objects), preset === 'full')
      assert.ok(!readFileSync(path.join(destination, 'worker/.dev.vars'), 'utf8').includes('ADMIN_LOGIN_PASSWORD=replace-'))
    }
  } finally { rmSync(temp, { recursive: true, force: true }) }
})
test('generation rejects shell-shaped config, occupied directories and source secrets', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'octoworkers-guard-'))
  try {
    const cfg = { slug: 'demo', scope: 'team', domain: 'demo.test', email: 'owner@demo.test', preset: 'basic', kakao: false, groble: false }
    assert.throws(() => scaffold(root, path.join(temp, 'bad'), { ...cfg, slug: 'demo; touch x' }))
    const target = path.join(temp, 'existing'); mkdirSync(target); writeFileSync(path.join(target, 'keep'), 'unchanged')
    assert.throws(() => scaffold(root, target, cfg)); assert.equal(readFileSync(path.join(target, 'keep'), 'utf8'), 'unchanged')
    writeFileSync(path.join(temp, '.dev.vars.staging'), 'secret'); writeFileSync(path.join(temp, '.env'), 'secret'); writeFileSync(path.join(temp, '.dev.vars.example'), 'example')
    assert.ok(!files(temp).includes('.dev.vars.staging')); assert.ok(!files(temp).includes('.env')); assert.ok(files(temp).includes('.dev.vars.example'))
  } finally { rmSync(temp, { recursive: true, force: true }) }
})
