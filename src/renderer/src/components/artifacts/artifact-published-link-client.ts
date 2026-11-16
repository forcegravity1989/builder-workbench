import { getShareLink } from './share-server-client'

/** Published-link lookup reads this machine's local share index, not an account-wide list. */
export function getPublishedArtifactLink(sourceKey: string): Promise<string | null> {
  return getShareLink(sourceKey)
}
