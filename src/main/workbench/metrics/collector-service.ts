import { randomUUID } from 'node:crypto'
import {
  MetricScopeSchema,
  MetricReadRequestSchema,
  metricRefKey,
  type MetricScope,
  type MetricRef,
  type MetricWindow,
  type MetricCatalog,
  type MetricDefinition,
  type MetricsPort,
  type MetricReading,
  type MetricRun,
  type MetricReadRequest
} from '../../../shared/workbench/metrics'
import { decodeMetricOutput, MetricCollectorError } from './collector-output'

export type MetricCollectorContext = {
  definition: MetricDefinition
  collectorRevision: string
  source: string
  dataTarget: MetricRun['dataTarget']
  /** Native adapter verifies the adopted revision and exact execution root before every run. */
  run(args: string[], timezone: string): Promise<{ stdout: string }>
}
export type MetricsHost = {
  catalog(scope: MetricScope): Promise<MetricCatalog>
  prepare(scope: MetricScope, ref: MetricRef): Promise<MetricCollectorContext>
}

export function createMetricsService(
  host: MetricsHost,
  clock = () => new Date().toISOString()
): MetricsPort {
  const completed = new Map<string, MetricReading>()
  const running = new Map<string, Promise<MetricReading>>()
  const lastAttempt = new Map<string, MetricReading>()
  const generation = new Map<string, number>()
  const keyFor = (scope: MetricScope, ref: MetricRef, window: MetricWindow) =>
    JSON.stringify([scope.repoId, scope.hostId, metricRefKey(ref), window])
  const requestKey = (request: MetricReadRequest) =>
    JSON.stringify([keyFor(request.scope, request.ref, request.window), request.scope.worktreeId])
  function failed(error: unknown, previous?: MetricReading): MetricReading {
    return {
      status: 'error',
      reason: {
        code: error instanceof MetricCollectorError ? error.code : 'collection-failed',
        message: error instanceof Error ? error.message : '采集失败'
      },
      previous: previous?.status === 'ready' ? previous : previous?.previous
    }
  }
  async function resolve(request: MetricReadRequest) {
    const context = await host.prepare(request.scope, request.ref)
    if (metricRefKey(context.definition.ref) !== metricRefKey(request.ref)) {
      throw new MetricCollectorError('definition-changed', '采集配置与引用不一致，请核对指标口径')
    }
    return {
      request,
      context,
      key: JSON.stringify([
        keyFor(request.scope, request.ref, request.window),
        context.collectorRevision,
        context.source,
        context.dataTarget.repository,
        context.dataTarget.commit,
        context.dataTarget.hostId
      ])
    }
  }

  return {
    list(input) {
      return host.catalog(MetricScopeSchema.parse(input))
    },
    async read(input) {
      const request = MetricReadRequestSchema.parse(input)
      try {
        const { key } = await resolve(request)
        return (
          completed.get(key) ?? {
            status: 'unknown',
            reason: { code: 'not-collected', message: '此来源和窗口尚未采集' }
          }
        )
      } catch (error) {
        return failed(error, lastAttempt.get(requestKey(request)))
      }
    },
    async refresh(input) {
      const request = MetricReadRequestSchema.parse(input)
      const lookup = requestKey(request)
      const sequence = (generation.get(lookup) ?? 0) + 1
      generation.set(lookup, sequence)
      const remember = (value: MetricReading) => {
        if (generation.get(lookup) === sequence) {
          lastAttempt.set(lookup, value)
        }
        return value
      }
      let resolved: Awaited<ReturnType<typeof resolve>>
      try {
        resolved = await resolve(request)
      } catch (error) {
        return remember(failed(error, lastAttempt.get(lookup)))
      }
      const { context, key } = resolved
      const pending = running.get(key)
      if (pending) {
        return remember(await pending)
      }
      const previous = completed.get(key)
      const oldEvidence = previous?.status === 'ready' ? previous : previous?.previous
      const promise = (async (): Promise<MetricReading> => {
        const startedAt = clock()
        const run: MetricRun = {
          runId: randomUUID(),
          startedAt,
          finishedAt: startedAt,
          collectorRevision: context.collectorRevision,
          dataTarget: context.dataTarget
        }
        try {
          const { since, until, granularity } = request.window
          const output = await context.run(
            ['--since', since, '--until', until, '--granularity', granularity],
            request.window.timezone
          )
          run.finishedAt = clock()
          const readings = decodeMetricOutput({
            stdout: output.stdout,
            definition: context.definition,
            window: request.window,
            collectedAt: run.finishedAt,
            collectorRevision: context.collectorRevision,
            source: context.source
          })
          return readings.length
            ? { status: 'ready', readings, run }
            : {
                status: 'unknown',
                reason: { code: 'no-data', message: '来源没有返回本窗口的适用数据' },
                previous: oldEvidence,
                run
              }
        } catch (error) {
          run.finishedAt = clock()
          return {
            status: 'error',
            reason: {
              code: error instanceof MetricCollectorError ? error.code : 'collection-failed',
              message: error instanceof Error ? error.message : '采集失败'
            },
            previous: oldEvidence,
            run
          }
        }
      })()
      running.set(key, promise)
      try {
        const result = await promise
        completed.set(key, result)
        return remember(result)
      } finally {
        if (running.get(key) === promise) {
          running.delete(key)
        }
      }
    }
  }
}
