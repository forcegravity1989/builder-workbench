import { z } from 'zod'
import { MetricScopeSchema } from './metrics'
import type { ProjectCharter } from './project-charter'

/** 名片 RPC 契约:scope 复用 BW runtime 通用工作树 scope。 */
export const CharterScopeSchema = MetricScopeSchema
export type CharterScope = z.infer<typeof CharterScopeSchema>

export const CharterIntentSchema = z.strictObject({
  name: z.string(),
  kind: z.string(),
  brief: z.string(),
  benchmark: z.string(),
  opportunity: z.string()
})
export type CharterIntent = z.infer<typeof CharterIntentSchema>

export const CharterProbeRequestSchema = z.strictObject({
  url: z.string().min(1)
})
export type CharterProbeRequest = z.infer<typeof CharterProbeRequestSchema>

/**
 * 克隆前远端名片探测四态(main 4f9d93107 教训):
 * 「没查成(failed)」绝不冒充「没接管过(absent)」。
 */
export type CharterRemoteProbe =
  | { kind: 'adopted'; charter: ProjectCharter }
  /** 仓库可读,但没有 .bw/project.toml。 */
  | { kind: 'absent' }
  /** 仓库不存在或没有权限。 */
  | { kind: 'no-repo'; error: string }
  /** CLI 缺失 / 未登录 / 网络 / 分支名不匹配等——探测没成功,不代表仓里没有名片。 */
  | { kind: 'failed'; error: string }

export const CharterSubmitRequestSchema = z.strictObject({
  scope: CharterScopeSchema,
  intent: CharterIntentSchema,
  /** true=接入首建(PR 标题「项目约定」);false=编辑名片(「项目信息改动」)。 */
  firstTime: z.boolean()
})
export type CharterSubmitRequest = z.infer<typeof CharterSubmitRequestSchema>

export type CharterPrRef = {
  provider: 'github' | 'codehub'
  number: number
  url: string | null
  adopted: boolean
}

/** submit 结果:失败是值不是异常——项目已接入,失败只影响名片环节。 */
export type CharterSubmitOutcome =
  | { mode: 'pr'; pr: CharterPrRef; filled: string[] }
  /** 树内名片与意图一致且远端已同步、无开放 PR。note 说明真实态(已合入/PR 被关)。 */
  | { mode: 'noop'; filled: string[]; note?: string }
  /** 没有可识别远端/读不到远端身份:调用方就地写主检出并如实说明。 */
  | { mode: 'local-only'; reason: string }
  | {
      mode: 'failed'
      stage: 'read' | 'validate' | 'write' | 'commit' | 'push' | 'pr'
      error: string
      filled: string[]
    }

export const CharterStatusRequestSchema = z.strictObject({
  repoId: z.string().min(1),
  hostId: z.string().min(1)
})
export type CharterStatusRequest = z.infer<typeof CharterStatusRequestSchema>

/**
 * 墙判据读取请求(G3):与 status 同形但独立定义——生成的 rpc-params 目录按
 * schema 标识方法参数,共用别名会把 status 的参数也标成 read 的 schema。
 * repoId 在 owner runtime 的注册表里解析,hostId 供 owner 侧校验路由,
 * 不由调用方指路径。
 */
export const CharterReadRequestSchema = z.strictObject({
  repoId: z.string().min(1),
  hostId: z.string().min(1)
})
export type CharterReadRequest = z.infer<typeof CharterReadRequestSchema>

/**
 * 主检出 `.bw/project.toml` 读取结果:existed=false 是确证不存在;
 * error 非空是「没读成」(不可读/二进制/IO),两者都不冒充对方(铁律二同源语义)。
 */
export type CharterReadResult = {
  charter: ProjectCharter | null
  existed: boolean
  error: string | null
}

export type CharterStatus = {
  /** bw/project 分支上的名片 PR/MR;查询失败按 null 呈现,不装有事。 */
  pr: {
    provider: 'github' | 'codehub'
    number: number
    url: string | null
    state: 'open' | 'merged' | 'closed'
  } | null
  /** 主检出 HEAD 是否已含名片(合入且已更新主目录后为 true)。 */
  headHasCharter: boolean
  /** renderer 侧查询失败(区别于「查了没有」):呈现为没读到,不冒充无 PR。 */
  queryFailed?: boolean
}
