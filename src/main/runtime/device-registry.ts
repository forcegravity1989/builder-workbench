// Why: per-device tokens replace the shared runtime auth token for WebSocket
// (mobile) connections. Each paired device gets its own revocable token so
// compromising one device doesn't expose others. The registry is a simple
// JSON file with hardened permissions matching the runtime metadata pattern.
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  hardenExistingSecureFile,
  isUnreadableError,
  writeSecureJsonFile
} from '../../shared/secure-file'
import type { DeviceScope, RuntimeAccessMode, RuntimeTeamBinding } from '../../shared/runtime-types'
import { DEVICE_REGISTRY_FILENAME } from './mobile-pairing-files'
import type { RelayDeviceBinding } from './relay/relay-revoke-outbox'
import type { RemoteRuntimeCallerIdentity } from '../../shared/remote-runtime-caller-identity'
import type { MobilePairingConnectionMode } from '../../shared/mobile-pairing-connection-mode'
import type { RuntimePairingReach } from '../../shared/runtime-pairing-reach'
import {
  parseMobilePushRegistration,
  type MobilePushRegistration
} from '../../shared/mobile-push-contract'

export type { DeviceScope }

export type DeviceEntry = {
  deviceId: string
  name: string
  avatar?: string
  token: string
  scope: DeviceScope
  pairedAt: number
  lastSeenAt: number
  relayBinding?: RelayDeviceBinding
  mobilePairingConnectionMode?: MobilePairingConnectionMode
  // Why: STA-2370 — a grant minted for "This computer only" proves nothing about off-host reach when its
  // client connects, so the bind decision must be able to tell it apart from a LAN/phone grant.
  pairingReach?: RuntimePairingReach
  accessMode?: RuntimeAccessMode
  teamBinding?: RuntimeTeamBinding
  // Why: a team link is one credential shared by every member, so each member who connects through it
  // gets their own record under the link. The record carries the member's name and full-access
  // grant, and its random token is never handed out; members authenticate with the link's token.
  parentDeviceId?: string
  // Why: the address the owner advertised when the link was created, so the link can be copied again
  // later from the shared list. Absent on links created before this was recorded.
  pairingEndpoint?: string
  // Why: survives a desktop restart so the host can keep pushing without the phone
  // re-registering. Absent on every registry written before background push existed.
  pushRegistration?: MobilePushRegistration
}

/** Runtime links are read-only by default; full access is an explicit host-owner upgrade. */
export function effectiveRuntimeAccessMode(
  device: Pick<DeviceEntry, 'scope' | 'accessMode'>
): RuntimeAccessMode {
  if (device.scope !== 'runtime') {
    return 'full'
  }
  return device.accessMode ?? 'team-read'
}

function validRelayBinding(value: unknown, deviceId: string): RelayDeviceBinding | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const binding = value as Partial<RelayDeviceBinding>
  return binding.relayDeviceId === deviceId &&
    typeof binding.relayHostId === 'string' &&
    typeof binding.ownerIdentityKey === 'string'
    ? {
        relayHostId: binding.relayHostId,
        relayDeviceId: binding.relayDeviceId,
        ownerIdentityKey: binding.ownerIdentityKey,
        ...(typeof binding.inviteExpiresAt === 'number' && Number.isFinite(binding.inviteExpiresAt)
          ? { inviteExpiresAt: binding.inviteExpiresAt }
          : {})
      }
    : undefined
}

// Why: a lastSeen refresh is pure bookkeeping, so coalesce reconnect bursts into one write instead of
// paying a secure-file rewrite (two synchronous PowerShell ACL spawns on Windows) per connection.
const LAST_SEEN_FLUSH_DELAY_MS = 250
// A team has dozens of members; the cap only stops one leaked link from filling the registry.
const MAX_MEMBER_DEVICES_PER_LINK = 200

export class DeviceRegistry {
  private readonly registryPath: string
  private devices: DeviceEntry[] = []
  /** Set when the registry exists but could not be read, which makes `devices` a lie to save from. */
  private registryUnreadable = false
  private pendingLastSeenFlush: NodeJS.Timeout | null = null

  constructor(userDataPath: string) {
    this.registryPath = join(userDataPath, DEVICE_REGISTRY_FILENAME)
    this.load()
  }

  addDevice(
    name: string,
    scope: DeviceScope = 'mobile',
    pairingReach: RuntimePairingReach = 'network',
    accessMode: RuntimeAccessMode = 'full',
    teamBinding?: RuntimeTeamBinding,
    avatar?: string
  ): DeviceEntry {
    return this.createAndPersistDevice(
      this.devices,
      name,
      scope,
      pairingReach,
      accessMode,
      teamBinding,
      avatar
    )
  }

