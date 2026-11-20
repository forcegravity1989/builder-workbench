import { create } from 'zustand'
import type { ReviewSendInput } from '../../../../shared/workbench/pr-review-request'
import type { PrototypeReviewPageRef } from '../../../../shared/workbench/prototype-review-request'

export type ReviewSendDialogRequest =
  | { kind: 'pr'; request: ReviewSendInput }
  | { kind: 'prototype'; page: PrototypeReviewPageRef }

// The shell owns the dialog so closing a worktree context menu cannot unmount it.
export const useReviewSendDialog = create<{
  request: ReviewSendDialogRequest | null
  open: (request: ReviewSendDialogRequest) => void
  close: () => void
}>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null })
}))

export const openReviewSendDialog = (request: ReviewSendInput): void =>
  useReviewSendDialog.getState().open({ kind: 'pr', request })

export const openPrototypeReviewSendDialog = (page: PrototypeReviewPageRef): void =>
  useReviewSendDialog.getState().open({ kind: 'prototype', page })
