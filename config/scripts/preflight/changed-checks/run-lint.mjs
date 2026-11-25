// `pnpm lint`: runs the independent lint steps in a bounded pool, printing output only for failures.
import { runProcess } from '@orca/process-host'
import { readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { resolveOxlintInvocation } from '../../tool-invocation/oxlint-cli-invocation.mjs'
import { resolvePnpmCliInvocation } from '../../tool-invocation/pnpm-cli-invocation.mjs'

// Keep the BW main lint contract while using the native bounded runner.
export const LINT_STEPS = [
  'oxlint',
  'audit:anti-slop',
  'audit:code-quality:native',
  'audit:code-quality:type-aware',
  'check:reliability-gates',
  'check:dead-classes',
  'check:design-system-tokens',
  'check:max-lines-ratchet',
  'check:ts-nocheck-ratchet',
  'check:runtime-electron-ratchet',
  'check:readme-local-links',
  'verify:rpc-params-catalog',
  'verify:bundled-skill-guides',
  'verify:skill-bundle-manifest',
  'verify:localization-catalog',
  'verify:localization-runtime-catalog',
  'verify:localization-extraction',
  'verify:localization-coverage',
  'verify:workbench-skills'
]

// Steps with no package script of their own run as the bare command.
function resolveLintCommands(scripts, root) {
  const pnpm = resolvePnpmCliInvocation()
  return LINT_STEPS.map((name) => {
    if (name === 'oxlint') {
      const { command, prefixArgs } = resolveOxlintInvocation(root)
      return { name, program: command, args: prefixArgs }
    }
    if (!scripts[name]) {
      throw new Error(`Lint step ${name} has no package.json script.`)
    }
    return { name, program: pnpm.command, args: [...pnpm.prefixArgs, 'run', name] }
  })
}

async function runStep({ name, program, args }, root) {
  const startedAt = performance.now()
  try {
    const result = await runProcess({ program, args, cwd: root, timeoutMs: null }, 'tail')
    return {
      name,
      ok: result.code === 0 && !result.signal && !result.timedOut,
      output: result.stdout + result.stderr,
      elapsed: `${((performance.now() - startedAt) / 1000).toFixed(1)}s`
    }
  } catch (error) {
    return { name, ok: false, output: error.message ?? String(error), elapsed: 'failed to start' }
  }
}

async function main(root, argv) {
  const startedAt = performance.now()
  const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  // Individual linters also use multiple cores.
  let concurrency = Math.max(2, Math.min(4, Math.floor(availableParallelism() / 4)))
  let timings = false
  for (const argument of argv) {
    if (argument === '--') {
      continue
    }
    if (argument === '--timings') {
      timings = true
    } else if (/^--max-?workers=[1-9]\d*$/i.test(argument)) {
      concurrency = Number(argument.split('=')[1])
    } else {
      throw new Error(`Unknown option ${argument}. Use --maxWorkers=<n> or --timings.`)
    }
  }
  const steps = resolveLintCommands(scripts, root)
  const results = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, steps.length) }, async () => {
      while (next < steps.length) {
        const result = await runStep(steps[next++], root)
        if (!result.ok) {
          console.error(`\n✗ ${result.name} (${result.elapsed})\n${result.output.trimEnd()}`)
        } else if (timings) {
          console.log(`✓ ${result.name} (${result.elapsed})`)
        }
        results.push(result)
      }
    })
  )
  const failed = results.filter((result) => !result.ok)
  const elapsed = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`
  if (failed.length > 0) {
    console.error(
      `\n✗ ${failed.length} of ${results.length} lint step(s) failed in ${elapsed}: ${failed.map((result) => result.name).join(', ')}`
    )
    return 1
  }
  console.log(`✓ ${results.length} lint step(s) passed in ${elapsed}.`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main(
      path.resolve(import.meta.dirname, '../../../..'),
      process.argv.slice(2)
    )
  } catch (error) {
    console.error(`lint: ${error.message ?? error}`)
    process.exitCode = 1
  }
}
