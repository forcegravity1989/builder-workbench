import { describe, expect, it } from 'vitest'
import {
  deriveIntegrationConnectionStatus,
  deriveIntegrationFlowState,
  deriveIntegrationStepStates,
  deriveWorkbenchSetupIntegrationStatus
} from './use-integration-connection-status'
import { deriveCliProviderCardState } from '@/components/settings/source-control-integration-cards'

type StatusFacts = Parameters<typeof deriveIntegrationConnectionStatus>[0]

function statusFacts(overrides: Partial<StatusFacts> = {}): StatusFacts {
  return {
    preflightStatus: {
      gh: { installed: false, authenticated: false },
      glab: { installed: false, authenticated: false },
      bitbucket: { configured: false, authenticated: false },
      azureDevOps: {
        configured: false,
        authenticated: false,
        tokenConfigured: false,
        baseUrl: null
      },
      gitea: {
        configured: false,
        authenticated: false,
        tokenConfigured: false,
        baseUrl: null
      }
    },
    preflightStatusChecked: true,
    preflightStatusContextKey: 'host',
    preflightStatusError: null,
    preflightStatusLoading: false,
    expectedPreflightContextKey: 'host',
    linearStatus: { connected: false },
    linearStatusChecked: true,
    linearStatusContextKey: 'local#0',
    jiraStatus: { connected: false },
    jiraStatusChecked: true,
    jiraStatusContextKey: 'local#0',
    providerRuntimeContextKey: 'local#0',
    ...overrides
  }
}

describe('deriveIntegrationStepStates', () => {
  it('starts with review active and tasks upcoming when nothing is connected', () => {
    expect(
      deriveIntegrationStepStates({
        reviewConnected: false,
        trackerConnected: false,
        codeHostTaskConnected: false
      })
    ).toEqual({ review: 'active', task: 'upcoming', complete: false })
  })

  it('promotes tasks to active once a non-task review provider connects', () => {
    expect(
      deriveIntegrationStepStates({
        reviewConnected: true,
        trackerConnected: false,
        codeHostTaskConnected: false
      })
    ).toEqual({ review: 'done', task: 'active', complete: false })
  })

  it('completes both steps when a dedicated tracker connects', () => {
    expect(
      deriveIntegrationStepStates({
        reviewConnected: true,
        trackerConnected: true,
        codeHostTaskConnected: false
      })
    ).toEqual({ review: 'done', task: 'done', complete: true })
  })

  it('completes the task step from a connected code host without a tracker', () => {
    // Code-host issues double as a task source, so a connected code host
    // resolves step 2 outright instead of asking for an extra acknowledgement.
    expect(
      deriveIntegrationStepStates({
        reviewConnected: true,
        trackerConnected: false,
        codeHostTaskConnected: true
      })
    ).toEqual({ review: 'done', task: 'done', complete: true })
  })

  it('ignores the code host for tasks until review is connected', () => {
    // Step 2 is unreachable until step 1 is done, so the code host alone must
    // not resolve tasks or complete the flow.
    expect(
      deriveIntegrationStepStates({
        reviewConnected: false,
        trackerConnected: false,
        codeHostTaskConnected: true
      })
    ).toEqual({ review: 'active', task: 'upcoming', complete: false })
  })

  it('marks tasks done if a tracker is already connected before a code host', () => {
    // A pre-existing Linear/Jira connection is a real, truthful task source even
    // if the user has not yet connected a code host for review.
    expect(
      deriveIntegrationStepStates({
        reviewConnected: false,
        trackerConnected: true,
        codeHostTaskConnected: false
      })
    ).toEqual({ review: 'active', task: 'done', complete: false })
  })
})