  private createAndPersistDevice(
    existingDevices: DeviceEntry[],
    name: string,
    scope: DeviceScope,
    pairingReach: RuntimePairingReach,
    accessMode: RuntimeAccessMode,
    teamBinding?: RuntimeTeamBinding,
    avatar?: string
  ): DeviceEntry {
    const entry: DeviceEntry = {
      deviceId: randomUUID(),
      name,
      ...(avatar ? { avatar } : {}),
      token: randomBytes(24).toString('hex'),
      scope,
      pairedAt: Date.now(),
      lastSeenAt: 0,
      pairingReach,
      ...(scope === 'runtime'
        ? { accessMode, ...(teamBinding ? { teamBinding } : {}) }
        : accessMode === 'team-read'
          ? { accessMode, ...(teamBinding ? { teamBinding } : {}) }
          : {})
    }
    const nextDevices = [...existingDevices, entry]
    // Why: a credential is not valid until its durable registry write succeeds.
    this.save(nextDevices)
    this.devices = nextDevices
    return entry
  }

  // Why: coalesce repeated QR-regenerate clicks onto a single pending token.
  // Each call to addDevice() produces a valid auth credential; without
  // coalescing, every renderer call to mobile:getPairingQR (e.g. the new
  // copy-button flow that encourages regeneration) leaves an orphaned token
  // forever. Returns an existing never-scanned entry if present; otherwise
  // mints a new one and drops any stale pending entries.
  getOrCreatePendingDevice(
    name: string,
    scope: DeviceScope = 'mobile',
    pairingReach: RuntimePairingReach = 'network',
    accessMode?: RuntimeAccessMode,
    teamBinding?: RuntimeTeamBinding,
    avatar?: string
  ): DeviceEntry {
    const existing = this.devices.find(
      (d) =>
        d.lastSeenAt === 0 &&
        d.scope === scope &&
        effectiveRuntimeAccessMode(d) ===
          (accessMode ?? (scope === 'runtime' ? 'team-read' : 'full')) &&
        ((accessMode ?? (scope === 'runtime' ? 'team-read' : 'full')) !== 'team-read' ||
          (d.teamBinding?.teamGroupId === teamBinding?.teamGroupId &&
            d.teamBinding?.memberId === teamBinding?.memberId))
    )
    if (existing) {
      const hasMetadataChange =
        existing.name !== name || (avatar !== undefined && existing.avatar !== avatar)
      const refreshed = hasMetadataChange
        ? (() => {
            const updated: DeviceEntry = {
              ...existing,
              name,
              ...(avatar !== undefined ? { avatar } : {})
            }
            const nextDevices = this.devices.map((device) =>
              device.deviceId === existing.deviceId ? updated : device
            )
            this.save(nextDevices)
            this.devices = nextDevices
            return updated
          })()
        : existing
      // Why: the same pending token can be re-advertised at a broader reach; widen it but never narrow it,
      // or a link already handed out for off-host use would stop being served after the next launch.
      return pairingReach === 'network' && refreshed.pairingReach === 'this-computer'
        ? this.setPairingReach(refreshed, 'network')
        : refreshed
    }
    return this.addDevice(
      name,
      scope,
      pairingReach,
      accessMode ?? (scope === 'runtime' ? 'team-read' : 'full'),
      teamBinding,
      avatar
    )
  }

  private setPairingReach(existing: DeviceEntry, pairingReach: RuntimePairingReach): DeviceEntry {
    const updated: DeviceEntry = { ...existing, pairingReach }
    const nextDevices = this.devices.map((device) =>
      device.deviceId === existing.deviceId ? updated : device
    )
    // Why: persist before the memory swap so a failed write cannot leave the bind decision reading a
    // reach that never reached disk.
    this.save(nextDevices)
    this.devices = nextDevices
    return updated
  }

