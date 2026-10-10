import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import { runProcess } from '../../shared/child-process/run-process'
import {
  describeConnectorTarget,
  parseClaudeMcpList,
  parseCodexMcpListJson,
  type ConnectorAgentListing,
  type ConnectorListRequest,
  type ConnectorListResult
} from '../../shared/workbench/connector-status'
import { resolveCommandOnLocalPath } from '../ipc/command-path-resolver'
import { WorkspaceScopeError } from './workspace-scope-error'

/** `claude mcp list` 会逐个连一遍服务；实测 8 个约 6.5 秒，留足余量。 */
const LIST_TIMEOUT_MS = 30_000

export type ConnectorRuntimeHost = {
  listRepos(): Pick<Repo, 'id' | 'path' | 'connectionId' | 'executionHostId'>[]
}

async function projectDir(
  host: ConnectorRuntimeHost,
  repoId: string | undefined
): Promise<string | null> {
  if (!repoId) {
    return null
  }
  const matches = host.listRepos().filter((repo) => repo.id === repoId)
  if (matches.length !== 1) {
    throw new WorkspaceScopeError('invalid-scope', '项目不存在或身份不唯一')
  }
  const repo = matches[0]
  // 两家 CLI 只认本机配置；SSH / 远端 runtime 上的仓库读不到它们的项目级 connector。
  if (parseExecutionHostId(getRepoExecutionHostId(repo))?.kind !== 'local') {
    return null
  }
  const info = await stat(repo.path).catch(() => null)
  return info?.isDirectory() ? repo.path : null
}

async function runAgentList(
  bin: 'claude' | 'codex',
  args: string[],
  cwd: string
): Promise<
  | { missing: true }
  | { missing: false; code: number | null; stdout: string; stderr: string; timedOut: boolean }
> {
  const program = await resolveCommandOnLocalPath(bin)
  if (!program) {
    return { missing: true }
  }
  const result = await runProcess({ program, args, cwd, timeoutMs: LIST_TIMEOUT_MS })
  return { missing: false, ...result }
}

async function listClaude(cwd: string): Promise<ConnectorAgentListing> {
  const run = await runAgentList('claude', ['mcp', 'list'], cwd).catch((error: unknown) => ({
    missing: false as const,
    code: null,
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error),
    timedOut: false
  }))
  if (run.missing) {
    return { status: 'missing' }
  }
  if (run.timedOut || run.code !== 0) {
    return { status: 'error', message: failureMessage('claude mcp list', run) }
  }
  const rows = [...parseClaudeMcpList(run.stdout)].map(([name, probe]) => ({ name, ...probe }))
  return { status: 'ok', rows }
}

async function listCodex(cwd: string): Promise<ConnectorAgentListing> {
  const run = await runAgentList('codex', ['mcp', 'list', '--json'], cwd).catch(
    (error: unknown) => ({
      missing: false as const,
      code: null,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      timedOut: false
    })
  )
  if (run.missing) {
    return { status: 'missing' }
  }
  if (run.timedOut || run.code !== 0) {
    return { status: 'error', message: failureMessage('codex mcp list', run) }
  }
  const parsed = parseCodexMcpListJson(run.stdout)
  if (!parsed) {
    return { status: 'error', message: 'codex mcp list --json 的输出不是预期的 JSON 列表' }
  }
  return {
    status: 'ok',
    rows: parsed.map(({ name, target, state, detail }) => ({
      name,
      target: describeConnectorTarget(target),
      state,
      ...(detail ? { detail } : {})
    }))
  }
}

function failureMessage(
  label: string,
  run: { code: number | null; stderr: string; timedOut: boolean }
): string {
  if (run.timedOut) {
    return `${label} 超过 ${LIST_TIMEOUT_MS / 1000} 秒没有结束`
  }
  const firstLine = run.stderr.trim().split(/\r?\n/)[0] ?? ''
  return `${label} 退出码 ${run.code ?? '未知'}${firstLine ? `：${firstLine}` : ''}`
}

export async function listConnectors(
  host: ConnectorRuntimeHost,
  request: ConnectorListRequest
): Promise<ConnectorListResult> {
  const projectPath = await projectDir(host, request.repoId)
  const cwd = projectPath ?? homedir()
  const [claude, codex] = await Promise.all([listClaude(cwd), listCodex(cwd)])
  return { projectPath, claude, codex }
}
