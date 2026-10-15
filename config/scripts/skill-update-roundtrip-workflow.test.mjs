import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const projectDir = resolve(import.meta.dirname, '../..')
const workflow = parse(
  readFileSync(join(projectDir, '.github/workflows/skill-update-roundtrip.yml'), 'utf8')
)

describe('skill-update-roundtrip workflow isolation', () => {
  it('is dispatch-only: the fork cannot satisfy its Orca release-tag prerequisite', () => {
    // Why: verify-skill-update-roundtrip.mjs materializes release-mapping
    // versions (Orca v1.4.x tags) via git ls-tree; this fork only carries
    // v0.4.0 / v0.5.0-rc.*, so every auto-triggered run was structurally red
    // (#352, #353 and the main push 09076a6e: 13/13 failures each). Downgraded
    // with the rest of the Orca CI matrix (ref/upstream.md §2.6); restoring any
    // automatic trigger needs a fork-satisfiable prerequisite and its own review.
    expect(workflow.on.pull_request).toBeUndefined()
    expect(workflow.on.push).toBeUndefined()
    expect(workflow.on.merge_group).toBeUndefined()
    expect(workflow.on).toHaveProperty('workflow_dispatch')
  })

  it('manual matrix runs only the Windows scenarios BW ships', () => {
    // Why: macOS / Ubuntu legs were dropped by human decision (2026-10-14) — BW
    // ships Windows installers. The removed ubuntu include leg pinned
    // skills-cli: latest with continue-on-error; both went with it.
    expect(workflow.jobs.roundtrip.strategy.matrix.os).toEqual(['windows-latest'])
    expect(workflow.jobs.roundtrip.strategy.matrix.include).toBeUndefined()
    expect(workflow.jobs.roundtrip['continue-on-error']).toBeUndefined()
  })
})
