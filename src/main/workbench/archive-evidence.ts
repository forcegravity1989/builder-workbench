import type { ArchiveMergeProof, ArchivedMaterial } from '../../shared/workbench/version-archive'
import { SourceCommit } from '../../shared/workbench/version-material'
import {
  decodeHistorySnapshot,
  materialContentRevision,
  planningMaterialGitPath
} from './version-history-snapshot'

export type ArchiveCandidate = {
  sourceCommit: string
  version: string
  cycleId: string
  workflow: 'plan' | 'acceptance'
  revision: string
}
export type ArchiveState =
  | { kind: 'adopted'; proof: ArchiveMergeProof }
  | { kind: 'draft' }
  | { kind: 'unknown'; message: string }
export type ArchiveProofMaterial = ArchivedMaterial
export type ArchiveProofOutcome = {
  mergeCommit: string | null
  proof: { kind: 'verified'; value: ArchiveMergeProof } | { kind: 'unknown'; reason: string }
}

/** Subset of the REST pull object; every field is a documented provider return. */
export type CommitPullEntry = { number: number; state?: string }
export type PullMergeFacts = {
  state: string
  merged: boolean
  mergeCommit: string | null
}

export type ArchiveEvidenceDeps = {
  /** REST commits/{oid}/pulls: the provider's own commit→PR association. */
  listPullsForCommit(commit: string): Promise<CommitPullEntry[]>
  /** REST pulls/{n}: merged_at and merge_commit_sha are provider-reported facts. */
  readPullMergeFacts(number: number): Promise<PullMergeFacts>
  /** Raw material bytes in a commit's tree; null means the path is proven absent. */
  readMaterialAt(commit: string, path: string): Promise<Buffer | null>
  now?(): string
}

// Merged-PR facts and committed trees are immutable, so definitive entries only
// bound memory; open-review states can flip and get a short TTL. Same shape as
// the native merged-PR commit-membership cache.
const DEFINITIVE_TTL_MS = 6 * 60 * 60 * 1000
const MUTABLE_TTL_MS = 60 * 1000
const CACHE_MAX_ENTRIES = 500
const cache = new Map<string, { value: unknown; expiresAt: number }>()

function pruneCache(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key)
    }
  }
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) {
      break
    }
    cache.delete(oldest)
  }
}

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  pruneCache(now)
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) {
    return hit.value as T
  }
  const value = await load()
  cache.set(key, { value, expiresAt: now + ttl })
  return value
}

export function resetArchiveEvidenceCacheForTests(): void {
  cache.clear()
}

/**
 * Provider-first archive evidence over GitHub REST facts. Reachability, first
 * parent chains or merge shapes alone never prove adoption: a record is adopted
 * only when a merged review's own merge commit carries exactly this material
 * revision in its tree.
 */
