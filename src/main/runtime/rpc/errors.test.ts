import { describe, expect, it } from 'vitest'
import { mapRuntimeError } from './errors'
import {
  ARTIFACT_SHARING_DISABLED_CODE,
  ARTIFACT_SHARING_DISABLED_MESSAGE,
  ArtifactSharingDisabledError
} from '../../../shared/artifact-sharing-gate'
import {
  AUTOMATION_OWNER_CONFLICT_CODES,
  AutomationOwnerConflictError
} from '../../../shared/automation-owner-conflict'
import {
  NESTED_WORKER_DEPTH_EXCEEDED_CODE,
  NESTED_WORKER_DEPTH_EXCEEDED_NEXT_STEPS,
  nestedWorkerDepthExceededMessage
} from '../../../shared/nested-worker-depth'
import { OrchestrationError } from '../orchestration/orchestration-error'

class LineageError extends Error {
  code = 'LINEAGE_PARENT_NOT_FOUND'
  data = {
    nextSteps: ['Run `orca worktree list`.', 'Retry with --no-parent.']
  }
}

describe('mapRuntimeError', () => {
  it('preserves the stable skill failure category and retryability across RPC', () => {
    expect(
      mapRuntimeError(
        'req_1',
        { runtimeId: 'runtime-1' },
        new Error('skill-download-transport-failed')
      )
    ).toMatchObject({
      ok: false,
      error: {
        code: 'skill_install_failure',
        message: 'skill-download-transport-failed',
        data: {
          category: 'transport',
          code: 'skill-download-transport-failed',
          retryable: true
        }
      }
    })
  })

  it.each(['terminal_tab_close_timeout', 'terminal_tab_not_found', 'terminal_tab_pinned'])(
    'preserves the durable terminal tab close failure %s',
    (code) => {
      expect(mapRuntimeError('req_1', { runtimeId: 'runtime-1' }, new Error(code))).toMatchObject({
        ok: false,
        error: { code, message: code }
      })
    }
  )

  it.each(['agent_prompt_blocked', 'agent_prompt_stalled', 'request_aborted'])(
    'preserves the agent prompt failure %s',
    (code) => {
      expect(mapRuntimeError('req_1', { runtimeId: 'runtime-1' }, new Error(code))).toMatchObject({
        ok: false,
        error: { code, message: code }
      })
    }
  )

  it.each([
    'remote_update_manual_required',
    'remote_update_not_available',
    'remote_update_not_downloaded'
  ])('preserves remote updater failure %s', (code) => {
    expect(mapRuntimeError('req_1', { runtimeId: 'runtime-1' }, new Error(code))).toMatchObject({
      ok: false,
      error: { code, message: code }
    })
  })

  it.each(['remote_runtime_unavailable', 'runtime_timeout', 'invalid_runtime_response'])(
    'preserves structured remote transport failure %s',
    (code) => {
      const error = Object.assign(new Error(`Remote transport failed: ${code}`), { code })

      expect(mapRuntimeError('req_1', { runtimeId: 'runtime-1' }, error)).toMatchObject({
        ok: false,
        error: { code, message: `Remote transport failed: ${code}` }
      })
    }
  )

  it('preserves structured lineage error codes and data for CLI recovery hints', () => {
    const response = mapRuntimeError(
      'req_1',
      { runtimeId: 'runtime-1' },
      new LineageError('Parent selector was not found.')
    )

    expect(response).toEqual({
      id: 'req_1',
      ok: false,
      error: {
        code: 'LINEAGE_PARENT_NOT_FOUND',
        message: 'Parent selector was not found.',
        data: {
          nextSteps: ['Run `orca worktree list`.', 'Retry with --no-parent.']
        }
      },
      _meta: { runtimeId: 'runtime-1' }
    })
  })
})

describe('artifact sharing denial', () => {
  it('reaches the CLI with its code, message, and next steps intact', () => {
    expect(
      mapRuntimeError('req_1', { runtimeId: 'runtime-1' }, new ArtifactSharingDisabledError())
    ).toMatchObject({
      ok: false,
      error: {
        code: ARTIFACT_SHARING_DISABLED_CODE,
        message: ARTIFACT_SHARING_DISABLED_MESSAGE,
        data: { nextSteps: expect.arrayContaining([expect.stringContaining('Settings')]) }
      }
    })
  })
})

// Why: the renderer decides between "reload the host", "re-adopt", and "stop offering
// the action" from this code; flattened to runtime_error it can only guess.
describe('automation owner conflicts', () => {
  it.each(Object.values(AUTOMATION_OWNER_CONFLICT_CODES))(
    'passes %s through structured',
    (code) => {
      expect(
        mapRuntimeError('req_1', { runtimeId: 'runtime-1' }, new AutomationOwnerConflictError(code))
      ).toMatchObject({ ok: false, error: { code } })
    }
  )

  it('still lets an old runtime be classified from the message tail', () => {
    const error = new AutomationOwnerConflictError(AUTOMATION_OWNER_CONFLICT_CODES.ownerChanged)
    expect(error.message.endsWith(`: ${AUTOMATION_OWNER_CONFLICT_CODES.ownerChanged}`)).toBe(true)
  })
})

describe('nested worker depth cap', () => {
  it('keeps its code and next steps instead of collapsing to runtime_error', () => {
    const failure = mapRuntimeError(
      'rpc_depth',
      { runtimeId: 'runtime-1' },
      new OrchestrationError(
        NESTED_WORKER_DEPTH_EXCEEDED_CODE,
        nestedWorkerDepthExceededMessage(2, 1),
        { effectsApplied: false, nextSteps: [...NESTED_WORKER_DEPTH_EXCEEDED_NEXT_STEPS] }
      )
    )

    expect(failure.error.code).toBe(NESTED_WORKER_DEPTH_EXCEEDED_CODE)
    expect(failure.error.data).toMatchObject({
      effectsApplied: false,
      nextSteps: [...NESTED_WORKER_DEPTH_EXCEEDED_NEXT_STEPS]
    })
  })
})

describe('structured worker dispatch preamble errors', () => {
  it('preserves the undelivered verdict across runtime RPC', () => {
    const failure = mapRuntimeError(
      'rpc_dispatch_preamble',
      { runtimeId: 'runtime-1' },
      new OrchestrationError(
        'dispatch_preamble_undelivered',
        'The dispatch preamble was not delivered: provider_write_failed: broken pipe.'
      )
    )

    expect(failure).toMatchObject({
      ok: false,
      error: {
        code: 'dispatch_preamble_undelivered',
        message: 'The dispatch preamble was not delivered: provider_write_failed: broken pipe.'
      }
    })
  })
})
