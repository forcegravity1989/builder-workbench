import { useEffect, useState } from 'react'
import { hasTeamBinding, rememberedTeamBinding } from './team-hosts'

export type TeamMemberAvatars = {
  /** WeLink 成员姓名（或缺失姓名时的工号）到头像的映射；远程主机按同步时的成员姓名匹配。 */
  avatarByName: ReadonlyMap<string, string>
  /** 当前登录成员的头像，作为本机来源头像。 */
  localAvatar?: string
}

const EMPTY: TeamMemberAvatars = { avatarByName: new Map() }

/** Reads the team directory once per wall visit; members without avatars keep the silhouette. */
export function useTeamMemberAvatars(reloadKey?: unknown): TeamMemberAvatars {
  const [avatars, setAvatars] = useState<TeamMemberAvatars>(EMPTY)
  useEffect(() => {
    if (!hasTeamBinding()) {
      return
    }
    let cancelled = false
    const { groupId, spaceId } = rememberedTeamBinding()
    window.api.teamCollaboration
      .readDirectory({ groupId, spaceId })
      .then((result) => {
        if (cancelled) {
          return
        }
        const avatarByName = new Map<string, string>()
        for (const host of result.directory.hosts) {
          if (!host.avatar) {
            continue
          }
          if (host.name) {
            avatarByName.set(host.name, host.avatar)
          }
          avatarByName.set(host.member_id, host.avatar)
        }
        const localAvatar = result.directory.hosts.find(
          (host) => host.member_id.toLowerCase() === result.currentMemberId?.toLowerCase()
        )?.avatar
        setAvatars({ avatarByName, localAvatar })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [reloadKey])
  return avatars
}