export function createArchiveEvidenceReader(repoKey: string, deps: ArchiveEvidenceDeps) {
  async function pullFacts(number: number): Promise<PullMergeFacts> {
    const key = `pull:${repoKey}:${number}`
    const now = Date.now()
    pruneCache(now)
    const hit = cache.get(key)
    if (hit && hit.expiresAt > now) {
      return hit.value as PullMergeFacts
    }
    const facts = await deps.readPullMergeFacts(number)
    if (facts.merged && facts.mergeCommit) {
      SourceCommit.parse(facts.mergeCommit)
    }
    cache.set(key, {
      value: facts,
      expiresAt: Date.now() + (facts.merged ? DEFINITIVE_TTL_MS : MUTABLE_TTL_MS)
    })
    return facts
  }

  /**
   * The merged commit's material is decoded, not just hashed: a proof must bind
   * the claimed cycle to the bytes' own identity, or a fresh cycleId over an old
   * revision would inherit the previous round's archived green.
   */
  async function mergedMaterialAt(mergeCommit: string, material: ArchiveProofMaterial) {
    return cached(
      `bytes:${repoKey}:${mergeCommit}:${material.workflow}:${material.version}`,
      DEFINITIVE_TTL_MS,
      async () => {
        const raw = await deps.readMaterialAt(
          mergeCommit,
          planningMaterialGitPath(material.version, material.workflow)
        )
        if (raw === null) {
          return null
        }
        const decoded = decodeHistorySnapshot(raw, material.version, material.workflow)
        return {
          revision: decoded.revision,
          contentRevision: materialContentRevision(raw),
          cycleId: decoded.document.cycleId
        }
      }
    )
  }

  function proofFor(
    number: number,
    mergeCommit: string,
    material: ArchiveProofMaterial
  ): ArchiveMergeProof {
    return {
      reference: {
        provider: 'github',
        repository: repoKey,
        number,
        materialRevision: material.revision
      },
      mergeCommit,
      material,
      checkedAt: deps.now?.() ?? new Date().toISOString()
    }
  }

  return {
    async archiveStateForCandidate(candidate: ArchiveCandidate): Promise<ArchiveState> {
      const material: ArchiveProofMaterial = {
        workflow: candidate.workflow,
        version: candidate.version,
        cycleId: candidate.cycleId,
        revision: candidate.revision
      }
      let entries: CommitPullEntry[]
      try {
        entries = await cached(
          `commit-pulls:${repoKey}:${candidate.sourceCommit}`,
          DEFINITIVE_TTL_MS,
          () => deps.listPullsForCommit(candidate.sourceCommit)
        )
      } catch (error) {
        return {
          kind: 'unknown',
          message: `归档来源暂不可核对：${error instanceof Error ? error.message : String(error)}`
        }
      }
      if (entries.length === 0) {
        return { kind: 'unknown', message: '未取得该修订的真实归档依据' }
      }
      if (entries.some((entry) => entry.state === 'open')) {
        return { kind: 'draft' }
      }
      let sawMerged = false
      let sawReadFailure = false
      for (const entry of entries) {
        let facts: PullMergeFacts
        try {
          facts = await pullFacts(entry.number)
        } catch {
          sawReadFailure = true
          continue
        }
        if (!facts.merged || !facts.mergeCommit) {
          continue
        }
        sawMerged = true
        try {
          const merged = await mergedMaterialAt(facts.mergeCommit, material)
          if (
            merged &&
            (merged.revision === candidate.revision ||
              merged.contentRevision === candidate.revision) &&
            merged.cycleId === candidate.cycleId
          ) {
            return { kind: 'adopted', proof: proofFor(entry.number, facts.mergeCommit, material) }
          }
        } catch {
          sawReadFailure = true
          continue
        }
      }
      return {
        kind: 'unknown',
        message: sawMerged
          ? '已合入评审的提交内容与所选材料修订不一致'
          : sawReadFailure
            ? '关联评审状态暂不可读回，无法证明归档'
            : '关联评审尚未合入，无法证明归档'
      }
    },

    async archiveProofForReview(
      number: number,
      material: ArchiveProofMaterial
    ): Promise<ArchiveProofOutcome> {
      let facts: PullMergeFacts
      try {
        facts = await pullFacts(number)
      } catch (error) {
        return {
          mergeCommit: null,
          proof: {
            kind: 'unknown',
            reason: `合入提交暂不可读取：${error instanceof Error ? error.message : String(error)}`
          }
        }
      }
      if (!facts.merged || !facts.mergeCommit) {
        return {
          mergeCommit: null,
          proof: { kind: 'unknown', reason: '该评审没有 provider 返回的真实合入提交' }
        }
      }
      let merged: { revision: string; cycleId: string } | null
      try {
        merged = await mergedMaterialAt(facts.mergeCommit, material)
      } catch (error) {
        return {
          mergeCommit: facts.mergeCommit,
          proof: {
            kind: 'unknown',
            reason: `合入提交中的材料读不回：${error instanceof Error ? error.message : String(error)}`
          }
        }
      }
      if (
        merged === null ||
        (merged.revision !== material.revision && merged.contentRevision !== material.revision)
      ) {
        return {
          mergeCommit: facts.mergeCommit,
          proof: { kind: 'unknown', reason: '合入提交中的材料与所选修订不一致' }
        }
      }
      if (merged.cycleId !== material.cycleId) {
        return {
          mergeCommit: facts.mergeCommit,
          proof: { kind: 'unknown', reason: '合入提交中的材料属于其他周期，本轮尚未归档' }
        }
      }
      return {
        mergeCommit: facts.mergeCommit,
        proof: { kind: 'verified', value: proofFor(number, facts.mergeCommit, material) }
      }
    }
  }
}
