import { parseExecutionHostId } from '../../shared/execution-host'
import { toLinuxPath } from '../../shared/wsl-paths'
import type { VersionMaterialResult } from '../../shared/workbench/version-material-request'
import type {
  MetricCatalog,
  MetricRef,
  MetricScope,
  MetricsPort
} from '../../shared/workbench/metrics'
import { getActiveMultiplexer } from '../ssh/ssh-target-registry'
import {
  createMetricsService,
  type MetricCollectorContext,
  type MetricsHost
} from './metrics/collector-service'
import { MetricCollectorError } from './metrics/collector-output'
import { decodeMetricDefinitions } from './metrics/definitions'
import { resolveWorkbenchGitExecOptions } from './project-git-routing'
import {
  computeMetricsCheckoutRoot,
  executeMetricCollection,
  fingerprintMetricCollector,
  readMetricConfiguration,
  METRICS_COLLECT_TIMEOUT_MS,
  type MetricConfigurationSnapshot,
  type MetricProcessOutcome,
  type MetricsExecOptions
} from './metrics/metrics-execution-core'
import {
  createWorkbenchWorkspaceResolver,
  nativeWorkbenchWorkspaceHost,
  type WorkbenchWorkspaceTarget
} from './workspace-resolver'
import { WorkspaceScopeError } from './workspace-scope-error'

export type MetricsConfigurationRequest = {
  /** Wire name predates the trunk unification; carries the pinned worktreeBaseRef. */
  adoptedRef: string | null
  configurationCommit?: string
}
export type MetricsFingerprintRequest = { configurationCommit: string; run: string[] }
export type MetricsCollectRequest = {
  checkoutRoot: string
  configurationCommit: string
  run: string[]
  args: string[]
  env: Record<string, string>
  timeoutMs: number
}
export type MetricsOperationRequest =
  | { operation: 'configuration'; request: MetricsConfigurationRequest }
  | { operation: 'fingerprint'; request: MetricsFingerprintRequest }
  | { operation: 'collect'; request: MetricsCollectRequest }

/** Extra RPC budget so the executor's own 900s timeout reports first. */
const COLLECT_RPC_TIMEOUT_MS = METRICS_COLLECT_TIMEOUT_MS + 10_000

async function runLocalOperation(
  repoPath: string,
  execOptions: MetricsExecOptions,
  operation: MetricsOperationRequest
): Promise<unknown> {
  switch (operation.operation) {
    case 'configuration':
      return readMetricConfiguration({
        repoPath,
        execOptions,
        pinnedRef: operation.request.adoptedRef,
        configurationCommit: operation.request.configurationCommit
      })
    case 'fingerprint':
      return fingerprintMetricCollector({ repoPath, execOptions, ...operation.request })
    case 'collect':
      return executeMetricCollection({ repoPath, execOptions, ...operation.request })
  }
}

/**
 * One execution core for local/WSL and SSH: local runs in-process, SSH hands the
 * same operations to the narrow `workbench.metrics.execute` relay executor —
 * provider.exec stays untouched and no generic remote exec is invented.
 */
export async function executeMetricsOperation(
  target: WorkbenchWorkspaceTarget,
  execOptions: MetricsExecOptions,
  operation: MetricsOperationRequest
): Promise<unknown> {
  const host = parseExecutionHostId(target.hostId)
  if (host?.kind === 'local') {
    return runLocalOperation(target.repoPath, execOptions, operation)
  }
  if (host?.kind !== 'ssh') {
    throw new WorkspaceScopeError('invalid-scope', '请通过工作树所属的 Orca runtime 采集指标')
  }
  const channel = getActiveMultiplexer(host.targetId)
  if (!channel) {
    throw new WorkspaceScopeError('host-unavailable', '工作树所属的 SSH 主机未连接')
  }
  const result = (await channel.request(
    'workbench.metrics.execute',
    { target: { repoPath: target.repoPath }, ...operation },
    {
      timeoutMs: operation.operation === 'collect' ? COLLECT_RPC_TIMEOUT_MS : 75_000
    }
  )) as VersionMaterialResult<unknown>
  if (!result.ok) {
    throw new MetricCollectorError(result.error.code, result.error.message)
  }
  return result.value
}

