import { mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEMPLATE_ROOTS, files } from './src/engine.mjs'
const cli = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(cli)
for (const directory of ['dist', 'template']) { rmSync(path.join(cli, directory), { recursive: true, force: true }); mkdirSync(path.join(cli, directory), { recursive: true }) }
for (const file of ['index.mjs', 'engine.mjs']) copyFileSync(path.join(cli, 'src', file), path.join(cli, 'dist', file))
for (const relative of files(root)) {
  if (!TEMPLATE_ROOTS.includes(relative.split(path.sep)[0])) continue
  const destination = path.join(cli, 'template', relative)
  mkdirSync(path.dirname(destination), { recursive: true }); copyFileSync(path.join(root, relative), destination)
}
// Generated projects test their own application, not this unpublished generator.
const workflow = path.join(cli, 'template/.github/workflows/ci.yml')
if (existsSync(workflow)) writeFileSync(workflow, readFileSync(workflow, 'utf8').replace(/.*pnpm build:cli.*\n/g, ''))
console.log('CLI and clean template packaged.')
