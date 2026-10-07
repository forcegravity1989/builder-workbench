import {
  ArchiveMergeProofSchema,
  type ArchiveProofRequest,
  type ArchiveProofResult
} from '../../shared/workbench/version-archive'
import type { VersionHistoryHost } from './version-history-service'
import {
  decodeHistorySnapshot,
  materialContentRevision,
  planningMaterialGitPath
} from './version-history-snapshot'
import { createArchiveStateChecker } from './version-history-archive-check'

export async function readCurrentMaterialArchive(
  host: VersionHistoryHost,
  params: ArchiveProofRequest
): Promise<ArchiveProofResult> {
  const scope = { repoId: params.repoId, worktreeId: params.worktreeId, hostId: params.hostId }
  const baseline = await host.baseline(scope)
  const path = planningMaterialGitPath(params.version, params.workflow)
  const unavailable = (reason: string, changed = false): ArchiveProofResult => ({
    mergeCommit: null,
    changed,
    proof: { kind: 'unknown', reason }
  })
  const paths = (
    await host.git(scope, [
      'ls-tree',
      '-r',
      '-z',
      '--name-only',
      baseline.commit,
      '--',
      '.bw/planning'
    ])
  )
    .toString('utf8')
    .split('\0')
  if (!paths.includes(path)) {
    return unavailable('当前材料尚未合入', true)
  }
  const raw = await host.git(scope, ['show', `${baseline.commit}:${path}`])
  const adopted = decodeHistorySnapshot(raw, params.version, params.workflow)
  if (
    materialContentRevision(raw) !== params.revision ||
    adopted.document.cycleId !== params.cycleId
  ) {
    return unavailable('当前材料有改动待归档', true)
  }
  const sourceCommit = (
    await host.git(scope, ['log', '-1', '--format=%H', baseline.commit, '--', path])
  )
    .toString('utf8')
    .trim()
  const state = await createArchiveStateChecker(host).archiveState(scope, {
    baseline,
    sourceCommit,
    version: params.version,
    workflow: params.workflow,
    cycleId: params.cycleId,
    revision: params.revision
  })
  if (state.kind !== 'adopted') {
    return unavailable(state.kind === 'unknown' ? state.message : '评审尚未合入')
  }
  const proof = ArchiveMergeProofSchema.parse(state.proof)
  return { mergeCommit: proof.mergeCommit, proof: { kind: 'verified', value: proof } }
}
