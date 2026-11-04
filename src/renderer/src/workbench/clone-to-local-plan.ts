/**
 * 「克隆到本机」的纯推导：哪些代码仓槽还能克隆、每个槽落到本机哪个路径。
 *
 * 只做数据到数据的推导，不碰 store / IPC / DOM：交互层据此渲染勾选与目标路径，
 * 编排层据此逐步克隆。判定用墙上已有的槽事实（`localRepoId` / `remoteUrl`），
 * 不额外查一遍 store，避免同一事实两处口径。
 */
import { joinFsPath, normalizeCloneUrl, repoNameFromRemote } from './project-charter'
import type { WallRepoSlot } from './workbench-wall-projects'

/** 一个待克隆槽：交给 `repos:clone` 的 URL、用户确认的父目录、以及预览用的完整落点。 */
export type CloneTarget = {
  slot: WallRepoSlot
  url: string
  parent: string
  /** `parent/<仓名>`；父目录或远端地址缺失时为 `''`（调用方拦截，不猜落点）。 */
  targetPath: string
}

/**
 * 可克隆的槽 = 本机没有注册行的槽（`localRepoId` 为空）且有远端地址。
 * 本机已注册的槽再克隆只会得到重复项目；纯本机槽没有远端可克隆。
 */
export function cloneableSlots(slots: readonly WallRepoSlot[]): WallRepoSlot[] {
  return slots.filter((slot) => !slot.localRepoId && Boolean(slot.remoteUrl?.trim()))
}

/** 目标父目录 + 远端地址 → 完整落点；任一段缺失就返回空串（调用方提示重选，不瞎猜）。 */
export function cloneTargetPath(parent: string, remoteUrl: string | null | undefined): string {
  const dir = parent.trim()
  const raw = remoteUrl?.trim()
  if (!dir || !raw) {
    return ''
  }
  const normalized = normalizeCloneUrl(raw) || raw
  return joinFsPath(dir, repoNameFromRemote(normalized))
}

/** 克隆登记到本机的展示名：沿用墙上该槽的名字；没有名字时才用远端仓名兜底。 */
export function cloneDisplayName(slot: WallRepoSlot): string {
  const named = slot.name?.trim()
  if (named && named !== '未命名仓') {
    return named
  }
  return repoNameFromRemote(normalizeCloneUrl(slot.remoteUrl ?? '') || slot.remoteUrl || '')
}

/** 待克隆槽 → 逐仓克隆计划（顺序与墙上槽序一致，便于逐条对照进度）。 */
export function planCloneTargets(
  slots: readonly WallRepoSlot[],
  parent: string
): CloneTarget[] {
  return cloneableSlots(slots).map((slot) => {
    const raw = slot.remoteUrl ?? ''
    return {
      slot,
      url: normalizeCloneUrl(raw) || raw.trim(),
      parent: parent.trim(),
      targetPath: cloneTargetPath(parent, raw)
    }
  })
}
