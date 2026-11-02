import { isSafeGitRemoteName } from '../../shared/git-push-target-validation'
import { buildNarrowForkFetchRefspec } from '../git/fork-remote-refspec'
import { fixedWorkspaceRequestForBranch } from '../../shared/workbench/fixed-workspace'
import { WorkspaceScopeError } from './workspace-scope-error'

type Exec = (args: string[]) => Promise<{ stdout: string }>

function capture(ref: string, pattern: string): string | null {
  const star = pattern.indexOf('*')
  if (star === -1) {
    return ref === pattern ? '' : null
  }
  const prefix = pattern.slice(0, star)
  const suffix = pattern.slice(star + 1)
  return ref.startsWith(prefix) &&
    ref.endsWith(suffix) &&
    ref.length >= prefix.length + suffix.length
    ? ref.slice(prefix.length, ref.length - suffix.length)
    : null
}

/** Preserve existing mappings; native bounded mappings tolerate a subsequently deleted branch. */
export async function ensureFixedBranchTracking(
  exec: Exec,
  remote: string,
  branch: string,
  expectedHead: string
) {
  fixedWorkspaceRequestForBranch(branch)
  await exec(['check-ref-format', '--branch', branch])
  if (!isSafeGitRemoteName(remote)) {
    throw new WorkspaceScopeError('branch-source-unavailable', '固定分支的远端名称无效')
  }
  const configured = (await exec(['remote'])).stdout.trim().split(/\r?\n/)
  if (!configured.includes(remote)) {
    throw new WorkspaceScopeError('branch-source-changed', '项目远端已改变，请重试')
  }
  const source = `refs/heads/${branch}`
  const target = `refs/remotes/${remote}/${branch}`
  if (
    (await exec(['rev-parse', '--verify', `${target}^{commit}`])).stdout.trim() !== expectedHead
  ) {
    throw new WorkspaceScopeError('branch-source-changed', '固定分支来源已改变，请重试')
  }
  const key = `remote.${remote}.fetch`
  let entries: string[] = []
  try {
    entries = (await exec(['config', '--get-all', key])).stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
  } catch (error) {
    if ((error as { code?: unknown }).code !== 1) {
      throw error
    }
  }
  let covered = false
  for (const entry of entries) {
    const stars = (value: string) => value.split('*').length - 1
    if (entry.startsWith('^')) {
      if (stars(entry) > 1) {
        throw new WorkspaceScopeError(
          'branch-source-unavailable',
          '项目 fetch 排除规则无效，请核对后重试'
        )
      }
      if (capture(source, entry.slice(1)) !== null) {
        throw new WorkspaceScopeError(
          'branch-excluded',
          `项目 fetch 配置排除了固定分支 ${branch}，请核对后重试`
        )
      }
      continue
    }
    const [from, to] = entry.replace(/^\+/, '').split(':')
    if (stars(from) > 1 || (to && stars(from) !== stars(to))) {
      throw new WorkspaceScopeError(
        'branch-source-unavailable',
        '项目 fetch 映射规则无效，请核对后重试'
      )
    }
    const matched = capture(source, from)
    if (matched === null || !to) {
      continue
    }
    if (to.replace('*', matched) !== target) {
      throw new WorkspaceScopeError(
        'branch-ambiguous',
        `固定分支 ${branch} 已映射到其他远端引用，请核对项目 fetch 配置`
      )
    }
    covered = true
  }
  if (!covered) {
    const desired = buildNarrowForkFetchRefspec(remote, branch)
    const exact = `^${desired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
    await exec(['config', '--local', '--replace-all', key, desired, exact])
  }
}
