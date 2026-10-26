import type { PRCheckDetail } from './github/check-types'
import type { GitHubPRFile } from './github/pull-request-types'

// A CodeHub MR file row from `mr changes`, mapped onto the GitHub PR file shape
// the Files tab renders, with the raw unified-diff hunks carried alongside.
export type CodeHubMrFileChange = GitHubPRFile & {
  patch: string
}

// Why: `mr gate` states are free-form strings; unknown values must not read as
// success or failure, so they land on neutral like GitHub's unmatched checks.
const CHECK_STATE_MAP: Record<string, Pick<PRCheckDetail, 'status' | 'conclusion'>> = {
  success: { status: 'completed', conclusion: 'success' },
  failed: { status: 'completed', conclusion: 'failure' },
  failure: { status: 'completed', conclusion: 'failure' },
  error: { status: 'completed', conclusion: 'failure' },
  canceled: { status: 'completed', conclusion: 'cancelled' },
  cancelled: { status: 'completed', conclusion: 'cancelled' },
  skipped: { status: 'completed', conclusion: 'skipped' },
  running: { status: 'in_progress', conclusion: null },
  pending: { status: 'queued', conclusion: null },
  created: { status: 'queued', conclusion: null }
}

export function mapCodeHubGateChecks(rows: unknown): PRCheckDetail[] {
  if (!Array.isArray(rows)) {
    return []
  }
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return []
    }
    const record = row as Record<string, unknown>
    const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : null
    if (!name) {
      return []
    }
    const rawState = typeof record.state === 'string' ? record.state.trim().toLowerCase() : ''
    const mapped = CHECK_STATE_MAP[rawState] ?? { status: 'completed', conclusion: 'neutral' }
    const link = typeof record.link === 'string' && record.link.trim() ? record.link.trim() : null
    return [{ name, ...mapped, url: link }]
  })
}

function prFileStatusOf(record: Record<string, unknown>): GitHubPRFile['status'] {
  if (record.new_file === true) {
    return 'added'
  }
  if (record.deleted_file === true) {
    return 'removed'
  }
  if (record.renamed_file === true) {
    return 'renamed'
  }
  return 'modified'
}

export function mapCodeHubMrChanges(rows: unknown): CodeHubMrFileChange[] {
  if (!Array.isArray(rows)) {
    return []
  }
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return []
    }
    const record = row as Record<string, unknown>
    const path =
      typeof record.new_path === 'string' && record.new_path.trim()
        ? record.new_path.trim()
        : typeof record.file_path === 'string' && record.file_path.trim()
          ? record.file_path.trim()
          : null
    if (!path) {
      return []
    }
    const oldPath =
      typeof record.old_path === 'string' && record.old_path.trim()
        ? record.old_path.trim()
        : undefined
    return [
      {
        path,
        oldPath: oldPath && oldPath !== path ? oldPath : undefined,
        status: prFileStatusOf(record),
        additions: Number(record.added_lines ?? 0) || 0,
        deletions: Number(record.removed_lines ?? 0) || 0,
        isBinary: record.binary === true,
        patch: typeof record.diff === 'string' ? record.diff : ''
      }
    ]
  })
}

// Rebuild both file sides from unified-diff hunks. Hunks are concatenated; lines
// between hunks that the patch omits are not reconstructed, so line numbers count
// from the patch context, not the full file. `modifiedRealLines` maps each rebuilt
// modified line (index + 1) back to its real new-file line from the hunk headers,
// so line-anchored review notes address the same line CodeHub shows on the web.
export function parseCodeHubPatch(patch: string): {
  original: string
  modified: string
  modifiedRealLines: number[]
} {
  const originalLines: string[] = []
  const modifiedLines: string[] = []
  const modifiedRealLines: number[] = []
  let realNewLine: number | null = null
  for (const line of patch.split('\n')) {
    // A bare empty line is a split artifact of a leading/trailing newline —
    // real context lines always carry their ' ' prefix. Skip it or the
    // rebuilt sides gain a phantom blank line (and a phantom real-line map).
    if (line === '') {
      continue
    }
    if (line.startsWith('@@')) {
      // `@@ -oldStart[,count] +newStart[,count] @@`; the new start anchors the
      // real line number of the hunk's first modified-side line.
      const newStart = /^\s*@@\s*-\d+(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/.exec(line)
      realNewLine = newStart ? Number(newStart[1]) : null
      continue
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue
    }
    if (line.startsWith('\\')) {
      continue // "\ No newline at end of file"
    }
    if (line.startsWith('-')) {
      originalLines.push(line.slice(1))
    } else if (line.startsWith('+')) {
      modifiedLines.push(line.slice(1))
      // No hunk header (malformed patch): fall back to counting rebuilt lines.
      modifiedRealLines.push(realNewLine ?? modifiedLines.length)
      if (realNewLine !== null) {
        realNewLine += 1
      }
    } else {
      const context = line.startsWith(' ') ? line.slice(1) : line
      originalLines.push(context)
      modifiedLines.push(context)
      modifiedRealLines.push(realNewLine ?? modifiedLines.length)
      if (realNewLine !== null) {
        realNewLine += 1
      }
    }
  }
  return {
    original: originalLines.join('\n'),
    modified: modifiedLines.join('\n'),
    modifiedRealLines
  }
}
