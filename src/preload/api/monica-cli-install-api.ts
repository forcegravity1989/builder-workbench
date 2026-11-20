import type {
  MonicaCliInstallFinishedPayload,
  MonicaCliInstallId
} from '../../shared/monica-cli-install-commands'

// CLI 安装沿应用后台命令执行；完成事件同时承载成功与失败结果。
export type CliInstallApi = {
  start: (args: { cli: MonicaCliInstallId }) => Promise<{ started: boolean }>
  isRunning: (args: { cli: MonicaCliInstallId }) => Promise<boolean>
  onFinished: (callback: (payload: MonicaCliInstallFinishedPayload) => void) => () => void
}
