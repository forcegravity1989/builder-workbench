import type { IssueStateEntry, IssueStatesBatchResult } from '../../shared/github/issue-state-types'
import { ghExecFileAsync, acquire, release } from './gh-utils'

export type { IssueStateEntry, IssueStatesBatchResult }

// Why: owner/repo/host 直接内插进 GraphQL 查询串，必须白名单校验防注入；
// numbers 走 int 校验后拼接。gh api graphql 单次查询别名数量控制在 40 以内。
// 已知限制：白名单不含 ':'，带端口的 GHES host（如 host:8443）会被拒绝并如实
// 返回 Unknown；团队范围内出现带端口 GHES 时再受控扩展端口形态。
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/
const MAX_NUMBERS_PER_CALL = 200
const NUMBERS_PER_QUERY = 40

export function buildIssueStatesQuery(owner: string, repo: string, numbers: number[]): string {
  const selections = numbers
    .map((number) => `i${number}: issue(number: ${number}) { state }`)
    .join(' ')
  return `query { repository(owner: "${owner}", name: "${repo}") { ${selections} } }`
}

/**
 * 批量读一组 issue 编号的原生状态：每仓一次 `gh api graphql`（别名展开），
 * 而不是逐号 REST。墙卡「承诺进展」只消费开/关——关闭即计完成、关闭原因
 * 不参与计数（spec 取舍 9），查询不取 stateReason。
 * 平台侧读取：只需要 owner/repo 与本机 gh 登录态，不要求仓库在本机注册。
 */
export async function getIssueStatesBatch(input: {
  host?: string | null
  owner: string
  repo: string
  numbers: number[]
}): Promise<IssueStatesBatchResult> {
  const { host, owner, repo, numbers } = input
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo) || (host && !SAFE_NAME.test(host))) {
    return { items: [], error: '仓库身份含非法字符，拒绝查询' }
  }
  if (numbers.length === 0 || !numbers.every((n) => Number.isInteger(n) && n > 0)) {
    return { items: [], error: '编号列表非法（须为正整数）' }
  }
  if (numbers.length > MAX_NUMBERS_PER_CALL) {
    // 超限与非法分开报因：读者能知道是任务数超单次上限，而不是计划材料坏了。
    return {
      items: [],
      error: `任务数 ${numbers.length} 超单次读取上限（${MAX_NUMBERS_PER_CALL}），请拆分计划材料或提高上限`
    }
  }
  await acquire()
  try {
    const items: IssueStateEntry[] = []
    for (let start = 0; start < numbers.length; start += NUMBERS_PER_QUERY) {
      const chunk = numbers.slice(start, start + NUMBERS_PER_QUERY)
      const query = buildIssueStatesQuery(owner, repo, chunk)
      const { stdout } = await ghExecFileAsync([
        'api',
        ...(host && host !== 'github.com' ? ['--hostname', host] : []),
        'graphql',
        '-f',
        `query=${query}`
      ])
      const data = JSON.parse(stdout) as {
        data?: {
          repository?: Record<string, { state?: string } | null>
        }
        errors?: { message?: string }[]
      }
      const repository = data.data?.repository
      if (!repository) {
        const reason = data.errors
          ?.map((e) => e.message)
          .filter(Boolean)
          .join('; ')
        return { items: [], error: reason || 'GraphQL 未返回仓库数据（不存在或无权限）' }
      }
      for (const number of chunk) {
        const node = repository[`i${number}`]
        if (!node || (node.state !== 'OPEN' && node.state !== 'CLOSED')) {
          // 编号不存在/被转移：不进 items，调用方按「读不到该号」如实处理。
          continue
        }
        items.push({ number, state: node.state })
      }
    }
    return { items }
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) }
  } finally {
    release()
  }
}
