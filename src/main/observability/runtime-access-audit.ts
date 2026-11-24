import { appendFile, mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  RuntimeAccessAuditEntry,
  RuntimeAccessAuditResult
} from '../../shared/runtime-access-grants'
import {
  runtimeAccessAuditActionKey,
  runtimeAccessAuditActionLabel
} from '../../shared/runtime-access-audit-labels'

export const RUNTIME_ACCESS_AUDIT_RETENTION_DAYS = 14
const REPEAT_WINDOW_MS = 60_000

export type RuntimeAccessAuditFilter = {
  action?: string
  result?: RuntimeAccessAuditResult
  since?: number
  search?: string
}

export class RuntimeAccessAudit {
  private readonly directory: string
  private prunePromise: Promise<void> | null = null

  constructor(userDataPath: string) {
    this.directory = join(userDataPath, 'logs', 'orca-shared-host')
    void this.prune()
  }

  getDirectory(): string {
    return this.directory
  }

  // Refusals and failures often arrive in bursts from one attempt (a member typing sends one per
  // keystroke). One line per device, action and cause within the window is enough for an audit.
  private readonly lastRepeatableAt = new Map<string, number>()

  record(entry: RuntimeAccessAuditEntry): void {
    if (entry.result !== 'allowed') {
      const key = [
        entry.deviceId,
        entry.method,
        entry.result,
        entry.errorCode ?? '',
        entry.errorMessage ?? ''
      ].join('|')
      const last = this.lastRepeatableAt.get(key)
      // A clock that moved backwards makes an old stamp stale, not recent.
      if (last !== undefined && last <= entry.at && entry.at - last < REPEAT_WINDOW_MS) {
        return
      }
      for (const [staleKey, at] of this.lastRepeatableAt) {
        if (at > entry.at || entry.at - at >= REPEAT_WINDOW_MS) {
          this.lastRepeatableAt.delete(staleKey)
        }
      }
      this.lastRepeatableAt.set(key, entry.at)
    }
    const day = new Date(entry.at).toISOString().slice(0, 10)
    void mkdir(this.directory, { recursive: true })
      .then(() => appendFile(join(this.directory, `${day}.ndjson`), `${JSON.stringify(entry)}\n`))
      .catch((error) => console.warn('[runtime] Failed to write shared-host audit entry:', error))
    this.schedulePrune()
  }

  async list(filter: RuntimeAccessAuditFilter = {}): Promise<RuntimeAccessAuditEntry[]> {
    await this.prune()
    let files: string[]
    try {
      files = (await readdir(this.directory)).filter((file) =>
        /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(file)
      )
    } catch {
      return []
    }
    const entries: RuntimeAccessAuditEntry[] = []
    for (const file of files.toReversed()) {
      let contents: string
      try {
        contents = await readFile(join(this.directory, file), 'utf8')
      } catch {
        continue
      }
      for (const line of contents.split('\n')) {
        if (!line) {
          continue
        }
        try {
          const entry = JSON.parse(line) as RuntimeAccessAuditEntry
          if (matchesAuditFilter(entry, filter)) {
            entries.push(entry)
          }
        } catch {
          // Ignore a partial final line after a process interruption.
        }
      }
    }
    return entries.sort((a, b) => b.at - a.at)
  }

  async clear(): Promise<void> {
    let files: string[]
    try {
      files = await readdir(this.directory)
    } catch {
      return
    }
    await Promise.all(
      files
        .filter((file) => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(file))
        .map((file) => unlink(join(this.directory, file)).catch(() => undefined))
    )
  }

  private schedulePrune(): void {
    if (this.prunePromise) {
      return
    }
    this.prunePromise = this.prune().finally(() => {
      this.prunePromise = null
    })
  }

  private async prune(): Promise<void> {
    let files: string[]
    try {
      files = await readdir(this.directory)
    } catch {
      return
    }
    const cutoff = Date.now() - RUNTIME_ACCESS_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    await Promise.all(
      files
        .filter((file) => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(file))
        .filter((file) => Date.parse(file.slice(0, 10)) < cutoff)
        .map((file) =>
          unlink(join(this.directory, file)).catch(() => {
            // A concurrent cleanup can remove the same file first.
          })
        )
    )
  }
}

function matchesAuditFilter(
  entry: RuntimeAccessAuditEntry,
  filter: RuntimeAccessAuditFilter
): boolean {
  if (filter.action && runtimeAccessAuditActionKey(entry.method) !== filter.action) {
    return false
  }
  if (filter.result && entry.result !== filter.result) {
    return false
  }
  if (filter.since !== undefined && entry.at < filter.since) {
    return false
  }
  if (filter.search) {
    const haystack = `${entry.deviceId} ${entry.deviceName ?? ''} ${entry.method} ${runtimeAccessAuditActionLabel(runtimeAccessAuditActionKey(entry.method))} ${entry.memberId ?? ''}`
    if (!haystack.toLowerCase().includes(filter.search.toLowerCase())) {
      return false
    }
  }
  return true
}
