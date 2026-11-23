import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { eraseRpcMethods, isStreamingMethod } from '../core'
import { WORKBENCH_SHARE_METHODS } from './workbench-share'

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  getLink: vi.fn(),
  remove: vi.fn(),
  list: vi.fn()
}))

vi.mock('../../../artifacts/self-hosted-share-runtime', () => ({
  nativeShareService: () => mocks
}))

function method(name: string) {
  const found = eraseRpcMethods(WORKBENCH_SHARE_METHODS).find(
    (candidate) => candidate.name === name
  )
  if (!found) {
    throw new Error(`Missing method ${name}`)
  }
  return found
}

const SOURCE_KEY = '/tmp/reports/summary.html'
const PUBLISH_PARAMS = {
  sourceKey: SOURCE_KEY,
  content: '<h1>Summary</h1>',
  fileName: 'summary.html'
}

const CASES: {
  methodName: string
  params: object
  serviceMethod: keyof typeof mocks
  expectedArgs: unknown[]
}[] = [
  {
    methodName: 'workbench.share.publish',
    params: PUBLISH_PARAMS,
    serviceMethod: 'publish',
    expectedArgs: [PUBLISH_PARAMS]
  },
  {
    methodName: 'workbench.share.getLink',
    params: { sourceKey: SOURCE_KEY },
    serviceMethod: 'getLink',
    expectedArgs: [SOURCE_KEY]
  },
  {
    methodName: 'workbench.share.remove',
    params: { sourceKey: SOURCE_KEY },
    serviceMethod: 'remove',
    expectedArgs: [SOURCE_KEY]
  },
  { methodName: 'workbench.share.list', params: {}, serviceMethod: 'list', expectedArgs: [] }
]

const runtime = {} as unknown as OrcaRuntimeService

describe('workbench.share RPC methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(CASES)(
    'reaches the share service for host-device $methodName calls',
    async (testCase) => {
      const expected = { ok: true, value: null }
      const serviceMethod = mocks[testCase.serviceMethod]
      serviceMethod.mockResolvedValue(expected)
      const target = method(testCase.methodName)
      if (isStreamingMethod(target)) {
        throw new Error(`${testCase.methodName} must be a request method`)
      }

      await expect(target.handler(testCase.params, { runtime })).resolves.toBe(expected)
      expect(serviceMethod).toHaveBeenCalledWith(...testCase.expectedArgs)
    }
  )

  it.each(CASES)(
    'rejects paired-device calls to $methodName before touching the service',
    async (testCase) => {
      const target = method(testCase.methodName)
      if (isStreamingMethod(target)) {
        throw new Error(`${testCase.methodName} must be a request method`)
      }

      for (const clientKind of ['mobile', 'runtime'] as const) {
        await expect(target.handler(testCase.params, { runtime, clientKind })).rejects.toThrow(
          /host device/
        )
      }
      expect(mocks.publish).not.toHaveBeenCalled()
      expect(mocks.getLink).not.toHaveBeenCalled()
      expect(mocks.remove).not.toHaveBeenCalled()
      expect(mocks.list).not.toHaveBeenCalled()
    }
  )

  it.each(CASES)(
    'reaches the service for desktop-renderer $methodName calls over the runtime IPC channel',
    async (testCase) => {
      const expected = { ok: true, value: null }
      const serviceMethod = mocks[testCase.serviceMethod]
      serviceMethod.mockResolvedValue(expected)
      const target = method(testCase.methodName)
      if (isStreamingMethod(target)) {
        throw new Error(`${testCase.methodName} must be a request method`)
      }

      await expect(
        target.handler(testCase.params, {
          runtime,
          clientId: 'desktop-renderer',
          clientKind: 'runtime'
        })
      ).resolves.toBe(expected)
      expect(serviceMethod).toHaveBeenCalledWith(...testCase.expectedArgs)
    }
  )
})