  // Why: explicit rotation path for "Regenerate QR" — invalidates any
  // existing never-scanned token (e.g. one that was screenshotted, copied
  // to clipboard, or shown on a screen-share) and mints a fresh one. Without
  // this, getOrCreatePendingDevice keeps returning the same token forever
  // until a phone actually pairs, so users have no way to revoke a leaked
  // pre-pairing token.
  rotatePendingDevice(
    name: string,
    scope: DeviceScope = 'mobile',
    pairingReach: RuntimePairingReach = 'network',
    accessMode?: RuntimeAccessMode,
    teamBinding?: RuntimeTeamBinding,
    avatar?: string
  ): DeviceEntry {
    const retainedDevices = this.devices.filter(
      (d) =>
        d.lastSeenAt !== 0 ||
        d.scope !== scope ||
        effectiveRuntimeAccessMode(d) !==
          (accessMode ?? (scope === 'runtime' ? 'team-read' : 'full')) ||
        ((accessMode ?? (scope === 'runtime' ? 'team-read' : 'full')) === 'team-read' &&
          (d.teamBinding?.teamGroupId !== teamBinding?.teamGroupId ||
            d.teamBinding?.memberId !== teamBinding?.memberId))
    )
    return this.createAndPersistDevice(
      retainedDevices,
      name,
      scope,
      pairingReach,
      accessMode ?? (scope === 'runtime' ? 'team-read' : 'full'),
      teamBinding,
      avatar
    )
  }

  removeDevice(deviceId: string): boolean {
    const nextDevices = this.devices.filter((d) => d.deviceId !== deviceId)
    if (nextDevices.length === this.devices.length) {
      return false
    }
    // Why: persist before memory swap so a failed write does not drop a device
    // only in-process while disk still lists it (and vice versa on reload).
    this.save(nextDevices)
    this.devices = nextDevices
    return true
  }

  getDevice(deviceId: string): DeviceEntry | null {
    return this.devices.find((d) => d.deviceId === deviceId) ?? null
  }

  getAccessMode(deviceId: string): RuntimeAccessMode | null {
    const device = this.getDevice(deviceId)
    return device ? effectiveRuntimeAccessMode(device) : null
  }

  setAccessMode(
    deviceId: string,
    accessMode: RuntimeAccessMode,
    teamBinding?: RuntimeTeamBinding
  ): boolean {
    const index = this.devices.findIndex((candidate) => candidate.deviceId === deviceId)
    if (index === -1) {
      return false
    }
    const next = this.devices.map((device, candidateIndex) => {
      if (candidateIndex !== index) {
        return device
      }
      if (accessMode === 'full') {
        return device.scope === 'runtime' ? { ...device, accessMode: 'full' as const } : device
      }
      return { ...device, accessMode, teamBinding }
    })
    this.save(next)
    this.devices = next
    return true
  }

  /**
   * Returns the per-member record for a member connecting through a shared team link, creating it on
   * first contact. Links that are not read-only team links resolve to themselves, and so does any
   * connection whose record cannot be created (limit reached or registry not writable), which keeps
   * it read-only under the link rather than failing the handshake.
   */
  resolveMemberDevice(parent: DeviceEntry, identity: RemoteRuntimeCallerIdentity): DeviceEntry {
    try {
      return this.findOrCreateMemberDevice(parent, identity)
    } catch {
      return parent
    }
  }

  setPairingEndpoint(deviceId: string, pairingEndpoint: string): boolean {
    if (!this.devices.some((device) => device.deviceId === deviceId)) {
      return false
    }
    const nextDevices = this.devices.map((device) =>
      device.deviceId === deviceId ? { ...device, pairingEndpoint } : device
    )
    this.save(nextDevices)
    this.devices = nextDevices
    return true
  }

  /** Removes every member record created under a shared link with one registry write. */
  removeMemberDevices(parentDeviceId: string): DeviceEntry[] {
    const removed = this.devices.filter((device) => device.parentDeviceId === parentDeviceId)
    if (removed.length === 0) {
      return []
    }
    const nextDevices = this.devices.filter((device) => device.parentDeviceId !== parentDeviceId)
    this.save(nextDevices)
    this.devices = nextDevices
    return removed
  }

