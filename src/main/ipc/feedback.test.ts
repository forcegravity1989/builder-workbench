import { beforeEach, describe, expect, it, vi } from 'vitest'

const { submitWelinkReportMock, handlers } = vi.hoisted(() => ({
  submitWelinkReportMock: vi.fn(),
  handlers: new Map<string, (_event: unknown, args?: unknown) => unknown>()
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '1.2.3-test' },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel))
  }
}))

// Why (BW #553): the transport is the WeLink group-space sink; these cases
// pin what feedback.ts still owns — payload assembly (identity allow-list,
// lane rules), image validation, and result pass-through. The sink's own
// protocol (packaging, failure classification) is guarded in
// src/main/workbench/reporting/ tests and real-shell acceptance.
vi.mock('../workbench/reporting/report-submission', () => ({
  submitWelinkReport: submitWelinkReportMock
}))

import { registerFeedbackHandlers, submitFeedback, type FeedbackSubmitBody } from './feedback'

function pngImage(): { contentType: string; data: Uint8Array } {
  return { contentType: 'image/png', data: new Uint8Array(4).fill(1) }
}

function imageSubmitArgs(images: unknown[]): Parameters<typeof submitFeedback>[0] {
  return {
    feedback: 'with images',
    githubLogin: null,
    githubEmail: null,
    images
  } as Parameters<typeof submitFeedback>[0]
}

function diagnosticSubmitArgs(): Parameters<typeof submitFeedback>[0] {
  return {
    feedback: '[Crash Report]\n\nDiagnostic log:\n- Status: attached',
    feedbackWithoutDiagnosticBundle:
      '[Crash Report]\n\nDiagnostic log:\n- Status: not uploaded\n- Reason: attachment failed',
    submissionType: 'crash',
    submitAnonymously: true,
    githubLogin: null,
    githubEmail: null,
    diagnosticBundle: {
      bundleSubmissionId: 'bundleabcdefghijklmnop',
      content: '{"type":"bundle-header"}\n',
      bytes: 25,
      spanCount: 1
    }
  }
}

function sentBody(callIndex = 0): FeedbackSubmitBody {
  return submitWelinkReportMock.mock.calls[callIndex][0] as FeedbackSubmitBody
}

