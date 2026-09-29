import { z } from 'zod'
import type { RelayDispatcher } from '../dispatcher'
import {
  executeMetricCollection,
  fingerprintMetricCollector,
  readMetricConfiguration,
  METRICS_COLLECT_TIMEOUT_MS
} from '../../main/workbench/metrics/metrics-execution-core'
import { workbenchRuntimeResult } from '../../main/workbench/workbench-runtime-result'

const Sha = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** argv only: no NUL, no newlines; the core spawns without a shell. */
const Argv = z
  .array(
    z
      .string()
      .min(1)
      .refine((value) => !/[\0\n\r]/.test(value))
  )
  .min(1)
  .max(64)

const Command = z.strictObject({
  target: z.strictObject({ repoPath: z.string().min(1) }),
  operation: z.enum(['configuration', 'fingerprint', 'collect']),
  request: z.unknown()
})

const ConfigurationRequest = z.strictObject({
  adoptedRef: z.string().min(1).nullable(),
  configurationCommit: Sha.optional(),
  synchronize: z.boolean().optional()
})
const FingerprintRequest = z.strictObject({ configurationCommit: Sha, run: Argv })
const CollectRequest = z.strictObject({
  // Prepared checkouts live under the host's temp roots; refuse traversal and
  // relative paths so the wire value cannot point the executor at arbitrary trees.
  checkoutRoot: z
    .string()
    .min(1)
    .refine((value) => /^[A-Za-z]:[/\\]/.test(value) || value.startsWith('/'))
    .refine((value) => !value.split(/[/\\]/).includes('..')),
  configurationCommit: Sha,
  run: Argv,
  args: z.tuple([
    z.literal('--since'),
    Day,
    z.literal('--until'),
    Day,
    z.literal('--granularity'),
    z.enum(['day', 'week'])
  ]),
  env: z.record(z.string().regex(/^BW_METRICS_[A-Z0-9_]+$/), z.string().max(4096)),
  timeoutMs: z.number().int().positive().max(METRICS_COLLECT_TIMEOUT_MS)
})

/**
 * Narrow SSH executor for BW metrics: the same execution core the local host
 * runs (fixed-revision checkout, argv spawn, finally-discard), mounted on
 * Orca's authenticated relay. No generic remote exec is exposed — operations
 * are fixed, argv is validated, and env crosses only as BW_METRICS_* values.
 *
 * Trust model (declared, not implied): `collect.run` argv and `checkoutRoot`
 * arrive over the authenticated relay channel and are shape-validated only;
 * the normal product path derives them from the pinned .bw/metrics.toml on the
 * calling host, but this executor does not re-derive them from the commit.
 * That is not a privilege escalation today — the same relay session already
 * exposes an interactive PTY and the repoPath trust model matches
 * version-material-handler — yet any future channel caller would inherit raw
 * argv execution. Re-deriving `run` from configurationCommit here (name +
 * definitionHash on the wire) is the registered follow-up; do not treat this
 * handler as a general remote-exec boundary.
 */
export function registerMetricsRelay(dispatcher: Pick<RelayDispatcher, 'onRequest'>) {
  dispatcher.onRequest('workbench.metrics.execute', async (params) => {
    const { target, operation, request } = Command.parse(params)
    return workbenchRuntimeResult(async () => {
      switch (operation) {
        case 'configuration':
          return readMetricConfiguration({
            repoPath: target.repoPath,
            ...ConfigurationRequest.parse(request)
          })
        case 'fingerprint':
          return fingerprintMetricCollector({
            repoPath: target.repoPath,
            ...FingerprintRequest.parse(request)
          })
        case 'collect': {
          const parsed = CollectRequest.parse(request)
          return executeMetricCollection({ repoPath: target.repoPath, ...parsed })
        }
      }
    })
  })
}
