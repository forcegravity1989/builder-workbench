// Isolated browser ports: no Electron preload, remote client or native write implementation.
import { parseHostAccessLink } from '../../../../../src/shared/remote-pairing-address'
import { addFixtureHost, announce, download, getSnapshot } from './fixtures'

export function installApi() {
  const allowed = {
    fs: {
      authorizeExternalPath: async () => {},
      pathExists: async () => true,
      saveDownloadedFile: async (request: { suggestedName: string; content: string }) => {
        download(request.suggestedName, request.content)
        return { canceled: false, destinationPath: request.suggestedName }
      }
    },
    repos: {
      pickFolder: async () => '/home/li/pay',
      pickDirectory: async () => '/home/li/projects'
    },
    shell: {
      openUrl: async () => announce('演示不打开外部链接。'),
      openPath: async () => announce('演示不打开真实目录。')
    },
    runtimeEnvironments: {
      verifyAndAddFromPairingCode: async (request: { name: string; pairingCode: string }) => {
        const link = parseHostAccessLink(request.pairingCode)
        if (
          !link.ok ||
          link.value.pairing.deviceToken !== 'preview-only-not-a-real-token' ||
          !['Builder-A', 'Builder-C'].includes(request.name)
        ) {
          return {
            ok: false,
            kind: 'environment-save-failed',
            message: '预览只接受下载的演示清单，不进行真实连接。'
          }
        }
        addFixtureHost(request.name)
        return { ok: true }
      },
      list: async () => getSnapshot().runtimeEnvironments
    }
  }
  const guard = (object: Record<string, unknown>, prefix = ''): Record<string, unknown> =>
    new Proxy(object, {
      get(target, key: string) {
        if (!(key in target)) {
          throw new Error(`预览未提供接口：${prefix}${key}`)
        }
        return typeof target[key] === 'object' && target[key] !== null
          ? guard(target[key] as Record<string, unknown>, `${prefix}${key}.`)
          : target[key]
      }
    })
  ;(window as unknown as { api: typeof allowed }).api = guard(allowed) as typeof allowed
}
