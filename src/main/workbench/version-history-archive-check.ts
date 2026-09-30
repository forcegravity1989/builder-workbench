import type { MetricScope } from '../../shared/workbench/metrics'
import { ArchiveMergeProofSchema } from '../../shared/workbench/version-archive'
import {
  historySnapshotRevision,
  planningMaterialGitPath
} from './version-history-snapshot'

export type ArchiveCandidate = {
  baseline: { ref: string; commit: string }
  sourceCommit: string
  version: string
  cycleId: string
  workflow: 'plan' | 'acceptance'
  revision: string
}
export type ArchiveHostState =
  | { kind: 'adopted'; proof: unknown }
  | { kind: 'draft' }
  | { kind: 'unknown'; message: string }
export type ArchiveCheckHost = {
  git(scope: MetricScope, args: string[]): Promise<Buffer>
  archiveState(scope: MetricScope, candidate: ArchiveCandidate): Promise<ArchiveHostState>
}

/**
 * Verifies native archive/provider evidence against the fixed material bytes.
 *
 * A provider merge commit need not equal the commit that last touched the
 * material: FF/rebase merges land several commits, and a squash lands one that
 * is neither. Proof is the real merge commit being on the adopted baseline AND
 * the material bytes in its tree being exactly this record's revision — never
 * sourceCommit equality alone, and never reachability without the byte check.
 * Insufficient evidence stays an honest Unknown; save/reachable is not archive.
 */
export function createArchiveStateChecker(host: ArchiveCheckHost) {
  async function archiveState(
    scope: MetricScope,
    candidate: ArchiveCandidate
  ): Promise<ArchiveHostState> {
    try {
      const state = await host.archiveState(scope, candidate)
      if (state.kind !== 'adopted') {
        return state
      }
      const parsed = ArchiveMergeProofSchema.safeParse(state.proof)
      if (
        !parsed.success ||
        parsed.data.material.workflow !== candidate.workflow ||
        parsed.data.material.version !== candidate.version ||
        parsed.data.material.cycleId !== candidate.cycleId ||
        parsed.data.material.revision !== candidate.revision
      ) {
        return { kind: 'unknown', message: '归档依据与所选材料修订不一致' }
      }
      const proof = parsed.data
      try {
        await host.git(scope, [
          'merge-base',
          '--is-ancestor',
          proof.mergeCommit,
          candidate.baseline.commit
        ])
      } catch {
        return { kind: 'unknown', message: '归档合入提交不在项目采用分支上' }
      }
      let merged: Buffer
      try {
        merged = await host.git(scope, [
          'show',
          `${proof.mergeCommit}:${planningMaterialGitPath(candidate.version, candidate.workflow)}`
        ])
      } catch {
        return { kind: 'unknown', message: '无法在归档合入提交中读回材料' }
      }
      if (historySnapshotRevision(merged) !== candidate.revision) {
        return { kind: 'unknown', message: '归档合入提交中的材料与所选修订不一致' }
      }
      return { kind: 'adopted', proof }
    } catch (error) {
      return {
        kind: 'unknown',
        message: error instanceof Error ? error.message : '归档来源暂不可核对'
      }
    }
  }

  return { archiveState }
}
