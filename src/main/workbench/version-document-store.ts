import { createHash } from 'node:crypto'
import { materialContentRevision } from './version-history-snapshot'
import { lstat, open, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { lock } from 'proper-lockfile'
import {
  validatePlanningVersion,
  VersionDocumentError,
  type VersionDocumentIdentity,
  type VersionDocumentPort,
  type VersionDocumentSnapshot,
  type VersionDocumentSave,
  type VersionWorkflow
} from '../../shared/workbench/version-document'
import { durableWriteTempPath, writeFileDurableIfCurrent } from '../durable-file-write'
import { isMissingFile, resolveVersionDocumentPath } from './version-document-path'

type StoreOptions<T extends VersionDocumentIdentity> = {
  /** Resolved and authorized by the host; never a path supplied directly by a model/renderer. */
  trustedWorkspacePath: string
  workflow: VersionWorkflow
  /** Feature-owned validation; the transaction core only owns the common identity envelope. */
  decode: (value: unknown) => T
  /** Recheck native workspace authority after acquiring the document lock. */
  beforeCommit?: () => Promise<void>
}

export function createVersionDocumentStore<T extends VersionDocumentIdentity>(
  options: StoreOptions<T>
): VersionDocumentPort<T> & {
  readLegacy(
    version: string,
    sourceRevision?: string
  ): Promise<{ document: unknown; revision: string }>
  migrateLegacy(input: VersionDocumentSave<T>): Promise<VersionDocumentSnapshot<T>>
} {
  const pathFor = (version: string, createDirectories = false) =>
    resolveVersionDocumentPath(
      options.trustedWorkspacePath,
      options.workflow,
      version,
      createDirectories
    )

  function decode(raw: string, version: string): T {
    try {
      const value = JSON.parse(raw) as Record<string, unknown> | null
      if (value?.schema_version === 2) {
        throw new VersionDocumentError(
          'migration-required',
          '此版本材料是旧格式（schema2），需显式迁移后才能编辑；点「新建计划／验收」会把迁移请求带入会话，由模型按迁移约定转换（改动前经你确认）'
        )
      }
      if (
        !value ||
        value.schema_version !== 3 ||
        value.version !== version ||
        typeof value.cycleId !== 'string' ||
        !value.cycleId.trim()
      ) {
        throw new Error('材料文件的结构、版本或周期标识无法识别，未做任何修改')
      }
      const decoded = options.decode(value)
      if (
        decoded.schema_version !== 3 ||
        decoded.version !== version ||
        decoded.cycleId !== value.cycleId
      ) {
        throw new Error('Feature decoder must preserve document identity')
      }
      return decoded
    } catch (error) {
      if (error instanceof VersionDocumentError) {
        throw error
      }
      throw new VersionDocumentError(
        'invalid-document',
        error instanceof Error ? error.message : '材料文件无法读取'
      )
    }
  }

  function snapshot(raw: Buffer, version: string): VersionDocumentSnapshot<T> {
    return {
      document: decode(raw.toString('utf8'), version),
      revision: materialContentRevision(raw)
    }
  }

  async function readAt(file: string, version: string): Promise<VersionDocumentSnapshot<T> | null> {
    let raw: Buffer
    try {
      raw = await readFile(file)
    } catch (error) {
      if (isMissingFile(error)) {
        return null
      }
      throw error
    }
    return snapshot(raw, version)
  }

  const revisionOf = (raw: Buffer) => `sha256:${createHash('sha256').update(raw).digest('hex')}`
  function legacySnapshot(raw: Buffer, version: string) {
    const document = JSON.parse(raw.toString('utf8'))
    if (document?.schema_version !== 2 || document.version !== version) {
      throw new VersionDocumentError(
        'invalid-document',
        'Only the selected schema 2 source can be migrated'
      )
    }
    return { document: document as unknown, revision: revisionOf(raw) }
  }
  function backupPath(file: string, revision: string) {
    if (!/^sha256:[a-f0-9]{64}$/.test(revision)) {
      throw new VersionDocumentError('invalid-document', 'Invalid migration source revision')
    }
    return join(dirname(file), `schema2-${revision.slice(7)}.json`)
  }
  async function readRegular(file: string) {
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new VersionDocumentError('unsafe-path', 'Migration source must be a regular file')
    }
    return readFile(file)
  }
  async function preserveLegacy(file: string, raw: Buffer, revision: string) {
    const backup = backupPath(file, revision)
    try {
      const handle = await open(backup, 'wx')
      try {
        await handle.writeFile(raw)
        await handle.sync()
      } finally {
        await handle.close()
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
      if (!(await readRegular(backup)).equals(raw)) {
        throw new VersionDocumentError(
          'invalid-document',
          'Preserved migration source differs; original material was not replaced'
        )
      }
    }
  }
  async function write(input: VersionDocumentSave<T>, migrate: boolean) {
    validatePlanningVersion(input.version)
    let payload: string
    try {
      payload = `${JSON.stringify(input.document, null, 2)}\n`
    } catch {
      throw new VersionDocumentError(
        'invalid-document',
        'Version document must be JSON serializable'
      )
    }
    // Validate the serialized bytes, including any feature fields, before touching the filesystem.
    const next = snapshot(Buffer.from(payload, 'utf8'), input.version)
    const file = await pathFor(input.version, true)
    const lease: { error: Error | null } = { error: null }
    const release = await lock(file, {
      realpath: false,
      retries: { retries: 20, factor: 1.3, minTimeout: 10, maxTimeout: 250, randomize: true },
      onCompromised: (error) => {
        lease.error = error
      }
    })
    try {
      await pathFor(input.version)
      const legacyRaw = migrate ? await readRegular(file) : null
      const current = legacyRaw
        ? legacySnapshot(legacyRaw, input.version)
        : await readAt(file, input.version)
      const currentRevision = current?.revision ?? null
      if (input.expectedRevision !== currentRevision) {
        throw new VersionDocumentError(
          'revision-conflict',
          'Version document changed; reread before merging your draft',
          currentRevision
        )
      }
      await options.beforeCommit?.()
      if (legacyRaw) {
        await preserveLegacy(file, legacyRaw, currentRevision!)
        await options.beforeCommit?.()
      }
      const committed = await writeFileDurableIfCurrent(
        durableWriteTempPath(file),
        file,
        payload,
        () => lease.error === null
      )
      if (!committed) {
        throw new VersionDocumentError(
          'lock-compromised',
          'Document lock was lost; reread before retrying'
        )
      }
      return next
    } finally {
      await release().catch((error: unknown) => {
        if (!lease.error) {
          throw error
        }
      })
    }
  }
  return {
    async read(version) {
      return readAt(await pathFor(version), version)
    },
    async readLegacy(version, sourceRevision) {
      const current = await pathFor(version)
      const raw = await readRegular(sourceRevision ? backupPath(current, sourceRevision) : current)
      const source = legacySnapshot(raw, version)
      if (sourceRevision && source.revision !== sourceRevision) {
        throw new VersionDocumentError('invalid-document', 'Preserved source hash differs')
      }
      return source
    },
    save: (input) => write(input, false),
    migrateLegacy: (input) => write(input, true)
  }
}