describe('deriveIntegrationConnectionStatus', () => {
  it('does not expose cached code-host readiness while preflight is unresolved', () => {
    const unresolvedFacts: Partial<StatusFacts>[] = [
      { preflightStatusLoading: true },
      { preflightStatusChecked: false },
      { preflightStatusContextKey: 'wsl:Ubuntu' }
    ]

    for (const provider of ['gh', 'glab', 'codehub']) {
      for (const overrides of unresolvedFacts) {
        expect(
          deriveIntegrationConnectionStatus(
            statusFacts({
              preflightStatus: { [provider]: { installed: true, authenticated: true } },
              ...overrides
            })
          )
        ).toMatchObject({
          reviewConnected: false,
          reviewProviderName: null,
          codeHostTaskProviderName: null,
          taskSourceNames: [],
          reviewChecking: true
        })
      }
    }
  })

  it('treats current preflight errors as settled without exposing cached auth', () => {
    expect(
      deriveIntegrationConnectionStatus(
        statusFacts({
          preflightStatus: {
            gh: { installed: true, authenticated: true },
            glab: { installed: false, authenticated: false },
            codehub: { installed: true, authenticated: true }
          },
          preflightStatusError: 'failed to check gh'
        })
      )
    ).toMatchObject({
      reviewConnected: false,
      reviewProviderName: null,
      codeHostTaskProviderName: null,
      taskSourceNames: [],
      reviewChecking: false,
      checking: false
    })
  })

  it('requires CodeHub installation and authentication regardless of WeLink auth', () => {
    for (const codehub of [
      undefined,
      { installed: false, authenticated: true },
      { installed: true, authenticated: false },
      { installed: true }
    ]) {
      const preflightStatus = {
        codehub,
        welink: { installed: true, authenticated: true }
      }
      expect(deriveIntegrationConnectionStatus(statusFacts({ preflightStatus }))).toMatchObject({
        reviewConnected: false,
        codeHostTaskProviderName: null,
        trackerConnected: false,
        taskSourceNames: [],
        checking: false
      })
    }
  })

  it('does not expose cached Linear or Jira tracker readiness while checks are stale', () => {
    const staleTrackerFacts: Partial<StatusFacts>[] = [
      {
        linearStatus: { connected: true },
        linearStatusContextKey: 'runtime:old#0'
      },
      {
        jiraStatus: { connected: true },
        jiraStatusChecked: false
      }
    ]

    for (const overrides of staleTrackerFacts) {
      expect(deriveIntegrationConnectionStatus(statusFacts(overrides))).toMatchObject({
        trackerProviderName: null,
        trackerChecking: true
      })
    }
  })

  it('keeps a current connected tracker usable when the other tracker is stale', () => {
    expect(
      deriveIntegrationConnectionStatus(
        statusFacts({
          linearStatus: { connected: true },
          jiraStatusContextKey: 'runtime:old#0'
        })
      )
    ).toMatchObject({
      trackerConnected: true,
      trackerProviderName: 'Linear',
      trackerChecking: false,
      checking: false
    })
  })

  it('does not report task-source checking when a tracker is usable but preflight is stale', () => {
    expect(
      deriveIntegrationConnectionStatus(
        statusFacts({
          preflightStatus: {
            gh: { installed: true, authenticated: true },
            glab: { installed: false, authenticated: false }
          },
          preflightStatusContextKey: 'wsl:Ubuntu',
          linearStatus: { connected: true }
        })
      )
    ).toMatchObject({
      reviewConnected: false,
      trackerConnected: true,
      trackerProviderName: 'Linear',
      checking: false
    })
  })

  it('exposes provider readiness once the relevant checks are resolved and current', () => {
    expect(
      deriveIntegrationConnectionStatus(
        statusFacts({
          preflightStatus: {
            gh: { installed: true, authenticated: true },
            glab: { installed: false, authenticated: false }
          },
          linearStatus: { connected: true }
        })
      )
    ).toMatchObject({
      reviewConnected: true,
      reviewProviderName: 'GitHub',
      codeHostTaskProviderName: 'GitHub',
      trackerConnected: true,
      trackerProviderName: 'Linear',
      // Trackers lead, but the code host stays listed so task summaries do not
      // under-report what is usable.
      taskSourceNames: ['Linear', 'GitHub'],
      checking: false
    })
  })

  it('lists every connected task source with trackers before code hosts', () => {
    expect(
      deriveIntegrationConnectionStatus(
        statusFacts({
          preflightStatus: {
            gh: { installed: true, authenticated: true },
            glab: { installed: true, authenticated: true },
            codehub: { installed: true, authenticated: true }
          },
          linearStatus: { connected: true },
          jiraStatus: { connected: true }
        })
      )
    ).toMatchObject({
      taskSourceNames: ['Linear', 'Jira', 'GitHub', 'GitLab', 'CodeHub']
    })

    expect(
      deriveIntegrationConnectionStatus(
        statusFacts({
          preflightStatus: {
            gh: { installed: true, authenticated: true },
            glab: { installed: false, authenticated: false }
          }
        })
      )
    ).toMatchObject({
      trackerProviderName: null,
      taskSourceNames: ['GitHub']
    })
  })

  it('counts token-backed review providers as review-ready without treating them as task sources', () => {
    const cases: {
      name: 'Bitbucket' | 'Azure DevOps' | 'Gitea'
      preflightStatus: StatusFacts['preflightStatus']
    }[] = [
      {
        name: 'Bitbucket',
        preflightStatus: {
          gh: { installed: false, authenticated: false },
          glab: { installed: false, authenticated: false },
          bitbucket: { configured: true, authenticated: true }
        }
      },
      {
        name: 'Azure DevOps',
        preflightStatus: {
          gh: { installed: false, authenticated: false },
          glab: { installed: false, authenticated: false },
          azureDevOps: {
            configured: true,
            authenticated: true,
            tokenConfigured: true,
            baseUrl: 'https://dev.azure.com/acme'
          }
        }
      },
      {
        name: 'Gitea',
        preflightStatus: {
          gh: { installed: false, authenticated: false },
          glab: { installed: false, authenticated: false },
          gitea: {
            configured: true,
            authenticated: true,
            tokenConfigured: true,
            baseUrl: 'https://gitea.example.test/api/v1'
          }
        }
      }
    ]

    for (const testCase of cases) {
      expect(
        deriveIntegrationConnectionStatus(
          statusFacts({
            preflightStatus: testCase.preflightStatus
          })
        )
      ).toMatchObject({
        reviewConnected: true,
        reviewProviderName: testCase.name,
        codeHostTaskProviderName: null,
        trackerConnected: false,
        trackerProviderName: null,
        checking: false
      })
    }
  })

  it('does not count failed token-backed review provider auth as review-ready', () => {
    expect(
      deriveIntegrationConnectionStatus(
        statusFacts({
          preflightStatus: {
            gh: { installed: false, authenticated: false },
            glab: { installed: false, authenticated: false },
            azureDevOps: {
              configured: true,
              authenticated: false,
              tokenConfigured: true,
              baseUrl: 'https://dev.azure.com/acme'
            },
            gitea: {
              configured: true,
              authenticated: false,
              tokenConfigured: true,
              baseUrl: 'https://gitea.example.test/api/v1'
            }
          }
        })
      )
    ).toMatchObject({
      reviewConnected: false,
      reviewProviderName: null,
      codeHostTaskProviderName: null
    })
  })
})

