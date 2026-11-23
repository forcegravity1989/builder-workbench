/** Maximum UTF-8 bytes accepted for a manually shared artifact. */
export const ARTIFACT_MAX_CONTENT_BYTES = 10 * 1024 * 1024

/** Legacy CLI/SSH envelope cap; those transports still have ~1 MiB control frames. */
export const ARTIFACT_CLI_MAX_RPC_BYTES = 800 * 1024

export type ArtifactWriteRequest = {
  sourceKey: string
  content: string
  contentType: 'text/html' | 'text/markdown'
  fileName: string
  title?: string
}
