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
  constructor(
    readonly code: ArtifactPublishPreparationErrorCode,
    /** Actual size in bytes when the failure is `too-large`, so the message can state it. */
    readonly bytes?: number
  ) {
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
  const bytes = shareContentByteLength(content)
  if (bytes > SHARE_MAX_CONTENT_BYTES) {
    throw new ArtifactPublishPreparationError('too-large', bytes)
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
    reportShareFailure(result.error.code, result.error.message)
    return null
  } catch (error) {
    console.error('Failed to publish artifact:', error)
    if (error instanceof ArtifactPublishPreparationError) {
      reportPreparationFailure(error)
    } else {
      toast.error(
        translate(
          'auto.components.artifacts.artifact-publish-flow.54b1805328',
          'Could not share artifact'
        )
      )
    }
    return null
  }
}

/**
 * Shared with link removal so every share failure names the cause instead of a generic error.
 * `title` lets a caller say which action failed — "Could not share artifact" is the wrong heading
 * for a delete that did not work.
 */
export function reportShareFailure(code: string, fallback: string, title?: string): void {
  const heading =
    title ??
    (code === 'too-large'
      ? translate(
          'auto.components.artifacts.artifact-publish-flow.fileTooLarge',
          'File is too large to share'
        )
      : shareErrorMessage())
  toast.error(heading, { description: shareErrorDescription(code, fallback) })
}

function reportPreparationFailure(error: ArtifactPublishPreparationError): void {
  if (error.code === 'too-large') {
    toast.error(
      translate(
        'auto.components.artifacts.artifact-publish-flow.fileTooLarge',
        'File is too large to share'
      ),
      { description: artifactPreparationErrorDescription(error) }
    )
    return
  }
  toast.error(
    translate(
      'auto.components.artifacts.artifact-publish-flow.54b1805328',
      'Could not share artifact'
    ),
    { description: artifactPreparationErrorDescription(error) }
  )
}

function shareErrorMessage(): string {
  return translate(
    'auto.components.artifacts.artifact-publish-flow.shareFailed',
    'Could not share artifact'
  )
}

/**
 * The host reports stable error codes and every one of them has localized words here, so a raw
 * host message — Chinese, and sometimes carrying a file name or an exception — never reaches the
 * interface. The host message stays the `fallback` for a code this build does not know, and it is
 * what the CLI prints.
 */
export function shareErrorDescription(code: string, fallback: string): string {
  switch (code) {
    case 'unauthorized':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.unauthorizedDescription',
        'The share server rejected this device. Try sharing again.'
      )
    case 'forbidden':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.forbiddenDescription',
        'This device can no longer update the link. Share the file again to create a new one.'
      )
    case 'stale-record':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.staleRecordDescription',
        'This link no longer belongs to this computer. It was removed from your list, but it may still open until an administrator deletes it on the share server.'
      )
    case 'too-large':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.tooLargeDescription',
        'This artifact exceeds the 10 MiB share limit.'
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
        'Could not reach the share server. Check your network connection.'
      )
    case 'enrollment-full':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.enrollmentFullDescription',
        'The share server has no room left for new devices. An administrator has to clear its device list before sharing works again.'
      )
    case 'registry-unavailable':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.registryUnavailableDescription',
        'The share server cannot read its device list and is refusing new shares. An administrator has to restore it on the server.'
      )
    case 'records-unreadable':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.recordsUnreadableDescription',
        'Your share history on this computer could not be read, so this list may be incomplete. Existing links may still work; sharing a file again creates a new link.'
      )
    case 'unknown':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.unknownDescription',
        'Something went wrong while sharing. The details are in the app logs.'
      )
    default:
      return fallback
  }
}

function stripMarkdownExtension(fileName: string): string {
  return fileName.replace(/\.(md|markdown|mdx)$/i, '')
}

function artifactPreparationErrorDescription(error: ArtifactPublishPreparationError): string {
  switch (error.code) {
    case 'empty':
      return translate(
        'auto.components.artifacts.artifact-publish-flow.fbb5018602',
        'This file is empty.'
      )
    case 'too-large':
      return error.bytes === undefined
        ? translate(
            'auto.components.artifacts.artifact-publish-flow.6112db5a1c',
            'This file exceeds the 10 MiB share limit.'
          )
        : translate(
            'auto.components.artifacts.artifact-publish-flow.tooLargeWithSize',
            'This file is {{size}}; the share limit is 10 MiB.',
            { size: formatShareSize(error.bytes) }
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

function formatShareSize(bytes: number): string {
  const mib = bytes / (1024 * 1024)
  // Round oversized values up so "10.0 MiB" never appears next to a 10 MiB limit.
  const shown = bytes > SHARE_MAX_CONTENT_BYTES ? Math.ceil(mib * 10) / 10 : mib
  return `${shown >= 10 ? shown.toFixed(1) : shown.toFixed(2)} MiB`
}
