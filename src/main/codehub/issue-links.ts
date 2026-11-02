import { assertCodeHubDetailIdentity, type CodeHubRemote } from '../../shared/codehub'
import type { CodeHubTaskDetail } from '../../shared/codehub-tasks'
import type { CodeHubExecOptions } from './cli'
import { resolveCodeHubWebIdentity } from './web-identity'

export async function linkedMergeRequestsOf(
  record: Record<string, unknown>,
  remote: CodeHubRemote,
  execOptions?: CodeHubExecOptions
): Promise<CodeHubTaskDetail['linkedMergeRequests']> {
  if (!Array.isArray(record.linked_merge_requests)) {
    return undefined
  }
  // The Issue's merge_requests_count does not count the CLI's native linked-MR collection.
  const linked: NonNullable<CodeHubTaskDetail['linkedMergeRequests']> = []
  for (const value of record.linked_merge_requests) {
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
    remote = await resolveCodeHubWebIdentity(remote, mr.web_url, execOptions)
    assertCodeHubDetailIdentity({ remote, kind: 'mr', iid: mr.iid }, mr.iid, mr.web_url)
    linked.push({ iid: mr.iid, url: mr.web_url })
  }
  return linked
}
