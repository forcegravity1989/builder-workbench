/**
 * 出包运行时共用的领域错误：CodeHub（执行面 cb CLI、制品面浏览器会话）与
 * GitHub（gh CLI）的链路都从这里抛，RPC 层按 code + message 统一回传到界面。
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
