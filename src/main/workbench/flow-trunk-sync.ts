import { resolveEffectiveGitUpstream } from '../../shared/git-effective-upstream'
import { parseGitRemoteFetchUrls } from '../../shared/git-remote-url-index'
import { branchFullRef } from '../../shared/workbench/branch-ref'
import { mergeFlowSources, type FlowMergeContext } from './flow-trunk-merge'
import type { TrunkGitExec } from './trunk-baseline'
import { trunkSyncSource, type FetchedTrunkSource, type TrunkSyncSource } from './trunk-sync'

function exitedWithOne(reason: unknown): boolean {
  return typeof reason === 'object' && reason !== null && 'code' in reason && reason.code === 1
}

async function readBranchConfig(exec: TrunkGitExec, key: string): Promise<string> {
  try {
    return (await exec(['config', '--get', key])).stdout.trim()
  } catch (reason) {
    if (exitedWithOne(reason)) {
      return ''
    }
    throw reason
  }
}

export async function readBranchSignatureOption(exec: TrunkGitExec, branch: string) {
  const options = await readBranchConfig(exec, `branch.${branch}.mergeOptions`)
  const words = options.match(/(?:[^\s'"\\]|\\.|"[^"]*"|'[^']*')+/g) ?? []
  return words
    .map((word) => word.replace(/['"\\]/g, ''))
    .findLast((word) => word === '--verify-signatures' || word === '--no-verify-signatures')
}

export async function readFlowUpstream(
  exec: TrunkGitExec,
  branch: string
): Promise<TrunkSyncSource | null> {
  const { stdout } = await exec([
    'for-each-ref',
    '--format=%(upstream:remotename)%09%(upstream:remoteref)%09%(upstream)',
    branchFullRef(branch)
  ])
  const [remoteName, remoteRef, trackingRef] = stdout.trimEnd().split('\t')
  if (remoteName === '.') {
    return null
  }
  if (
    remoteName &&
    remoteRef?.startsWith('refs/heads/') &&
    trackingRef?.startsWith('refs/remotes/')
  ) {
    return { remoteName, branchName: remoteRef.slice('refs/heads/'.length), trackingRef }
  }

  // Git's upstream atoms can be empty before a narrow clone maps the configured
  // branch. Use the exact Git configuration to fetch that branch anyway.
  const [configuredRemote, mergeRef] = await Promise.all([
    readBranchConfig(exec, `branch.${branch}.remote`),
    readBranchConfig(exec, `branch.${branch}.merge`)
  ])
  if (configuredRemote === '.') {
    return null
  }
  if (mergeRef) {
    const remotes = parseGitRemoteFetchUrls((await exec(['remote', '-v'])).stdout)
    const remote = remotes.has(configuredRemote)
      ? configuredRemote
      : [...remotes].find(([, url]) => url === configuredRemote)?.[0]
    if (!remote || !mergeRef.startsWith('refs/heads/')) {
      throw new Error('流程分支的上游不是可同步的远端分支，请核对 Git 跟踪配置')
    }
    return trunkSyncSource({ remoteName: remote, branchName: mergeRef.slice('refs/heads/'.length) })
  }

  // Older fixed branches can lack tracking config. Follow Orca's effective
  // upstream for a known published branch.
  const upstream = await resolveEffectiveGitUpstream(exec)
  return upstream?.remoteName
    ? trunkSyncSource({ remoteName: upstream.remoteName, branchName: upstream.branchName })
    : null
}

async function isAncestor(
  exec: TrunkGitExec,
  ancestor: string,
  descendant: string
): Promise<boolean> {
  try {
    await exec(['merge-base', '--is-ancestor', ancestor, descendant])
    return true
  } catch (reason) {
    if (exitedWithOne(reason)) {
      return false
    }
    throw reason
  }
}

export type FlowUpdate = { commit: string; pulled: number; merged: boolean }

export async function prepareFlowUpdate(
  exec: TrunkGitExec,
  head: string,
  sources: FetchedTrunkSource[],
  context: FlowMergeContext
): Promise<FlowUpdate> {
  const commits = [...new Set(sources.map((source) => source.commit))]
  const { stdout } = await exec(['merge-base', '--independent', head, ...commits])
  const tips = new Set(stdout.trim().split(/\s+/))
  if (tips.size === 1 && tips.has(head)) {
    return { commit: head, pulled: 0, merged: false }
  }

  let forward: FetchedTrunkSource | undefined
  const pending = sources.filter((source) => source.commit !== head && tips.delete(source.commit))
  // Take a possible fast-forward first, even when the other source diverged.
  if (!tips.has(head)) {
    for (const [index, source] of pending.entries()) {
      if (await isAncestor(exec, head, source.commit)) {
        forward = source
        pending.splice(index, 1)
        break
      }
    }
  }

  const count = await exec(['rev-list', '--count', ...commits, '--not', head])
  const pulled = Number(count.stdout.trim())
  if (!count.stdout.trim() || !Number.isSafeInteger(pulled) || pulled < 0) {
    throw new Error('无法读取本次同步引入的提交数')
  }
  const commit = pending.length
    ? await mergeFlowSources(context, head, forward, pending)
    : (forward?.commit ?? head)
  return { commit, pulled, merged: pending.length > 0 }
}