  private findOrCreateMemberDevice(
    parent: DeviceEntry,
    identity: RemoteRuntimeCallerIdentity
  ): DeviceEntry {
    if (
      parent.scope !== 'runtime' ||
      parent.parentDeviceId !== undefined ||
      !parent.teamBinding ||
      effectiveRuntimeAccessMode(parent) !== 'team-read'
    ) {
      return parent
    }
    const teamGroupId = parent.teamBinding.teamGroupId
    const memberKey = identity.memberId.toLowerCase()
    const existing = this.devices.find(
      (device) =>
        device.parentDeviceId !== undefined &&
        device.teamBinding?.teamGroupId === teamGroupId &&
        device.teamBinding.memberId.toLowerCase() === memberKey
    )
    if (existing) {
      if (
        existing.name === identity.name &&
        existing.parentDeviceId === parent.deviceId &&
        (identity.avatar === undefined || existing.avatar === identity.avatar)
      ) {
        return existing
      }
      const updated: DeviceEntry = {
        ...existing,
        name: identity.name,
        parentDeviceId: parent.deviceId,
        ...(identity.avatar ? { avatar: identity.avatar } : {})
      }
      const nextDevices = this.devices.map((device) =>
        device.deviceId === existing.deviceId ? updated : device
      )
      this.save(nextDevices)
      this.devices = nextDevices
      return updated
    }
    const linkMemberCount = this.devices.filter(
      (device) => device.parentDeviceId === parent.deviceId
    ).length
    if (linkMemberCount >= MAX_MEMBER_DEVICES_PER_LINK) {
      return parent
    }
    const entry: DeviceEntry = {
      deviceId: randomUUID(),
      name: identity.name,
      ...(identity.avatar ? { avatar: identity.avatar } : {}),
      token: randomBytes(24).toString('hex'),
      scope: 'runtime',
      pairedAt: Date.now(),
      lastSeenAt: Date.now(),
      pairingReach: parent.pairingReach ?? 'network',
      accessMode: 'team-read',
      teamBinding: { teamGroupId, memberId: identity.memberId },
      parentDeviceId: parent.deviceId
    }
    const nextDevices = [...this.devices, entry]
    this.save(nextDevices)
    this.devices = nextDevices
    return entry
  }

  getPendingDevice(scope: DeviceScope = 'mobile'): DeviceEntry | null {
    return this.devices.find((device) => device.lastSeenAt === 0 && device.scope === scope) ?? null
  }

  setRelayBinding(deviceId: string, binding: RelayDeviceBinding): boolean {
    const index = this.devices.findIndex((candidate) => candidate.deviceId === deviceId)
    if (index === -1 || binding.relayDeviceId !== deviceId) {
      return false
    }
    const nextDevices = this.devices.map((device, candidateIndex) =>
      candidateIndex === index ? { ...device, relayBinding: binding } : device
    )
    this.save(nextDevices)
    this.devices = nextDevices
    return true
  }

  /** Passing null clears the registration (unregister, or a token the gateway reported dead). */
  setPushRegistration(deviceId: string, registration: MobilePushRegistration | null): boolean {
    const index = this.devices.findIndex((candidate) => candidate.deviceId === deviceId)
    if (index === -1 || this.devices[index]?.scope !== 'mobile') {
      return false
    }
    const nextDevices = this.devices.map((device, candidateIndex) => {
      if (candidateIndex !== index) {
        return device
      }
      const { pushRegistration: _dropped, ...rest } = device
      return registration ? { ...rest, pushRegistration: registration } : rest
    })
    // Why: persist before the memory swap so a failed write cannot leave the dispatcher
    // pushing to a registration disk says is gone (or vice versa on reload).
    this.save(nextDevices)
    this.devices = nextDevices
    return true
  }

  setMobilePairingConnectionMode(deviceId: string, mode: MobilePairingConnectionMode): boolean {
    const index = this.devices.findIndex((candidate) => candidate.deviceId === deviceId)
    if (index === -1 || this.devices[index]?.scope !== 'mobile') {
      return false
    }
    // Why: persist before swapping memory so a failed write does not leave a
    // mode the UI/runtime believe was stored.
    const nextDevices = this.devices.map((device, candidateIndex) =>
      candidateIndex === index ? { ...device, mobilePairingConnectionMode: mode } : device
    )
    this.save(nextDevices)
    this.devices = nextDevices
    return true
  }

  getMobilePairingConnectionMode(deviceId: string): MobilePairingConnectionMode | null {
    const device = this.devices.find((candidate) => candidate.deviceId === deviceId)
    if (!device || device.scope !== 'mobile') {
      return null
    }
    // Why: pairings created before this preference existed used automatic
    // direct-first Relay fallback, so missing state must preserve that behavior.
    return device.mobilePairingConnectionMode === 'local-only' ? 'local-only' : 'automatic'
  }

  listDevices(): readonly DeviceEntry[] {
    return this.devices
  }

  validateToken(token: string): DeviceEntry | null {
    return this.devices.find((d) => d.token === token) ?? null
  }

