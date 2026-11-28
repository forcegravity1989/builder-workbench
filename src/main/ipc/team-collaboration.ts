import { BrowserWindow, app, ipcMain, session } from 'electron'
import { resolveWelinkRoute } from '../workbench/reporting/report-submission'
import {
  CSRF_COOKIE_NAME,
  ONEBOX_ENTRY_URL,
  ONEBOX_ORIGIN,
  SSO_LOGIN_MARKER,
  listTeamGroupSpaces,
  resolveTeamGroupId,
  type OneboxGroupSpaceDeps
} from '../workbench/team-collaboration/onebox-group-space-client'
import {
  readTeamDirectory,
  writeTeamDirectory,
  type TeamDirectory
} from '../workbench/team-collaboration/team-directory-client'
import { syncTeamHosts } from '../workbench/team-collaboration/team-host-sync'
import {
  loadTeamIdentity,
  rememberTeamIdentity
} from '../workbench/team-collaboration/team-identity'
import { isTrustedBrowserRenderer } from './browser/browser-renderer-trust'
import { markRuntimeEnvironmentManuallyDisconnected } from './runtime-environments/connectivity/runtime-environment-manual-disconnect'
import { invalidateRuntimeEnvironmentTransport } from './runtime-environments/runtime-environments'
import { resolveSignedInW3Partition } from './w3-account-ipc'

const NUMERIC_ID = /^\d{1,32}$/
const TEXT_ID = /^.{1,256}$/u

/** How long the hidden warm-up page may take to seed the CSRF cookie. */
const ONEBOX_WARMUP_TIMEOUT_MS = 8_000
const ONEBOX_WARMUP_POLL_INTERVAL_MS = 250
/** Bound for each OneBox API round trip; a hung response must not wedge the IPC. */
const ONEBOX_REQUEST_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('onebox request timed out')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/**
 * Why a hidden window instead of session.fetch: the OneBox entry page is an
 * SPA shell whose JS performs the SSO handshake and seeds the CSRF cookie; a
 * plain fetch never runs that JS. Hardening mirrors the W3 login window.
 */
async function warmOneboxSession(partition: string): Promise<{
  finalUrl: string
  networkError?: boolean
}> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: undefined,
      // Hidden windows throttle timers by default; the SPA handshake must run at full speed.
      backgroundThrottling: false,
      session: session.fromPartition(partition)
    }
  })
  // The warm-up is a background session bootstrap, not a browsing surface.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  try {
    // loadURL only settles on did-finish/did-fail-load; a host that accepts
    // the connection but never answers would hang it forever, so race a
    // bounded timeout and report it like any other unreachable network path.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('onebox warm-up timed out')),
        ONEBOX_WARMUP_TIMEOUT_MS
      )
      window.loadURL(ONEBOX_ENTRY_URL).then(
        () => {
          clearTimeout(timer)
          resolve()
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        }
      )
    })
    const deadline = Date.now() + ONEBOX_WARMUP_TIMEOUT_MS
    for (;;) {
      const cookies = await session
        .fromPartition(partition)
        .cookies.get({ name: CSRF_COOKIE_NAME, url: ONEBOX_ORIGIN })
      if (cookies[0]?.value) {
        break
      }
      // The SSO login bounce never seeds the cookie; bail early instead of
      // waiting out the full timeout.
      if (window.webContents.getURL().includes(SSO_LOGIN_MARKER)) {
        break
      }
      if (Date.now() >= deadline) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, ONEBOX_WARMUP_POLL_INTERVAL_MS))
    }
    return { finalUrl: window.webContents.getURL() }
  } catch {
    return { finalUrl: '', networkError: true }
  } finally {
    window.destroy()
  }
}

// Why the W3 partition: OneBox accepts the passwordless SSO the user already
// configured there, so group discovery needs no second login and no credential
// of its own. The warm-up window mirrors the login window in w3-account-ipc.ts;
// the fetch/cookie pair mirrors its service wiring.
const oneboxDeps: OneboxGroupSpaceDeps = {
  resolvePartition: resolveSignedInW3Partition,
  warmSession: warmOneboxSession,
  fetch: async (partition, url, init) => {
    try {
      // Both the request and the body read are bounded: a server that accepts
      // the connection but never finishes answering must surface as
      // `unreachable`, not as a list that never stops loading.
      const response = await withTimeout(
        session.fromPartition(partition).fetch(url, init),
        ONEBOX_REQUEST_TIMEOUT_MS
      )
      const text = await withTimeout(response.text(), ONEBOX_REQUEST_TIMEOUT_MS)
      return { status: response.status, url: response.url, text: async () => text }
    } catch {
      return { status: 0, url: '', networkError: true, text: async () => '' }
    }
  },
  readCsrfCookie: async (partition, cookieName) => {
    try {
      const cookies = await session
        .fromPartition(partition)
        .cookies.get({ name: cookieName, url: ONEBOX_ORIGIN })
      return cookies[0]?.value ?? null
    } catch {
      return null
    }
  }
}

function requireId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !NUMERIC_ID.test(value)) {
    throw new Error(`${name} must be a numeric WeLink ID.`)
  }
  return value
}

function requireText(value: unknown, name: string, maxLength = 4096): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new Error(`${name} must be a non-empty string.`)
  }
  return value
}

