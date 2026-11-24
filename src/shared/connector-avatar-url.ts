import * as z from 'zod'

const AVATAR_HOSTS = [
  '.slack-edge.com',
  'avatars.githubusercontent.com',
  'public.linear.app'
] as const

function httpsHostIn(value: string, hosts: readonly string[]): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return false
  }
  return hosts.some((host) =>
    host.startsWith('.') ? url.hostname.endsWith(host) : url.hostname === host
  )
}

export function isConnectorAvatarUrl(value: string): boolean {
  return httpsHostIn(value, AVATAR_HOSTS)
}

const MAX_URL_LENGTH = 2048
const optionalUrl = z.string().min(1).max(MAX_URL_LENGTH).optional().catch(undefined)

/** A connector person's picture, kept only from a host the avatar cache serves; anything else is
 *  dropped, not an error. */
export const optionalConnectorAvatarUrl = optionalUrl
  .refine((url) => url === undefined || isConnectorAvatarUrl(url))
  .catch(undefined)