describe('submitFeedback', () => {
  beforeEach(() => {
    handlers.clear()
    submitWelinkReportMock.mockReset()
    submitWelinkReportMock.mockResolvedValue({ ok: true })
  })

  it('strips GitHub identity and anonymous contact fields when submitted anonymously', async () => {
    const anonymousArgs = {
      feedback: 'private bug report',
      submitAnonymously: true,
      githubLogin: 'trusted-user',
      githubEmail: 'trusted@example.com',
      anonymousGithubLogin: 'trusted-user',
      anonymousEmail: 'trusted@example.com',
      anonymousX: 'trusted'
    }
    await submitFeedback(anonymousArgs)

    const body = sentBody()
    expect(body).toMatchObject({
      feedback: 'private bug report',
      submissionType: 'feedback',
      githubLogin: null,
      githubEmail: null,
      appVersion: '1.2.3-test'
    })
    expect(body).not.toHaveProperty('anonymousGithubLogin')
    expect(body).not.toHaveProperty('anonymousEmail')
    expect(body).not.toHaveProperty('anonymousX')
  })

  it('preserves verified GitHub identity when not submitted anonymously', async () => {
    await submitFeedback({
      feedback: 'public bug report',
      submitAnonymously: false,
      githubLogin: 'trusted-user',
      githubEmail: 'trusted@example.com'
    })

    expect(sentBody()).toMatchObject({
      feedback: 'public bug report',
      submissionType: 'feedback',
      githubLogin: 'trusted-user',
      githubEmail: 'trusted@example.com',
      appVersion: '1.2.3-test'
    })
  })

  it('attaches diagnostic bundles only to crash submissions', async () => {
    const diagnosticBundle = {
      bundleSubmissionId: 'bundleabcdefghijklmnop',
      content: '{"type":"bundle-header"}\n',
      bytes: 25,
      spanCount: 1
    }
    // A stale renderer state must not smuggle a bundle onto the feedback lane.
    await submitFeedback({
      feedback: 'feature request',
      githubLogin: null,
      githubEmail: null,
      diagnosticBundle
    } as Parameters<typeof submitFeedback>[0])
    expect(sentBody(0).diagnosticBundle).toBeUndefined()

    await submitFeedback(diagnosticSubmitArgs())
    expect(sentBody(1)).toMatchObject({
      submissionType: 'crash',
      diagnosticBundle
    })
  })

  it('drops images from crash submissions without failing the report', async () => {
    // Why: the crash lane discards images, so validating them there would
    // abort a crash report the user needs delivered.
    await submitFeedback({
      ...diagnosticSubmitArgs(),
      images: [pngImage(), { contentType: 'application/pdf', data: new Uint8Array(0) }]
    } as Parameters<typeof submitFeedback>[0])

    const body = sentBody()
    expect(body.images).toBeUndefined()
    expect(body.submissionType).toBe('crash')
  })

  it('rejects unsupported image types and oversized counts before any sink call', async () => {
    const unsupported = await submitFeedback(
      imageSubmitArgs([{ contentType: 'application/pdf', data: new Uint8Array(4) }])
    )
    expect(unsupported.ok).toBe(false)

    const tooMany = await submitFeedback(
      imageSubmitArgs(Array.from({ length: 5 }, () => pngImage()))
    )
    expect(tooMany.ok).toBe(false)

    expect(submitWelinkReportMock).not.toHaveBeenCalled()
  })

  it('rejects hostile IPC image payloads at the handler boundary', async () => {
    registerFeedbackHandlers()
    const submit = handlers.get('feedback:submit')!

    // Why: the renderer screens types first, so this lane only matters for a
    // renderer invoking the channel directly — the case the handler guards.
    const prototypeType = (await submit(null, {
      feedback: 'images attached',
      githubLogin: null,
      githubEmail: null,
      images: [{ contentType: 'constructor', data: new Uint8Array(4).fill(1) }]
    })) as { ok: boolean; error?: string }
    expect(prototypeType).toMatchObject({ ok: false, error: 'Unsupported image type.' })

    const malformedBytes = (await submit(null, {
      feedback: 'images attached',
      githubLogin: null,
      githubEmail: null,
      images: [{ contentType: 'image/png', data: '8388608' }]
    })) as { ok: boolean; error?: string }
    expect(malformedBytes).toMatchObject({ ok: false, error: 'Invalid image attachment bytes.' })

    const oversizedBatch = (await submit(null, {
      feedback: 'images attached',
      githubLogin: null,
      githubEmail: null,
      images: Array.from({ length: 5 }, () => ({ contentType: 'image/png', data: '8388608' }))
    })) as { ok: boolean; error?: string }
    expect(oversizedBatch).toMatchObject({ ok: false, error: 'Attach 4 images or fewer.' })

    expect(submitWelinkReportMock).not.toHaveBeenCalled()
  })

  it('forces renderer IPC submissions onto the feedback lane', async () => {
    registerFeedbackHandlers()
    await handlers.get('feedback:submit')!(null, {
      feedback: 'compromised renderer wants the crash lane',
      submissionType: 'crash',
      githubLogin: null,
      githubEmail: null
    })

    expect(sentBody().submissionType).toBe('feedback')
  })

  it('passes sink results and the report-only fallback text through unchanged', async () => {
    submitWelinkReportMock.mockResolvedValue({
      ok: true,
      imagesDelivered: false,
      diagnosticBundleFailure: { status: null, error: '附件上传失败' }
    })
    const okResult = await submitFeedback(imageSubmitArgs([pngImage()]))
    expect(okResult).toEqual({
      ok: true,
      imagesDelivered: false,
      diagnosticBundleFailure: { status: null, error: '附件上传失败' }
    })

    submitWelinkReportMock.mockResolvedValue({
      ok: false,
      status: null,
      error: '无法访问 WeLink 内网接口(上报仅内网可达);请检查网络后重试。'
    })
    const failed = await submitFeedback(diagnosticSubmitArgs())
    expect(failed).toMatchObject({ ok: false, status: null })
    expect((failed as { error: string }).error).toContain('内网')
    // The crash lane's bundle-less retry text travels to the sink verbatim.
    expect(submitWelinkReportMock.mock.calls[1][1]).toBe(
      '[Crash Report]\n\nDiagnostic log:\n- Status: not uploaded\n- Reason: attachment failed'
    )
  })
})
