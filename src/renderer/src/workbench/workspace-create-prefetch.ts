import { useAppStore } from '@/store'

/**
 * 开工入口预热（#436 伴飞裁定 CF-6c）：进原生创建器前 fire-and-forget，只作
 * 延迟对冲。base 预取跟随项目所属宿主；Git 用户名已由原生仓库目录在宿主预热，
 * 创建时由同一个宿主解析分支前缀。
 * 失败一律静默：创建路径 await 同一份工作并拥有报错权。
 */
export function prefetchWorkspaceCreateBase(repoId: string): void {
  void useAppStore.getState().prefetchWorktreeCreateBase(repoId)
}
