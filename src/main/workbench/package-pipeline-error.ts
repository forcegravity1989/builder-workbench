/**
 * 出包运行时共用的领域错误：CloudDragon（浏览器驱动）与 GitHub（gh CLI）
 * 两条链路都从这里抛，RPC 层按 code + message 统一回传到界面。
 */
export class PackagePipelineError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'PackagePipelineError'
  }
}

export function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
