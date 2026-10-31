import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { writeMilestoneFiles } from './milestone-write-files'
import { createMilestoneRecoveryStore } from './milestone-recovery'
import { readMilestoneSnapshot } from './milestone-snapshot'

it('preserves conflicting or unsafe milestone materials and client recovery snapshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bw-milestone-cas-'))
  try {
    const versionDir = join(root, '.bw', 'planning', 'v1')
    await mkdir(versionDir, { recursive: true })
    const project = '.bw/milestones.json',
      version = '.bw/planning/v1/data.json'
    await writeFile(join(root, project), 'project-old\n')
    await writeFile(join(root, version), 'version-old\n')
    const contents = new Map([
      [project, 'project-old\n'],
      [version, 'version-old\n']
    ])
    const writes = new Map([
      [project, 'project-new\n'],
      [version, 'version-new\n']
    ])
    let committed = false
    await expect(
      writeMilestoneFiles({
        root,
        contents,
        writes,
        removals: [],
        recheck: async () => {
          await writeFile(join(root, version), 'another-editor\n')
        },
        commit: async () => {
          committed = true
        }
      })
    ).rejects.toThrow('文件已变化')
    expect(await readFile(join(root, project), 'utf8')).toBe('project-old\n')
    expect(await readFile(join(root, version), 'utf8')).toBe('another-editor\n')
    expect(committed).toBe(false)
    expect(await readdir(versionDir)).not.toContain('data.json.lock')
    await writeFile(join(root, version), 'version-old\n')
    await writeMilestoneFiles({
      root,
      contents,
      writes,
      removals: [],
      recheck: async () => {},
      commit: async () => {
        expect(await readFile(join(root, version), 'utf8')).toBe('version-new\n')
        expect(await readdir(versionDir)).toContain('data.json.lock')
        committed = true
      }
    })
    expect(committed).toBe(true)
    expect(await readFile(join(root, project), 'utf8')).toBe('project-new\n')
    expect(await readdir(versionDir)).not.toContain('data.json.lock')
    await mkdir(join(root, '.bw', 'planning', 'v2', 'data.json'), { recursive: true })
    await expect(
      writeMilestoneFiles({
        root,
        contents: new Map(),
        writes: new Map([['.bw/planning/v2/data.json', '{}']]),
        removals: [],
        recheck: async () => {},
        commit: async () => {}
      })
    ).rejects.toThrow('not a regular file')
    const recoveryDirectory = join(root, 'profile', 'milestone-drafts')
    const recovery = createMilestoneRecoveryStore(() => recoveryDirectory)
    expect(await recovery.read('project')).toEqual({ revision: null, payload: null })
    const recoveryWrites = await Promise.allSettled([
      recovery.write({ key: 'project', expectedRevision: null, payload: 'unfinished input' }),
      recovery.write({ key: 'project', expectedRevision: null, payload: 'stale window' })
    ])
    expect(recoveryWrites[0].status).toBe('fulfilled')
    expect(recoveryWrites[1].status).toBe('rejected')
    const restarted = createMilestoneRecoveryStore(() => recoveryDirectory)
    const saved = await restarted.read('project')
    expect(saved.payload).toBe('unfinished input')
    await expect(
      restarted.write({
        key: 'project',
        expectedRevision: saved.revision,
        payload: '\0'.repeat(4 * 1024 * 1024)
      })
    ).rejects.toThrow('大小限制')
    expect(await restarted.read('project')).toEqual(saved)
    const cleared = await restarted.write({
      key: 'project',
      expectedRevision: saved.revision,
      payload: null
    })
    expect(cleared.revision).not.toBe(saved.revision)
    await expect(
      recovery.write({ key: 'project', expectedRevision: null, payload: 'stale empty window' })
    ).rejects.toThrow('另一窗口')
    const [recoveryFile] = await readdir(recoveryDirectory)
    await writeFile(join(recoveryDirectory, recoveryFile), 'broken')
    await expect(restarted.read('project')).rejects.toThrow()
    expect(await readFile(join(recoveryDirectory, recoveryFile), 'utf8')).toBe('broken')
    const repo = join(root, 'freeze-history')
    const planPath = join(repo, '.bw/planning/v1')
    await mkdir(planPath, { recursive: true })
    const git = (args: string[]) =>
      execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
    git(['init', '-b', 'main'])
    const plan = {
      schema_version: 3,
      version: 'v1',
      cycleId: 'old',
      summary: { progress: '', risks: '' },
      goals: [],
      tasks: []
    }
    await writeFile(join(planPath, 'data.json'), JSON.stringify(plan))
    const commit = () => {
      git(['add', '.bw'])
      git([
        '-c',
        'user.name=fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-m',
        'plan material'
      ])
      return git(['rev-parse', 'HEAD'])
    }
    commit()
    git(['branch', 'bw/v1/plan'])
    await writeFile(join(planPath, 'data.json'), JSON.stringify({ ...plan, cycleId: 'current' }))
    const head = commit()
    expect(
      (await readMilestoneSnapshot(repo, head, {}, new Set())).snapshot.versions[0].started
    ).toBe(false)
    git(['branch', '-f', 'bw/v1/plan', head])
    expect(
      (await readMilestoneSnapshot(repo, head, {}, new Set())).snapshot.versions[0].started
    ).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
