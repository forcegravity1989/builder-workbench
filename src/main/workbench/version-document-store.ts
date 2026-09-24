import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { lock } from 'proper-lockfile'
import {
  validatePlanningVersion,
  VersionDocumentError,
  type VersionDocumentIdentity,
  type VersionDocumentPort,
  type VersionDocumentSnapshot,
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
}

export function createVersionDocumentStore<T extends VersionDocumentIdentity>(
  options: StoreOptions<T>
): VersionDocumentPort<T> {
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
          'Schema 2 requires explicit migration before editing'
        )
      }
      if (
        !value ||
        value.schema_version !== 3 ||
        value.version !== version ||
        typeof value.cycleId !== 'string' ||
        !value.cycleId.trim()
      ) {
        throw new Error('Invalid schema, version or cycle identity')
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
        error instanceof Error ? error.message : 'Invalid version document'
      )
    }
  }

  function snapshot(raw: Buffer, version: string): VersionDocumentSnapshot<T> {
    return {
      document: decode(raw.toString('utf8'), version),
      revision: `sha256:${createHash('sha256').update(raw).digest('hex')}`
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

  return {
    async read(version) {
      return readAt(await pathFor(version), version)
    },
    async save(input) {
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
        const current = await readAt(file, input.version)
        const currentRevision = current?.revision ?? null
        if (input.expectedRevision !== currentRevision) {
          throw new VersionDocumentError(
            'revision-conflict',
            'Version document changed; reread before merging your draft',
            currentRevision
          )
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
  }
}
