/**
 * BW pr-review-notify：workbench:// 评审深链的启动捕获队列（照
 * SkillShareDeepLinkState 模式）。OS 把深链作为 argv 交给 exe（冷启动）或经
 * open-url/second-instance 到达（热运行）；热路径立即经 ui:openPrReview 推
 * renderer，冷启动先存队列、由 renderer 挂载后 consume 拉取。
 */
import { reviewDeepLinkFromArguments } from '../../shared/workbench/pr-review-message'
import type { ReviewRequestPayload } from '../../shared/workbench/review-request-payload'

/** 深链只携带仓库与编号；title/sender 补空串对齐 ui:openPrReview 负载形状。 */
export type ReviewDeepLinkPayload = ReviewRequestPayload

export class ReviewDeepLinkState {
  private pending: ReviewDeepLinkPayload | null = null

  capture(argv: readonly string[], publish?: (payload: ReviewDeepLinkPayload) => void): boolean {
    const parsed = reviewDeepLinkFromArguments(argv)
    if (!parsed) {
      return false
    }
    this.pending = { ...parsed, title: '', sender: '' }
    publish?.(this.pending)
    return true
  }

  consume(): ReviewDeepLinkPayload | null {
    const payload = this.pending
    this.pending = null
    return payload
  }
}
