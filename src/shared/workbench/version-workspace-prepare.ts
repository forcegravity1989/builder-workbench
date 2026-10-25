import { z } from 'zod'
import { Id, MaterialVersion } from './version-material-common'

/**
 * G2 新版本准备（P2）：在归属宿主上为一个版本准备计划、验收两棵固定流程树。
 * 分支命名与步骤语义的定稿见 version-workspace design「P2 落地」；
 * 分支名只是 Git 起点与入口提示，版本归属始终由登记上的绑定决定。
 */

export const VERSION_FLOW_WORKFLOWS = ['plan', 'acceptance'] as const
export type VersionFlowWorkflow = (typeof VERSION_FLOW_WORKFLOWS)[number]

/** 「是流程绑定」单判定（最终检视 L-4）：四处内联谓词收敛。 */
export function isVersionFlowWorkflow(
  workflow: string | null | undefined
): workflow is VersionFlowWorkflow {
  return workflow === 'plan' || workflow === 'acceptance'
}

/**
 * 流程树分支：bw/<version>/<workflow>。MaterialVersion 已挡目录非法字符；
 * 这里补 Git ref 规则（空白、~ ^ : [ ]、连续点、@{、.lock 结尾、前导 -）。
 * 不能组成合法分支名的版本拒绝创建，返回 null 由调用方如实报因。
 */
export function versionFlowBranch(version: string, workflow: VersionFlowWorkflow): string | null {
  if (/[\s~^:[\]]|\.\.|@\{/.test(version) || version.endsWith('.lock') || version.startsWith('-')) {
    return null
  }
  return `bw/${version}/${workflow}`
}

/** 流程树展示名（原生侧栏/登记标签）。 */
export function versionFlowTreeName(version: string, workflow: VersionFlowWorkflow): string {
  return workflow === 'plan' ? `plan-${version}` : `acceptance-${version}`
}

/**
 * 旧固定流程分支（G2 绑定登记之前的 plan/acceptance 固定树名；无绑定树的旧
 * 路径显式保留）。renderer 固定树 ensure/流程识别与 main 材料围栏、选版共用，
 * 旧分支名只写这里。
 */
export const LEGACY_PLAN_BRANCH = 'bw/week-plan'
export const LEGACY_ACCEPTANCE_BRANCH = 'bw/week-acceptance'

/** 旧调用点判定逐字保留：非 plan 即按 acceptance（入参恒在 plan/acceptance 二分内）。 */
export function legacyFlowBranch(workflow: VersionFlowWorkflow): string {
  return workflow === 'plan' ? LEGACY_PLAN_BRANCH : LEGACY_ACCEPTANCE_BRANCH
}

export const VersionWorkspacePrepareSchema = z.strictObject({
  repoId: Id,
  hostId: Id,
  version: MaterialVersion
})
export type VersionWorkspacePrepareRequest = z.infer<typeof VersionWorkspacePrepareSchema>

export type VersionWorkspacePrepareStep = {
  workflow: VersionFlowWorkflow
  branch: string
  /** created=本次新建；existing=重入时按宿主真实登记重新发现并复用；failed=未成功（原因在 problems）。 */
  state: 'created' | 'existing' | 'failed'
  worktreeId?: string
  instanceId?: string
  /** 仅计划步：initialized=新建空计划；existing=材料已存在、未覆盖。验收不初始化材料。 */
  material?: { state: 'initialized' | 'existing'; revision: string }
}

/**
 * 步骤链非原子：某步失败保留已成功结果，逐步返回状态与问题；
 * 重试=重入同一 prepare，按宿主真实登记补齐缺失步骤。
 */
export type VersionWorkspacePrepareResult = {
  version: string
  steps: VersionWorkspacePrepareStep[]
  problems: { workflow: VersionFlowWorkflow; code: string; message: string }[]
}