function requireDirectory(value: unknown): TeamDirectory {
  if (!value || typeof value !== 'object') {
    throw new Error('directory must be an object.')
  }
  const input = value as Partial<TeamDirectory>
  const teamGroupId = requireId(input.team_group_id, 'team_group_id')
  const teamSpaceId = requireId(input.team_space_id, 'team_space_id')
  if (input.schema_version !== 1 || input.identity_source !== 'welink-cli') {
    throw new Error('directory has an unsupported schema.')
  }
  if (!Array.isArray(input.hosts) || !Array.isArray(input.projects)) {
    throw new Error('directory hosts and projects must be arrays.')
  }
  const hosts = input.hosts.map((host, index) => {
    if (!host || typeof host !== 'object' || !TEXT_ID.test(host.member_id)) {
      throw new Error(`hosts[${index}].member_id is invalid.`)
    }
    return {
      member_id: host.member_id,
      ...(host.name ? { name: requireText(host.name, `hosts[${index}].name`, 256) } : {}),
      ...(host.avatar ? { avatar: requireText(host.avatar, `hosts[${index}].avatar`) } : {}),
      ...(host.member_type
        ? { member_type: requireText(host.member_type, `hosts[${index}].member_type`, 128) }
        : {}),
      ...(host.host_id
        ? { host_id: requireText(host.host_id, `hosts[${index}].host_id`, 256) }
        : {}),
      identity_source: 'welink-cli' as const,
      ...(host.orca_endpoint
        ? { orca_endpoint: requireText(host.orca_endpoint, `hosts[${index}].orca_endpoint`) }
        : {})
    }
  })
  const projects = input.projects.map((project, index) => {
    if (!project || typeof project !== 'object') {
      throw new Error(`projects[${index}] is invalid.`)
    }
    return {
      repo_id: requireText(project.repo_id, `projects[${index}].repo_id`, 512),
      ...(project.name ? { name: requireText(project.name, `projects[${index}].name`, 256) } : {}),
      ...(project.repository
        ? { repository: requireText(project.repository, `projects[${index}].repository`, 512) }
        : {})
    }
  })
  return {
    schema_version: 1,
    team_group_id: teamGroupId,
    team_space_id: teamSpaceId,
    identity_source: 'welink-cli',
    hosts,
    projects
  }
}

export function registerTeamCollaborationHandlers(): void {
  const userDataPath = app.getPath('userData')
  loadTeamIdentity(userDataPath)
  let activeBinding: { groupId: string; spaceId: string } | undefined
  ipcMain.handle(
    'teamCollaboration:readDirectory',
    async (_event, args: { groupId: string; spaceId: string; switching?: boolean }) => {
      const groupId = requireId(args?.groupId, 'groupId')
      const spaceId = requireId(args?.spaceId, 'spaceId')
      const switching = args.switching === true
      const previousBinding = activeBinding
      const result = await readTeamDirectory({
        route: await resolveWelinkRoute(),
        groupId,
        spaceId
      })
      if (activeBinding !== previousBinding) {
        throw new Error('The team binding changed while reading the directory.')
      }
      if (
        switching &&
        !result.directory.hosts.some((host) => host.member_id === result.currentMemberId)
      ) {
        throw new Error('The signed-in WeLink account could not be matched to a team member.')
      }
      // Invalidate reads started before a successful change of binding.
      if (
        switching ||
        previousBinding?.groupId !== groupId ||
        previousBinding.spaceId !== spaceId
      ) {
        activeBinding = { groupId, spaceId }
      }
      rememberTeamIdentity(userDataPath, result.directory.hosts, result.currentMemberId)
      return result
    }
  )

  ipcMain.handle(
    'teamCollaboration:syncHosts',
    async (_event, args: { groupId: string; spaceId: string }) => {
      const groupId = requireId(args?.groupId, 'groupId')
      const spaceId = requireId(args?.spaceId, 'spaceId')
      const previousBinding = activeBinding
      if (
        previousBinding &&
        (previousBinding.groupId !== groupId || previousBinding.spaceId !== spaceId)
      ) {
        return { added: 0, updated: 0 }
      }
      const { directory, currentMemberId } = await readTeamDirectory({
        route: await resolveWelinkRoute(),
        groupId,
        spaceId
      })
      if (activeBinding !== previousBinding) {
        return { added: 0, updated: 0 }
      }
      rememberTeamIdentity(userDataPath, directory.hosts, currentMemberId)
      return syncTeamHosts(directory.hosts, currentMemberId, {
        userDataPath,
        isCurrentBinding: () => activeBinding === previousBinding,
        holdDisconnected: markRuntimeEnvironmentManuallyDisconnected,
        invalidateTransport: invalidateRuntimeEnvironmentTransport
      })
    }
  )

  ipcMain.handle(
    'teamCollaboration:writeDirectory',
    async (_event, directory: TeamDirectory, baseFileId?: string | null) => {
      const safeDirectory = requireDirectory(directory)
      return writeTeamDirectory({
        route: await resolveWelinkRoute(),
        directory: safeDirectory,
        ...(typeof baseFileId === 'string' || baseFileId === null ? { baseFileId } : {})
      })
    }
  )

  // Why the trust gate: these two enumerate every group the signed-in W3
  // account can see, which is broader than the bound team the sibling handlers
  // already expose. Only the main app window may ask. A refused caller gets a
  // plain "no usable W3 session" failure rather than a partial list.
  ipcMain.handle('teamCollaboration:listGroupSpaces', async (event) => {
    if (!isTrustedBrowserRenderer(event.sender)) {
      return { ok: false, reason: 'w3-not-signed-in' } as const
    }
    return listTeamGroupSpaces(oneboxDeps)
  })

  ipcMain.handle('teamCollaboration:resolveGroupSpace', async (event, args: { spaceId: string }) => {
    if (!isTrustedBrowserRenderer(event.sender)) {
      return { ok: false, reason: 'w3-not-signed-in' } as const
    }
    // Why no requireId throw here: this handler answers with a typed result, so
    // a malformed id is reported the same way as any other unusable space.
    return resolveTeamGroupId(oneboxDeps, typeof args?.spaceId === 'string' ? args.spaceId : '')
  })
}
