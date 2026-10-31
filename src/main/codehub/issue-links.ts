import { assertCodeHubDetailIdentity, type CodeHubRemote } from '../../shared/codehub'
import type { CodeHubTaskDetail } from '../../shared/codehub-tasks'

export function linkedMergeRequestsOf(
  record: Record<string, unknown>,
  remote: CodeHubRemote
): CodeHubTaskDetail['linkedMergeRequests'] {
  if (!Array.isArray(record.linked_merge_requests)) {
    return undefined
  }
  const count = record.merge_requests_count
  if (typeof count === 'number' && count !== record.linked_merge_requests.length) {
    throw new Error('CodeHub Issue 关联 MR 未完整返回')
  }
  return record.linked_merge_requests.map((value: unknown) => {
    if (!value || typeof value !== 'object') {
      throw new Error('CodeHub Issue 关联 MR 记录无效')
    }
    const mr = value as Record<string, unknown>
    if (
      typeof mr.iid !== 'number' ||
      !Number.isSafeInteger(mr.iid) ||
      mr.iid <= 0 ||
      typeof mr.web_url !== 'string' ||
      !mr.web_url.trim()
    ) {
      throw new Error('CodeHub Issue 关联 MR 缺少编号或来源链接')
    }
    assertCodeHubDetailIdentity({ remote, kind: 'mr', iid: mr.iid }, mr.iid, mr.web_url)
    return { iid: mr.iid, url: mr.web_url }
  })
}
