import { lstat, readFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { lock } from 'proper-lockfile'
import { MILESTONES_PATH } from '../../shared/workbench/project-milestones'
import { durableWriteTempPath, writeFileDurable } from '../durable-file-write'
import { resolveVersionDocumentPath, resolveVersionPlanningRoot } from './version-document-path'

/** Cooperative file locks plus a fresh Git/content check; failures retain the working copy. */
export async function writeMilestoneFiles(input: {
  root: string
  writes: Map<string, string>
  removals: string[]
  contents: Map<string, string>
  recheck(): Promise<void>
  commit(): Promise<void>
}) {
  const paths = [...input.writes.keys(), ...input.removals]
  const files = new Map<string, string>()
  const releases: (() => Promise<void>)[] = []
  const lease: { error: Error | null } = { error: null }
  try {
    for (const path of paths.toSorted()) {
      let file: string
      if (path !== MILESTONES_PATH) {
        file = await resolveVersionDocumentPath(input.root, 'plan', path.split('/')[2], true)
      } else {
        file = join(dirname(await resolveVersionPlanningRoot(input.root, true)), 'milestones.json')
        for (const [target, directory] of [
          [file, false],
          [`${file}.lock`, true]
        ] as const) {
          try {
            const info = await lstat(target)
            if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) {
              throw new Error('里程碑材料路径不安全')
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error
            }
          }
        }
      }
      files.set(path, file)
      releases.push(
        await lock(file, {
          realpath: false,
          retries: 0,
          onCompromised: (error) => {
            lease.error = error
          }
        })
      )
    }
    await input.recheck()
    for (const [path, file] of files) {
      let raw: string | null = null
      try {
        raw = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
      if (raw !== (input.contents.get(path) ?? null)) {
        throw new Error(`文件已变化：${path}；草案保留`)
      }
    }
    for (const [path, raw] of input.writes) {
      if (lease.error) {
        throw lease.error
      }
      const file = files.get(path)!
      await writeFileDurable(durableWriteTempPath(file), file, raw)
    }
    for (const path of input.removals) {
      await unlink(files.get(path)!)
    }
    if (lease.error) {
      throw lease.error
    }
    await input.commit()
  } finally {
    for (const release of releases.toReversed()) {
      await release()
    }
  }
}
