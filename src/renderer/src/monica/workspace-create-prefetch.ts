import { useAppStore } from '@/store'

/**
 * 开工入口预热（#436 伴飞裁定 CF-6c）：进原生创建器前 fire-and-forget，只作
 * 延迟对冲，不改创建参数与行为、不新增原生 API——两条都是既有面：
 * - prefetchWorktreeCreateBase：base 分支远端跟踪刷新/带缓存 fetch（命令面板
 *   quick actions 同款调用形态；owner runtime 路由由 store action 自理）；
 * - repos.getGitUsername：触发 gh 用户名探测的进程级缓存（git-username.ts，
 *   首探墙钟上限 10s）——创建时 resolveCreateBranchName 直接命中缓存，分支前缀
 *   不再现场等探测。探测超时后的重试窗口语义是原生的，此处不改。
 * 失败一律静默：创建路径 await 同一份工作并拥有报错权。
 */
export function prefetchWorkspaceCreateBase(repoId: string): void {
  void useAppStore.getState().prefetchWorktreeCreateBase(repoId)
  void window.api.repos.getGitUsername({ repoId }).catch(() => {})
}
