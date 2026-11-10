import { create } from 'zustand'
import type { ReviewSendInput } from '../../../../shared/workbench/pr-review-request'

// The shell owns the dialog so closing a worktree context menu cannot unmount it.
export const useReviewSendDialog = create<{
  request: ReviewSendInput | null
  open: (request: ReviewSendInput) => void
  close: () => void
}>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null })
}))

export const openReviewSendDialog = (request: ReviewSendInput): void =>
  useReviewSendDialog.getState().open(request)
