#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { scaffold } from './engine.mjs'
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  yes: { type: 'boolean', default: false }, scope: { type: 'string' }, domain: { type: 'string' }, email: { type: 'string' },
  preset: { type: 'string', default: 'basic' }, kakao: { type: 'boolean', default: false }, groble: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
} })
if (values.help) {
  console.log('create-octoworkers <directory> [--yes --scope my-team --domain example.com --email owner@example.com] [--kakao] [--groble] [--preset basic|full]')
  process.exit(0)
}
const prompt = !values.yes ? createInterface({ input: process.stdin, output: process.stdout }) : null
const ask = async (label, fallback) => prompt ? (await prompt.question(`${label} [${fallback}]: `)).trim() || fallback : fallback
try {
  const target = positionals[0] || await ask('Project directory', 'my-saas')
  const slug = target.split(/[\\/]/).filter(Boolean).at(-1)
  const config = { slug, scope: values.scope || await ask('Package scope', slug), domain: values.domain || await ask('Domain (can be changed later)', `${slug}.com`), email: values.email || await ask('Owner email', 'owner@example.com'), preset: values.preset,
    kakao: values.kakao || values.groble, groble: values.groble }
  scaffold(resolve(import.meta.dirname, '../template'), resolve(target), config)
  console.log(`Created ${resolve(target)}\nNext: pnpm install; copy the setup steps in docs/05-boilerplate-upgrade.md.\nLocal password is in worker/.dev.vars. No cloud resources were created.`)
} catch (error) { console.error(error instanceof Error ? error.message : 'Project creation failed'); process.exitCode = 1 }
finally { prompt?.close() }
