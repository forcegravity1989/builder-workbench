import { useEffect } from 'react'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { nativePackagePipelinePort } from '../package-pipeline-port'

/**
 * 打开版本周期工作区即在后台预热 CloudDragon 会话：拉一次流水线列表
 * （结果丢弃），主进程的常驻浏览器与 SSO 登录态就此绪，点进验收屏后
 * 首次读取只剩页面操作时间。失败静默——预热只负责快，验收屏自己会
 * 读取数据并如实报错。
 */
export function usePackagePipelineWarmup(context: VersionCycleContext | undefined): void {
  const scope = context?.scope
  const worktreeId = context?.worktreeId
  const owner = scope?.runtimeOwnerEnvironmentId
  const repoId = scope?.repoId
  const hostId = scope?.hostId
  useEffect(() => {
    if (!repoId || !hostId || !worktreeId) {
      return
    }
    void nativePackagePipelinePort(owner)
      .list({ scope: { repoId, worktreeId, hostId } })
      .catch(() => undefined)
  }, [owner, repoId, hostId, worktreeId])
}
