import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { writeMilestoneFiles } from './milestone-write-files'

it('validates all source bytes under locks before publishing and preserves conflicting or unsafe material', async () => {
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
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