  updateLastSeen(deviceId: string): void {
    const index = this.devices.findIndex((d) => d.deviceId === deviceId)
    if (index === -1) {
      return
    }
    // Why: persist before memory swap so a failed write cannot leave a scanned
    // device looking never-scanned on disk, where rotation would drop it.
    const seenAt = Date.now()
    const nextDevices = this.devices.map((device, candidateIndex) =>
      candidateIndex === index ? { ...device, lastSeenAt: seenAt } : device
    )
    this.save(nextDevices)
    this.devices = nextDevices
    this.cancelPendingLastSeenFlush()
  }

  /**
   * Marks a device seen without blocking the caller on disk — the E2EE auth handshake runs this, and on
   * Windows every save spawns PowerShell synchronously to reapply the registry's ACL.
   * The first-ever sighting still persists inline: rotatePendingDevice drops entries that disk says were
   * never scanned, so only that 0 -> non-zero transition is load-bearing.
   */
  updateLastSeenDeferred(deviceId: string): void {
    const index = this.devices.findIndex((d) => d.deviceId === deviceId)
    if (index === -1) {
      return
    }
    if (this.devices[index]!.lastSeenAt === 0) {
      this.updateLastSeen(deviceId)
      return
    }
    const seenAt = Date.now()
    this.devices = this.devices.map((device, candidateIndex) =>
      candidateIndex === index ? { ...device, lastSeenAt: seenAt } : device
    )
    if (this.pendingLastSeenFlush) {
      return
    }
    this.pendingLastSeenFlush = setTimeout(
      () => this.flushPendingLastSeen(),
      LAST_SEEN_FLUSH_DELAY_MS
    )
    // Why: bookkeeping must never hold the process open.
    this.pendingLastSeenFlush.unref?.()
  }

  /** Persists a deferred lastSeen refresh now; no-op when nothing is pending. */
  flushPendingLastSeen(): void {
    if (!this.pendingLastSeenFlush) {
      return
    }
    this.cancelPendingLastSeenFlush()
    try {
      this.save(this.devices)
    } catch (error) {
      // Why: matches the async hardening path — a failed bookkeeping write must not take down the runtime.
      console.error('[mobile] Failed to persist device lastSeen:', error)
    }
  }

  private cancelPendingLastSeenFlush(): void {
    if (this.pendingLastSeenFlush) {
      clearTimeout(this.pendingLastSeenFlush)
      this.pendingLastSeenFlush = null
    }
  }

  private load(): void {
    if (!existsSync(this.registryPath)) {
      this.devices = []
      return
    }
    try {
      hardenExistingSecureFile(this.registryPath)
      const parsed = JSON.parse(readFileSync(this.registryPath, 'utf-8')) as DeviceEntry[]
      this.devices = parsed.map((device) => ({
        ...device,
        // Why: older registries only existed for phone pairing. Treat missing
        // scope as mobile so legacy device tokens do not gain new CLI powers.
        scope: device.scope === 'runtime' ? 'runtime' : 'mobile',
        relayBinding: validRelayBinding(device.relayBinding, device.deviceId),
        mobilePairingConnectionMode:
          device.mobilePairingConnectionMode === 'local-only' ? 'local-only' : 'automatic',
        // Why: registries written before this field existed only ever held network-reach grants (phones and
        // LAN links), so a missing value must keep binding every interface on reconnect.
        pairingReach: device.pairingReach === 'this-computer' ? 'this-computer' : 'network',
        ...(device.accessMode === 'team-read' || device.accessMode === 'full'
          ? {
              accessMode: device.accessMode,
              ...(device.teamBinding ? { teamBinding: device.teamBinding } : {})
            }
          : {}),
        ...(typeof device.parentDeviceId === 'string'
          ? { parentDeviceId: device.parentDeviceId }
          : {}),
        // Why: a malformed row must degrade to "no background push", never fail the load
        // and strand every paired device.
        pushRegistration: parseMobilePushRegistration(device.pushRegistration)
      }))
      this.registryUnreadable = false
    } catch (error) {
      // "Cannot read" is not "is empty". Saving an empty list over a registry we were merely
      // denied would erase every paired device's bearer token, and the write would succeed.
      this.registryUnreadable = isUnreadableError(error)
      this.devices = []
    }
  }

  private save(devices: DeviceEntry[]): void {
    if (this.registryUnreadable) {
      throw new Error(
        `Cannot read the device registry at ${this.registryPath}: the read failed. Refusing to overwrite it, which would revoke every paired device.`
      )
    }
    writeSecureJsonFile(this.registryPath, devices)
    // Why: every registry save includes the latest in-memory timestamps, so a later timer would rewrite it.
    this.cancelPendingLastSeenFlush()
  }
}