export function interpretOutcome(
  outcome: MetricProcessOutcome,
  timeoutMs: number
): { stdout: string } {
  if (outcome.timedOut) {
    throw new MetricCollectorError(
      'collector-timeout',
      `采集脚本超过 ${Math.round(timeoutMs / 1000)} 秒未结束，已终止`
    )
  }
  if (outcome.outputTruncated) {
    throw new MetricCollectorError('output-truncated', '采集输出超出上限被截断，本次读数不可用')
  }
  if (outcome.code !== 0) {
    const detail = outcome.stderr.trim().slice(-400)
    throw new MetricCollectorError(
      'collector-failed',
      `采集脚本以 ${outcome.code ?? outcome.signal ?? '未知方式'} 结束${detail ? `：${detail}` : ''}`
    )
  }
  return { stdout: outcome.stdout }
}

export function nativeMetricsHost(runtime: {
  listRepos: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['listRepos']
  showManagedWorktree: Parameters<typeof nativeWorkbenchWorkspaceHost>[0]['showManagedWorktree']
  listProjects: Parameters<typeof resolveWorkbenchGitExecOptions>[0]['listProjects']
}): MetricsHost {
  const resolver = createWorkbenchWorkspaceResolver(nativeWorkbenchWorkspaceHost(runtime))
  return {
    async catalog(scope: MetricScope): Promise<MetricCatalog> {
      const { target, repo } = await resolver.resolve(scope)
      const execOptions = resolveWorkbenchGitExecOptions(runtime, repo)
      const snapshot = (await executeMetricsOperation(target, execOptions, {
        operation: 'configuration',
        request: { adoptedRef: repo.worktreeBaseRef?.trim() || null }
      })) as MetricConfigurationSnapshot
      const { features, definitions, problems } = decodeMetricDefinitions(
        snapshot.toml,
        snapshot.configurationCommit
      )
      return {
        scope,
        configurationCommit: snapshot.configurationCommit,
        configurationRef: snapshot.configurationRef,
        timezone: snapshot.timezone,
        features,
        definitions,
        problems
      }
    },
    async prepare(scope: MetricScope, ref: MetricRef): Promise<MetricCollectorContext> {
      const { target, repo, reauthorize } = await resolver.resolve(scope)
      const execOptions = resolveWorkbenchGitExecOptions(runtime, repo)
      const adoptedRef = repo.worktreeBaseRef?.trim() || null
      const snapshot = (await executeMetricsOperation(target, execOptions, {
        operation: 'configuration',
        request: { adoptedRef, configurationCommit: ref.configurationCommit }
      })) as MetricConfigurationSnapshot
      const { definitions } = decodeMetricDefinitions(snapshot.toml, snapshot.configurationCommit)
      const definition = definitions.find((entry) => entry.ref.name === ref.name)
      if (!definition) {
        throw new MetricCollectorError('definition-changed', '该配置修订中不存在所引用的指标定义')
      }
      const collectorRevision = (await executeMetricsOperation(target, execOptions, {
        operation: 'fingerprint',
        request: { configurationCommit: ref.configurationCommit, run: [...definition.collect.run] }
      })) as string
      const dataTarget = {
        repository: scope.repoId,
        commit: snapshot.dataCommit,
        hostId: target.hostId
      }
      const checkoutRoot = computeMetricsCheckoutRoot(repo.path, repo.worktreeBasePath)
      const wslGuestDataRoot = execOptions.wslDistro ? toLinuxPath(repo.path) : repo.path
      return {
        definition,
        collectorRevision,
        source: `${scope.repoId}@${ref.configurationCommit}`,
        dataTarget,
        async run(args, timezone) {
          await reauthorize()
          const outcome = (await executeMetricsOperation(target, execOptions, {
            operation: 'collect',
            request: {
              checkoutRoot,
              configurationCommit: ref.configurationCommit,
              run: [...definition.collect.run],
              args: [...args],
              env: {
                BW_METRICS_TIMEZONE: timezone,
                BW_METRICS_DATA_ROOT: wslGuestDataRoot,
                BW_METRICS_DATA_COMMIT: dataTarget.commit
              },
              timeoutMs: METRICS_COLLECT_TIMEOUT_MS
            }
          })) as MetricProcessOutcome
          return interpretOutcome(outcome, METRICS_COLLECT_TIMEOUT_MS)
        }
      }
    }
  }
}

// The service owns the read-through cache and in-flight deduplication, so one
// instance must outlive individual RPC calls; the runtime object is the stable key.
const services = new WeakMap<object, MetricsPort>()

export function nativeMetricsService(
  runtime: Parameters<typeof nativeMetricsHost>[0]
): MetricsPort {
  let service = services.get(runtime)
  if (!service) {
    service = createMetricsService(nativeMetricsHost(runtime))
    services.set(runtime, service)
  }
  return service
}