describe('deriveWorkbenchSetupIntegrationStatus', () => {
  it('uses current GitHub or CodeHub auth for both capabilities', () => {
    const authenticated = { installed: true, authenticated: true }
    const otherProviders = {
      preflightStatus: { glab: authenticated, welink: authenticated },
      linearStatus: { connected: true },
      jiraStatusChecked: false
    }
    expect(deriveWorkbenchSetupIntegrationStatus(statusFacts(otherProviders))).toEqual({
      trackerConnected: false,
      checking: false
    })

    for (const provider of ['gh', 'codehub']) {
      const facts = statusFacts({
        ...otherProviders,
        preflightStatus: { [provider]: authenticated }
      })
      expect(deriveWorkbenchSetupIntegrationStatus(facts)).toEqual({
        trackerConnected: true,
        checking: false
      })
      expect(
        deriveWorkbenchSetupIntegrationStatus({ ...facts, preflightStatusContextKey: 'wsl:Ubuntu' })
      ).toEqual({ trackerConnected: false, checking: true })
      expect(
        deriveWorkbenchSetupIntegrationStatus({ ...facts, preflightStatusError: 'check failed' })
      ).toEqual({ trackerConnected: false, checking: false })
    }
  })
})

describe('deriveCliProviderCardState', () => {
  it('does not show cached CLI auth as connected while preflight is stale or errored', () => {
    const connectedCli = { installed: true, authenticated: true }

    expect(
      deriveCliProviderCardState({
        cliStatus: connectedCli,
        preflightStatusAvailable: true,
        preflightStatusChecked: true,
        preflightStatusCurrent: false,
        preflightStatusError: null,
        preflightStatusLoading: false
      })
    ).toBe('checking')

    expect(
      deriveCliProviderCardState({
        cliStatus: connectedCli,
        preflightStatusAvailable: true,
        preflightStatusChecked: true,
        preflightStatusCurrent: true,
        preflightStatusError: 'failed to check gh',
        preflightStatusLoading: false
      })
    ).toBe('unavailable')
  })
})

describe('deriveIntegrationFlowState', () => {
  it('does not complete progress from the code host while tracker facts are unresolved', () => {
    const status = deriveIntegrationConnectionStatus(
      statusFacts({
        preflightStatus: {
          gh: { installed: true, authenticated: true },
          glab: { installed: false, authenticated: false }
        },
        linearStatus: { connected: true },
        linearStatusContextKey: 'runtime:old#0'
      })
    )

    expect(
      deriveIntegrationFlowState({
        reviewConnected: status.reviewConnected,
        trackerProviderName: status.trackerProviderName,
        codeHostTaskProviderName: status.codeHostTaskProviderName,
        trackerChecking: status.trackerChecking
      })
    ).toMatchObject({
      review: 'done',
      task: 'active',
      complete: false
    })
  })

  it('completes the flow from a connected code host once tracker checks settle', () => {
    for (const [provider, name] of [
      ['gh', 'GitHub'],
      ['glab', 'GitLab'],
      ['codehub', 'CodeHub']
    ] as const) {
      const status = deriveIntegrationConnectionStatus(
        statusFacts({ preflightStatus: { [provider]: { installed: true, authenticated: true } } })
      )
      expect(status).toMatchObject({
        reviewProviderName: name,
        codeHostTaskProviderName: name,
        trackerConnected: true,
        taskSourceNames: [name],
        checking: false
      })

      expect(deriveIntegrationFlowState(status)).toMatchObject({
        review: 'done',
        task: 'done',
        complete: true,
        taskResolved: true
      })
    }
  })

  it('keeps tracker-before-code-host completion scoped to the task step only', () => {
    expect(
      deriveIntegrationFlowState({
        reviewConnected: false,
        trackerProviderName: 'Jira',
        codeHostTaskProviderName: null,
        trackerChecking: false
      })
    ).toMatchObject({
      review: 'active',
      task: 'done',
      complete: false
    })
  })
})
