import { basename, extname, resolve } from 'node:path'
import { ARTIFACT_CLI_MAX_RPC_BYTES } from '../../shared/artifacts'
import {
  parseRemoteArtifactInput,
  REMOTE_ARTIFACT_INPUT_ENV
} from '../../shared/artifact-cli-bridge'
import { readArtifactFileWithinLimit } from '../../shared/artifact-file-read'
import type { ShareListEntry, SharePublishResult, ShareResult } from '../../shared/workbench/share'
import { wrapShareDocument } from '../../shared/workbench/share-html'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { RuntimeClientError } from '../runtime-client'
import { formatSharedLinkList, formatSharedLinkResult } from '../artifact-format'
import { printResult } from '../format'

const TOO_LARGE_MESSAGE =
  'Artifact is too large for the CLI transport (limit 800 KB). Open the file in Workbench and use Share as artifact instead.'

function stringFlag(ctx: HandlerContext, name: string): string | undefined {
  const value = ctx.flags.get(name)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireStringFlag(ctx: HandlerContext, name: string): string {
  const value = stringFlag(ctx, name)
  if (!value) {
    throw new RuntimeClientError('invalid_argument', `Missing required ${name}.`)
  }
  return value
}

function rejectArtifactRemoteSelectionFlags(ctx: HandlerContext): void {
  rejectRemoteSelectionFlags(
    ctx.flags,
    'artifact commands; sharing uses the desktop app on this computer.'
  )
}

function artifactContentType(path: string): 'text/html' | 'text/markdown' | null {
  const extension = extname(path).toLowerCase()
  return ['.html', '.htm'].includes(extension)
    ? 'text/html'
    : ['.md', '.markdown'].includes(extension)
      ? 'text/markdown'
      : null
}

async function readStdinWithinLimit(maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    bytes += buffer.length
    if (bytes > maxBytes) {
      throw new RuntimeClientError('invalid_argument', TOO_LARGE_MESSAGE)
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

type PreparedShareRequest = { sourceKey: string; content: string; fileName: string }

/**
 * Mirrors the Share as artifact button: Markdown is rendered into a standalone HTML document
 * because the share service stores HTML only. Records are keyed by source key, so repeating a
 * command overwrites that same link — but only within this surface: the editor keys a remote file
 * by an `["ssh", target, path]` tuple, so one remote file shared from both keeps two links.
 * `marked` is ESM-only and this CLI is emitted as CommonJS, hence the dynamic import.
 */
async function readShareRequest(ctx: HandlerContext): Promise<PreparedShareRequest> {
  const remoteInput = parseRemoteArtifactInput(process.env[REMOTE_ARTIFACT_INPUT_ENV])
  const sourceKey = remoteInput?.sourceKey ?? resolve(ctx.cwd, requireStringFlag(ctx, 'file'))
  const fileName = remoteInput?.fileName ?? basename(sourceKey)
  const contentType = remoteInput?.contentType ?? artifactContentType(sourceKey)
  if (!contentType) {
    throw new RuntimeClientError('invalid_argument', 'Artifacts must be HTML or Markdown files.')
  }
  const localRead = remoteInput
    ? null
    : await readArtifactFileWithinLimit(sourceKey, ARTIFACT_CLI_MAX_RPC_BYTES)
  if (localRead?.status === 'not-file') {
    throw new RuntimeClientError(
      'invalid_argument',
      'Artifact file was not found or is not a file.'
    )
  }
  if (localRead?.status === 'too-large') {
    throw new RuntimeClientError('invalid_argument', TOO_LARGE_MESSAGE)
  }
  const raw = remoteInput
    ? await readStdinWithinLimit(ARTIFACT_CLI_MAX_RPC_BYTES)
    : localRead?.status === 'ok'
      ? localRead.content
      : ''
  if (!raw) {
    throw new RuntimeClientError('invalid_argument', 'Artifact file is empty.')
  }
  const markdown = contentType === 'text/markdown'
  const title = markdown ? fileName.replace(/\.(md|markdown|mdx)$/i, '') : fileName
  let content = raw
  if (markdown) {
    const { marked } = await import('marked')
    content = wrapShareDocument(marked.parse(raw, { async: false }), title)
  }
  const request: PreparedShareRequest = {
    sourceKey,
    content,
    fileName: markdown ? `${title}.html` : fileName
  }
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > ARTIFACT_CLI_MAX_RPC_BYTES) {
    throw new RuntimeClientError('invalid_argument', TOO_LARGE_MESSAGE)
  }
  return request
}

/** Share failures arrive as data, not transport errors; surface the stable code and message. */
function unwrapShareResult<T>(result: ShareResult<T>): T {
  if (result.ok) {
    return result.value
  }
  throw new RuntimeClientError(result.error.code, result.error.message)
}

async function shareArtifact(ctx: HandlerContext): Promise<void> {
  rejectArtifactRemoteSelectionFlags(ctx)
  const response = await ctx.client.call<ShareResult<SharePublishResult>>(
    'workbench.share.publish',
    await readShareRequest(ctx)
  )
  const value = unwrapShareResult(response.result)
  printResult({ ...response, result: value }, ctx.json, formatSharedLinkResult)
}

export const ARTIFACT_HANDLERS: Record<string, CommandHandler> = {
  'artifacts list': async (ctx) => {
    rejectArtifactRemoteSelectionFlags(ctx)
    const response = await ctx.client.call<ShareResult<ShareListEntry[]>>(
      'workbench.share.list',
      {}
    )
    const value = unwrapShareResult(response.result)
    printResult({ ...response, result: value }, ctx.json, formatSharedLinkList)
  },
  'artifacts share': shareArtifact,
  'artifacts update': shareArtifact,
  'artifacts unshare': async (ctx) => {
    rejectArtifactRemoteSelectionFlags(ctx)
    const remoteInput = parseRemoteArtifactInput(process.env[REMOTE_ARTIFACT_INPUT_ENV])
    const sourceKey = remoteInput?.sourceKey ?? resolve(ctx.cwd, requireStringFlag(ctx, 'file'))
    const response = await ctx.client.call<ShareResult<null>>('workbench.share.remove', {
      sourceKey
    })
    unwrapShareResult(response.result)
    printResult({ ...response, result: { deleted: true } }, ctx.json, () => 'Artifact deleted.')
  },
  'artifacts delete': async (ctx) => {
    rejectArtifactRemoteSelectionFlags(ctx)
    const id = requireStringFlag(ctx, 'id')
    const listed = await ctx.client.call<ShareResult<ShareListEntry[]>>('workbench.share.list', {})
    const entry = unwrapShareResult(listed.result).find((item) => item.id === id)
    if (!entry) {
      throw new RuntimeClientError(
        'not_found',
        `No link shared from this computer has id "${id}". Run \`orca artifacts list\` to see current ids.`
      )
    }
    const response = await ctx.client.call<ShareResult<null>>('workbench.share.remove', {
      sourceKey: entry.sourceKey
    })
    unwrapShareResult(response.result)
    printResult({ ...response, result: { deleted: true, id } }, ctx.json, () => 'Artifact deleted.')
  }
}
