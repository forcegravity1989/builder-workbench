import type { PreloadApi } from '../../../../preload/api-types'

export function createWebTeamCollaborationApi(): Partial<PreloadApi> {
  return {
    teamCollaboration: {
      readDirectory: async () => {
        throw new Error('团队目录读取需要桌面 BW 和本机 welink-cli。')
      },
      syncHosts: async () => {
        throw new Error('团队主机同步需要桌面 BW 和本机 welink-cli。')
      },
      writeDirectory: async () => {
        throw new Error('团队目录同步需要桌面 BW 和本机 welink-cli。')
      },
      listGroupSpaces: async () => {
        throw new Error('群列表读取需要桌面 BW 和已登录的 W3 账户。')
      },
      resolveGroupSpace: async () => {
        throw new Error('群 ID 解析需要桌面 BW 和已登录的 W3 账户。')
      }
    }
  }
}
