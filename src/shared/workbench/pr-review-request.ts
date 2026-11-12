import { z } from 'zod'
import type { Repo } from '../repo-types'
import { splitGitRemoteKey } from '../git-remote-identity'

export const ReviewRepoSchema = z.object({
  host: z.string().trim().min(1).max(200),
  path: z.string().trim().min(1).max(500)
})
export type ReviewRepoIdentity = z.infer<typeof ReviewRepoSchema>

export const ReviewRequestSchema = z.object({
  repo: ReviewRepoSchema,
  prNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(500),
  sourceBranch: z.string().trim().min(1).max(300),
  targetBranch: z.string().trim().min(1).max(300),
  sender: z.string().trim().min(1).max(100),
  cycleId: z.string().uuid(),
  cycleStartedAt: z.string().datetime(),
  round: z.number().int().positive(),
  sentAt: z.string().datetime()
})
export type ReviewRequestPayload = z.infer<typeof ReviewRequestSchema>
export type ReviewSendInput = Omit<
  ReviewRequestPayload,
  'sender' | 'sentAt' | 'cycleId' | 'cycleStartedAt' | 'round'
>
export const ReviewIncomingSchema = ReviewRequestSchema.extend({
  receivedAt: z.string().datetime(),
  senderId: z.string().min(1)
})
export type ReviewIncomingRequest = z.infer<typeof ReviewIncomingSchema>

export type ReviewPeerTarget = {
  environmentId: string
  name: string
  pairingRevision: number
}
export type ReviewPeerDelivery = ReviewPeerTarget & { ok: boolean; error?: string }
export type ReviewSendResult = { sentAt: string; results: ReviewPeerDelivery[] }

export function reviewRepositoryKey(repo: ReviewRepoIdentity): string {
  return `${repo.host}/${repo.path}`.toLowerCase()
}

export function reviewRepoIdentity(
  repo: Pick<Repo, 'gitRemoteIdentity'>
): ReviewRepoIdentity | null {
  const parts = splitGitRemoteKey(repo.gitRemoteIdentity?.canonicalKey, (host) => host)
  return parts ? { host: parts.host, path: parts.tail } : null
}

// Internal trial archives used owner/name. Convert only stored data; RPC accepts the current schema.
export function migrateStoredReviewRequest(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value
  }
  const request = value as Record<string, unknown>
  const repo = request.repo as Record<string, unknown> | undefined
  if (
    repo &&
    repo.path === undefined &&
    typeof repo.owner === 'string' &&
    typeof repo.name === 'string'
  ) {
    return {
      ...request,
      repo: { host: repo.host ?? 'github.com', path: `${repo.owner}/${repo.name}` }
    }
  }
  return value
}

export function hasReviewProject(
  repos: readonly Pick<Repo, 'gitRemoteIdentity'>[],
  identity: ReviewRepoIdentity
): boolean {
  const key = reviewRepositoryKey(identity)
  return repos.some((repo) => {
    const candidate = reviewRepoIdentity(repo)
    return candidate !== null && reviewRepositoryKey(candidate) === key
  })
}
