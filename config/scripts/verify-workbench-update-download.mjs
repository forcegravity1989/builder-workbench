import { mkdir, mkdtemp } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const outputDir = resolve('test-results/workbench-update-download')
await mkdir(outputDir, { recursive: true })
const entry = resolve(outputDir, 'main.cjs')
await build({
  entryPoints: ['tests/e2e/fixtures/workbench-update-download-main.ts'],
  outfile: entry,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'electron-updater']
})
const environment = {
  ...process.env,
  WORKBENCH_UPDATE_EVIDENCE_DIR: await mkdtemp(resolve(outputDir, 'run-'))
}
delete environment.ELECTRON_RUN_AS_NODE
const child = spawn(require('electron'), [entry, '--disable-gpu'], {
  env: environment,
  stdio: 'inherit',
  windowsHide: true
})
child.once('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = code ?? 1
})
