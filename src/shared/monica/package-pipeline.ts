import { z } from 'zod'
import { MetricScopeSchema } from './metrics'

/**
 * 出包契约：验收屏经宿主 runtime 驱动 CloudDragon 页面完成流水线列表、
 * 最新制品包读取、启动流水线与下载。scope 只用于 runtime 路由；CloudDragon
 * 侧的项目与服务名由主进程运行时解析，不进渲染进程。
 */
export const PackagePipelineListSchema = z.strictObject({
  scope: MetricScopeSchema
})
export const PackageLatestSchema = z.strictObject({
  scope: MetricScopeSchema,
  pipeline: z.string().min(1)
})
export const PackageLaunchSchema = z.strictObject({
  scope: MetricScopeSchema,
  pipeline: z.string().min(1)
})
export const PackageDownloadSchema = z.strictObject({
  scope: MetricScopeSchema,
  pipeline: z.string().min(1),
  /** 渲染进程先经系统目录选择器取得；主进程只负责落盘。 */
  directory: z.string().min(1)
})

/** CloudDragon 流水线名称列表（范围：当前项目下的流水线）。 */
export type PackagePipelineCatalog = {
  scope: ReturnType<typeof MetricScopeSchema.parse>
  pipelines: string[]
}
/** 最新一条制品包信息；服务无版本时为 null（界面显示“暂无制品包”）。 */
export type PackageLatest = {
  project: string
  version: string
  created: string
  files: string[]
}
export type PackageLaunchReceipt = {
  pipeline: string
  /** 启动受理时间（本机时钟，ISO 字符串），仅作界面提示，不是流水线执行记录。 */
  launchedAt: string
}
export type PackageDownloadReceipt = {
  file: string
  bytes: number
}
export type PackagePipelinePort = {
  list(input: z.infer<typeof PackagePipelineListSchema>): Promise<PackagePipelineCatalog>
  latest(input: z.infer<typeof PackageLatestSchema>): Promise<PackageLatest | null>
  launch(input: z.infer<typeof PackageLaunchSchema>): Promise<PackageLaunchReceipt>
  download(input: z.infer<typeof PackageDownloadSchema>): Promise<PackageDownloadReceipt>
}
