import { toast } from 'sonner'
import type { ArtifactWriteRequest } from '../../../../shared/artifacts'
import {
  SHARE_MAX_CONTENT_BYTES,
  shareContentByteLength,
  type SharePublishResult
} from '../../../../shared/workbench/share'
import { translate } from '@/i18n/i18n'
import { markdownToShareHtml } from './markdown-share-html'
import { publishShare } from './share-server-client'

export type ArtifactPublishPreparationErrorCode =
  | 'empty'
  | 'too-large'
  | 'unreadable'
  | 'unsupported'
  | 'binary'

export class ArtifactPublishPreparationError extends Error {
  constructor(readonly code: ArtifactPublishPreparationErrorCode) {
    super(code)
  }
}

export type PreparedShareUpload = {
  sourceKey: string
  content: string
  fileName: string
}

export function validateArtifactPublishRequest(request: ArtifactWriteRequest): PreparedShareUpload {
  if (!request.content) {
    throw new ArtifactPublishPreparationError('empty')
  }
  const content =
    request.contentType === 'text/markdown'
      ? markdownToShareHtml(request.content, stripMarkdownExtension(request.fileName))
      : request.content
  if (shareContentByteLength(content) > SHARE_MAX_CONTENT_BYTES) {
    throw new ArtifactPublishPreparationError('too-large')
  }
  return {
    sourceKey: request.sourceKey,
    content,
    fileName:
      request.contentType === 'text/markdown'
        ? `${stripMarkdownExtension(request.fileName)}.html`
        : request.fileName
  }
}

export async function publishArtifactFromSurface(
  createRequest: () => Promise<ArtifactWriteRequest>
): Promise<SharePublishResult | null> {
  try {
    const prepared = validateArtifactPublishRequest(await createRequest())
    const result = await publishShare(prepared)
    if (result.ok) {
      toast.success(
        result.value.change === 'created'
          ? translate(
              'auto.components.artifacts.artifact-publish-flow.430019efd0',
              'Artifact shared'
            )
          : translate(
              'auto.components.artifacts.artifact-publish-flow.2fc727c831',
              'Artifact updated'
            )
      )
      return result.value
    }
    toast.error(shareErrorMessage(result.error.code), {
      description: shareErrorDescription(result.error.code, result.error.message)
    })
    return null
  } catch (error) {
    console.error('Failed to publish artifact:', error)
    toast.error(
      translate(
        'auto.components.artifacts.artifact-publish-flow.54b1805328',
        'Could not share artifact'
      ),
      error instanceof ArtifactPublishPreparationError
        ? { description: artifactPreparationErrorDescription(error.code) }
        : undefined
    )
    return null
  }
}

function shareErrorMessage(code: string): string {
  if (code === 'not-configured') {
    return translate(
      'auto.components.artifacts.artifact-publish-flow.shareServerNotConfigured',
      'Share server is not configured'
    )
  }
  return translate(
    'auto.components.artifacts.artifact-publish-flow.shareFailed',
    'Could not share artifact'
  )
}

/** The host reports stable error codes; only fall back to its message for unmapped failures. */
function shareErrorDescription(code: string, fallback: string): string {
  switch (code) {
    case 'not-configured':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.notConfiguredDescription',
        'Set the share server address and upload token in Settings → Artifacts.'
      )
    case 'invalid-config':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.invalidConfigDescription',
        'The share server address is not valid. Check it in Settings → Artifacts.'
      )
    case 'unauthorized':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.unauthorizedDescription',
        'The share server rejected the upload token. Check it in Settings → Artifacts.'
      )
    case 'forbidden':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.forbiddenDescription',
        'This device can no longer update the link. Share the file again to create a new one.'
      )
    case 'too-large':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.tooLargeDescription',
        'This artifact is too large to share.'
      )
    case 'rate-limited':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.rateLimitedDescription',
        'Too many uploads. Try again in a minute.'
      )
    case 'busy':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.busyDescription',
        'The share server is busy. Try again shortly.'
      )
    case 'not-found':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.notFoundDescription',
        'The shared link no longer exists on the server.'
      )
    case 'unsupported':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.unsupportedDescription',
        'The share server only accepts HTML content.'
      )
    case 'network':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.networkDescription',
        'Could not reach the share server. Check the address and network.'
      )
    default:
      return fallback
  }
}

function stripMarkdownExtension(fileName: string): string {
  return fileName.replace(/\.(md|markdown|mdx)$/i, '')
}

function artifactPreparationErrorDescription(code: ArtifactPublishPreparationErrorCode): string {
  switch (code) {
    case 'empty':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.fbb5018602',
        'This file is empty.'
      )
    case 'too-large':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.6112db5a1c',
        'This artifact is too large to share.'
      )
    case 'unreadable':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.e2ed5acd8c',
        "Orca couldn't read this file. Open it from a workspace and try again."
      )
    case 'unsupported':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.6d475e9b25',
        'Only local HTML and Markdown files can be shared as artifacts.'
      )
    case 'binary':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.29a406be09',
        'Artifacts must contain text.'
      )
  }
}
