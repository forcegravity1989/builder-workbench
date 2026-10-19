// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getExecutionHostLabel } from '../../../../shared/execution-host'
import { GitHubIntegrationCard, GitLabIntegrationCard } from './cli-source-control-integration-cards'
import { CodeHubIntegrationCard } from './bw-cli-integration-cards'

const LOCAL_HOST_LABEL = getExecutionHostLabel('local')

type StoreState = {
  settings: { activeRuntimeEnvironmentId: string | null }
  activeWorktreeId?: string | null
  openSettingsPage: () => void
  openSettingsTarget: (target: { pane: string; repoId: string | null }) => void
}

const mocks = vi.hoisted(() => ({
  store: { current: null as StoreState | null },
  preflight: {
    statuses: {
      ghStatus: 'connected',
      glabStatus: 'connected',
      bitbucketStatus: 'not-configured',
      bitbucketAccount: null,
      azureDevOpsStatus: 'not-configured',
      azureDevOpsAccount: null,
      azureDevOpsBaseUrl: null,
      giteaStatus: 'not-configured',
      giteaAccount: null,
      giteaBaseUrl: null,
      codehubStatus: 'connected',
      welinkStatus: 'connected'
    },
    unavailable: false,
    refresh: vi.fn()
  },
  cliInstall: {
    start: vi.fn(),
    isRunning: vi.fn(),
    onFinished: vi.fn()
  }
}))

// Why (BW #323): install is an app-run background command — the cards call
// window.api.cliInstall, and happy-dom has no preload, so stub the surface
// once for every case in this file.
;(window as { api?: unknown }).api = {
  cliInstall: {
    start: mocks.cliInstall.start,
    isRunning: mocks.cliInstall.isRunning,
    onFinished: mocks.cliInstall.onFinished
  }
}
mocks.cliInstall.start.mockResolvedValue({ started: true })
mocks.cliInstall.isRunning.mockResolvedValue(false)
mocks.cliInstall.onFinished.mockReturnValue(() => {})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: StoreState) => unknown) => {
    if (!mocks.store.current) {
      throw new Error('Store state was not installed')
    }
    return selector(mocks.store.current)
  }
}))

vi.mock('./source-control-preflight-card-status', () => ({
  usePreflightCardStatuses: () => mocks.preflight
}))

// Why (BW #323): login renders the upstream inline terminal inside the card
// (user decision 2026-10-19); stub it like AgentSkillSetupPanel.test does so
// the card cases do not drag the TerminalPane/xterm chain into happy-dom.
vi.mock('../onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: (props: { command: string }) => (
    <div data-testid="inline-login-terminal" data-command={props.command} />
  )
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderCard(card: React.ReactNode): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(card)
  })
  return container
}

describe('CLI source-control integration card account scope', () => {
  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }
    root = null
    container?.remove()
    container = null
    mocks.store.current = null
    mocks.preflight.statuses.ghStatus = 'connected'
    mocks.preflight.statuses.glabStatus = 'connected'
    mocks.preflight.statuses.codehubStatus = 'connected'
    mocks.preflight.statuses.welinkStatus = 'connected'
    mocks.preflight.unavailable = false
    mocks.preflight.refresh.mockClear()
    mocks.cliInstall.start.mockClear()
    mocks.cliInstall.isRunning.mockClear()
    mocks.cliInstall.onFinished.mockClear()
  })

  it('shows local-client ownership for connected GitHub CLI credentials', async () => {
    const openSettingsPage = vi.fn()
    const openSettingsTarget = vi.fn()
    mocks.store.current = {
      settings: { activeRuntimeEnvironmentId: null },
      openSettingsPage,
      openSettingsTarget
    }

    const rendered = await renderCard(<GitHubIntegrationCard />)

    expect(rendered.textContent).toContain('GitHub')
    expect(rendered.textContent).toContain('Connected')
    expect(rendered.textContent).toContain(`Account scope: ${LOCAL_HOST_LABEL}`)
    expect(rendered.textContent).toContain(
      'Credentials and account checks for this provider are owned by this desktop client. Use Settings > Remote Orca Servers > Advanced to edit server-owned credentials.'
    )
    // Why (BW #323): the Open Remote Servers shortcut was dropped from the
    // integration cards (user decision 2026-10-16); the scope label stays.
    expect(rendered.textContent).not.toContain('Open Remote Servers')
  })

  it('shows remote-server ownership for GitLab CLI credential checks', async () => {
    mocks.store.current = {
      settings: { activeRuntimeEnvironmentId: 'runtime-1' },
      openSettingsPage: vi.fn(),
      openSettingsTarget: vi.fn()
    }
    mocks.preflight.statuses.glabStatus = 'not-authenticated'

    const rendered = await renderCard(<GitLabIntegrationCard />)

    expect(rendered.textContent).toContain('GitLab')
    expect(rendered.textContent).toContain('Account scope: Remote server: runtime-1')
    expect(rendered.textContent).toContain(
      'Credentials and account checks for this provider are owned by this remote server. Use Settings > Remote Orca Servers > Advanced to edit another default runtime scope.'
    )
    expect(rendered.textContent).toContain('glab auth login')
  })

  it('shows codehub-cli as connected without an auth action', async () => {
    mocks.store.current = {
      settings: { activeRuntimeEnvironmentId: null },
      openSettingsPage: vi.fn(),
      openSettingsTarget: vi.fn()
    }

    const rendered = await renderCard(<CodeHubIntegrationCard />)

    expect(rendered.textContent).toContain('CodeHub')
    expect(rendered.textContent).toContain('Connected')
    expect(rendered.textContent).toContain('codehub-cli')
    expect(rendered.textContent).toContain(`Account scope: ${LOCAL_HOST_LABEL}`)
    expect(rendered.textContent).not.toContain('auth login')
  })

  it('shows codehub-cli as missing from PATH and re-checks on demand', async () => {
    mocks.store.current = {
      settings: { activeRuntimeEnvironmentId: null },
      activeWorktreeId: 'worktree-1',
      openSettingsPage: vi.fn(),
      openSettingsTarget: vi.fn()
    }
    mocks.preflight.statuses.codehubStatus = 'not-installed'

    const rendered = await renderCard(<CodeHubIntegrationCard />)

    expect(rendered.textContent).toContain('Not installed')
    expect(rendered.textContent).toContain('codehub-cli is not on PATH.')
    // Why (BW #323): the install command is user-confirmed (2026-10-16); the
    // card shows the exact self-contained command the button injects.
    expect(rendered.textContent).toContain(
      'npm install -g @codehub/codehub-cli --registry=https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/ --strict-ssl=false'
    )
    expect(rendered.textContent).toContain('Install CodeHub CLI')
    expect(rendered.textContent).not.toContain('pending internal confirmation')
    expect(rendered.textContent).not.toContain('Log in')
    // Why (BW #323): install runs as an app-owned background command (user
    // decision 2026-10-16) — clicking starts the runner and flips the card to
    // "Installing…" instead of opening a terminal session.
    await act(async () => {
      Array.from(rendered.querySelectorAll('button'))
        .find((button) => button.textContent === 'Install CodeHub CLI')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(mocks.cliInstall.start).toHaveBeenCalledWith({ cli: 'codehub' })
    expect(rendered.textContent).toContain('Installing…')
    expect(rendered.textContent).toContain('Installing in the background')
    await act(async () => {
      Array.from(rendered.querySelectorAll('button'))
        .find((button) => button.textContent === 'Re-check')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(mocks.preflight.refresh).toHaveBeenCalledTimes(1)
  })
})
