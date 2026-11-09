import { z } from 'zod'
import type { Repo } from '../repo-types'

export const ReviewRepoSchema = z.object({
  owner: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  host: z.string().trim().min(1).max(200).optional()
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
  return `${repo.host ?? 'github.com'}/${repo.owner}/${repo.name}`.toLowerCase()
}

export function reviewRepoIdentity(
  repo: Pick<Repo, 'gitRemoteIdentity'>
): ReviewRepoIdentity | null {
  const key = repo.gitRemoteIdentity?.canonicalKey
  const match = key?.match(/^([^/]+)\/([^/]+)\/([^/]+)$/)
  return match ? { host: match[1]!, owner: match[2]!, name: match[3]! } : null
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
