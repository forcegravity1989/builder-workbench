/**
 * The pre-activation copy of shared profile state that makes rollback sound.
 *
 * `docs/design/shipping-orcad.html` §04's state-schema row asks for "backward-readable
 * migrations or a pre-activation snapshot". Only the second is available here, and not as a
 * preference: Orca's persisted state carries **no schema version**. Migrations are cohort
 * and shape heuristics that run on load and rewrite in place, and the load path rebuilds
 * `settings` and `ui` from known fields — so a newer build's nested additions are silently
 * dropped by an older one rather than rejected. There is nothing to compare and nothing that
 * fails loudly, which rules out proving backward-readability and leaves the snapshot.
 *
 * What is snapshotted is deliberately narrow. `<root>/daemon` is EXCLUDED: it holds the live
 * daemon's socket, PID record and auth token, and that daemon outlives every orcad restart
 * by design. Restoring a stale copy of it over a running daemon would break the endpoint
 * fence that keeps its terminals adoptable — turning a rollback into the exact terminal
 * massacre the daemon exists to prevent.
 */
import { shellEscape } from './ssh-connection-utils'
import { joinRemotePath, type RemoteHostPlatform } from './ssh-remote-platform'
import { assertPosixOrcadHost as assertPosixHost } from './orcad-remote-host-support'

/**
 * Root-relative paths a rollback needs restored. Everything else under the data root is
 * either regenerable, or owned by a process that survives the rollback.
 */
export const ORCAD_SNAPSHOT_MEMBERS = [
  'orca-profile-index.json',
  // Pre-profiles layout; still read as a migration source.
  'orca-data.json',
  'profiles'
] as const

/** Never captured and never restored — see the module comment. */
export const ORCAD_SNAPSHOT_EXCLUDED = ['daemon', 'logs'] as const

/**
 * The member names go into the command unquoted (see `captureOrcadStateSnapshotCommand`), so
 * they must be inert. They are compile-time constants; this catches the edit that adds one
 * with a space or a metacharacter in it.
 */
function assertPlainMemberName(member: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(member)) {
    throw new Error(`Unsafe orcad snapshot member name: ${JSON.stringify(member)}`)
  }
  return member
}

export function orcadSnapshotDirName(fullVersion: string, takenAtMs: number): string {
  // Why the version and the timestamp: two activations of one version (a re-deploy after a
  // rejected activation) must not overwrite each other's snapshot.
  return `pre-${fullVersion}-${takenAtMs}`
}

/**
 * Capture the snapshot, or report why there is nothing to capture.
 *
 * Prints `CAPTURED`, or `EMPTY` when the data root holds none of the members — a first-ever
 * deployment, where there is no state to lose and therefore no snapshot to take. `EMPTY` is
 * reported rather than fabricating an empty archive, because a rollback that "restored" an
 * empty archive would wipe a root that had filled up in between.
 */
export function captureOrcadStateSnapshotCommand(
  host: RemoteHostPlatform,
  userDataDir: string,
  snapshotDir: string
): string {
  assertPosixHost(host)
  const root = shellEscape(userDataDir)
  const dir = shellEscape(snapshotDir)
  const archive = shellEscape(joinRemotePath(host, snapshotDir, 'state.tar'))
  const memberTests = ORCAD_SNAPSHOT_MEMBERS.map(
    // Why the accumulated name is NOT quoted: `$members` is re-split by the shell before it
    // reaches tar, so a quoted name arrives as a literal `'profiles'` that tar cannot stat.
    // `assertPlainMemberName` is what makes leaving them bare safe.
    (member) =>
      `[ -e ${root}/${shellEscape(member)} ] && members="$members ${assertPlainMemberName(member)}";`
  ).join(' ')
  return [
    `members=;`,
    memberTests,
    'if [ -z "$members" ]; then echo EMPTY; else',
    `mkdir -p ${dir} && umask 077 &&`,
    // Why a temp name then mv: a deploy killed mid-tar must not leave a truncated archive
    // that a later rollback would happily restore.
    `tar -C ${root} -cf ${archive}.partial $members && mv ${archive}.partial ${archive} &&`,
    'echo CAPTURED; fi'
  ].join(' ')
}

export type OrcadSnapshotCapture = 'captured' | 'empty' | 'failed'

export function parseOrcadSnapshotCapture(output: string): OrcadSnapshotCapture {
  const value = output.trim().split('\n').pop()?.trim()
  if (value === 'CAPTURED') {
    return 'captured'
  }
  return value === 'EMPTY' ? 'empty' : 'failed'
}

export function probeOrcadStateSnapshotCommand(
  host: RemoteHostPlatform,
  snapshotDir: string
): string {
  assertPosixHost(host)
  const archive = shellEscape(joinRemotePath(host, snapshotDir, 'state.tar'))
  return `test -f ${archive} && echo PRESENT || echo ABSENT`
}

/**
 * Restore the snapshot over the data root.
 *
 * Two things make this safe to run: the members are removed before extraction (so a file the
 * new version added is gone rather than half-shadowed), and neither the removal nor the
 * extraction can reach `<root>/daemon`, because the member list never names it.
 *
 * The caller must have stopped orcad first. This does not check — it cannot, from a shell —
 * so `orcad-remote-deploy.ts` owns that ordering.
 */
export function restoreOrcadStateSnapshotCommand(
  host: RemoteHostPlatform,
  userDataDir: string,
  snapshotDir: string
): string {
  assertPosixHost(host)
  const root = shellEscape(userDataDir)
  const archive = shellEscape(joinRemotePath(host, snapshotDir, 'state.tar'))
  const removals = ORCAD_SNAPSHOT_MEMBERS.map(
    (member) => `rm -rf ${root}/${shellEscape(member)};`
  ).join(' ')
  return [
    `test -f ${archive} || { echo MISSING; exit 0; };`,
    `test -d ${root} || mkdir -p ${root};`,
    removals,
    `tar -C ${root} -xf ${archive} && echo RESTORED || echo FAILED`
  ].join(' ')
}

export type OrcadSnapshotRestore = 'restored' | 'missing' | 'failed'

export function parseOrcadSnapshotRestore(output: string): OrcadSnapshotRestore {
  const value = output.trim().split('\n').pop()?.trim()
  if (value === 'RESTORED') {
    return 'restored'
  }
  return value === 'MISSING' ? 'missing' : 'failed'
}

/**
 * Has the shared store been written since `activatedAt`?
 *
 * Prints the newest mtime (epoch seconds) across the snapshot members, or `UNKNOWN`. The
 * caller compares; an `UNKNOWN` becomes `null`, which `assessOrcadRollback` treats as "yes,
 * assume writes".
 */
export function newestStateMtimeCommand(host: RemoteHostPlatform, userDataDir: string): string {
  assertPosixHost(host)
  const root = shellEscape(userDataDir)
  const paths = ORCAD_SNAPSHOT_MEMBERS.map((member) => `${root}/${shellEscape(member)}`).join(' ')
  return [
    `newest=$(find ${paths} -type f -exec stat -c %Y {} + 2>/dev/null ||`,
    `find ${paths} -type f -exec stat -f %m {} + 2>/dev/null);`,
    'if [ -z "$newest" ]; then echo UNKNOWN; else',
    `echo "$newest" | sort -n | tail -1; fi`
  ].join(' ')
}

export function parseNewestStateMtimeSeconds(output: string): number | null {
  const value = output.trim().split('\n').pop()?.trim()
  if (!value || !/^\d+$/.test(value)) {
    return null
  }
  return Number.parseInt(value, 10)
}

import {
  currentOrcadFence,
  ORCAD_FENCE_LOST_EXIT,
  ORCAD_FENCE_LOST_MARKER,
  posixOrcadFenceGuard,
  posixOrcadFenceOwnedTest,
  type OrcadFence
} from '../managed-server/activation/orcad-activation-fence-scope'

import { quotePosixShell } from '../../shared/shell/launch/shell-argument-quoting'

import { isWindowsRemoteHost } from './ssh-remote-platform'

import type { OrcadWindowsHostStateOp } from '../managed-server/host-state/orcad-windows-host-state-ops'

import {
  ORCAD_STATE_MUTATION_BUSY,
  ORCAD_STATE_MUTATION_DEADLINE,
  ORCAD_STATE_MUTATION_FENCE_HEARTBEAT_SECONDS,
  ORCAD_STATE_MUTATION_LOCK_DIRNAME
} from '../managed-server/host-state/orcad-state-snapshot-members'

import { orcadWindowsHostOpCommand } from '../managed-server/install/orcad-remote-windows-node'

import {
  posixStateMutationGroupRecord,
  posixStateMutationPidRecord
} from '../managed-server/host-state/orcad-state-mutation-owner-record'

/** Validate bare shell member words and send each path once to stay under gateway command limits (#30491). */
function plainMemberWords(): string {
  for (const member of ORCAD_SNAPSHOT_MEMBERS) {
    if (!/^[A-Za-z0-9._-]+$/.test(member)) {
      throw new Error(`Unsafe orcad snapshot member name: ${JSON.stringify(member)}`)
    }
  }
  return ORCAD_SNAPSHOT_MEMBERS.join(' ')
}

function windowsStateCommand(
  host: RemoteHostPlatform,
  baseDir: string,
  op: OrcadWindowsHostStateOp,
  args: string[]
): string | null {
  if (!isWindowsRemoteHost(host)) {
    return null
  }
  return orcadWindowsHostOpCommand(host, baseDir, op, args)
}

/** Host deadline; client observation lasts one minute longer. */
export const ORCAD_STATE_MUTATION_DEADLINE_SECONDS = 15 * 60

/** Host serialization and deadline survive SSH channel loss, preventing overlapping restores after client timeout. */
export function serializedStateMutationCommand(
  baseDir: string,
  script: string,
  heartbeatSeconds = ORCAD_STATE_MUTATION_FENCE_HEARTBEAT_SECONDS,
  // Calls outside a held activation fence must not refresh any fence.
  owned: OrcadFence | null = currentOrcadFence()
): string {
  const lock = quotePosixShell(`${baseDir}/${ORCAD_STATE_MUTATION_LOCK_DIRNAME}`)
  const busy = `echo ${ORCAD_STATE_MUTATION_BUSY}; exit 0;`
  const staleMinutes = Math.max(1, Math.ceil((3 * heartbeatSeconds) / 60))
  const guarded = [
    `lock=${lock};`,
    `mkdir -p ${quotePosixShell(baseDir)} 2>/dev/null;`,
    'if ! mkdir "$lock" 2>/dev/null; then',
    'holder=$(cat "$lock/pid" 2>/dev/null); group=$(cat "$lock/pgid" 2>/dev/null);',
    // Exclusive PID publication makes resumed contenders back off; no PID means work never started.
    'if [ -z "$holder" ]; then',
    `[ -n "$(find "$lock" -maxdepth 0 -mmin +1 2>/dev/null)" ] || { ${busy} };`,
    // A dead shell can leave tar/rm alive; any surviving process-group member still holds the lock.
    `elif [ -n "$group" ]; then kill -0 "-$group" 2>/dev/null && { ${busy} };`,
    // Without group proof, retain live PIDs or recent heartbeats.
    `elif kill -0 "$holder" 2>/dev/null || [ -z "$(find "$lock" -maxdepth 0 -mmin +${staleMinutes} 2>/dev/null)" ]; then ${busy}`,
    'fi;',
    `rm -rf "$lock"; mkdir "$lock" 2>/dev/null || { ${busy} }; fi;`,
    posixStateMutationPidRecord('"$lock"', busy),
    // Recheck after mutation-lock acquisition because fence takeover holds that lock too.
    owned
      ? `${posixOrcadFenceOwnedTest(owned)} || { rm -rf "$lock"; echo ${ORCAD_FENCE_LOST_MARKER}; exit ${ORCAD_FENCE_LOST_EXIT}; };`
      : '',
    posixStateMutationGroupRecord('"$lock"'),
    // Refresh only the owned fence with touch -c; never recreate a released fence or keep a successor fresh.
    `beat_fence() { touch -c -m "$lock" 2>/dev/null; ${
      owned
        ? `${posixOrcadFenceOwnedTest(owned)} && touch -c -m ${quotePosixShell(owned.lockDir)} 2>/dev/null;`
        : ':;'
    } };`,
    'beat_fence;',
    `( while sleep ${heartbeatSeconds} && kill -0 $$ 2>/dev/null; do beat_fence; done ) >/dev/null 2>&1 & beat=$!;`,
    // Reap quietly because gateways can merge job notices into verdict stdout.
    `trap 'kill "$beat" 2>/dev/null; wait "$beat" 2>/dev/null; rm -rf "$lock"' EXIT;`,
    script
  ].join(' ')
  const run = `sh -c ${quotePosixShell(guarded)}`
  return [
    // Superseded holders must refuse before acquiring the mutation lock.
    ...(owned ? [posixOrcadFenceGuard(owned)] : []),
    // Own the workload process group so teardown can account for every spawned mutation process.
    'orca_state_group() { if command -v setsid >/dev/null 2>&1; then ORCA_STATE_MUTATION_GROUP=1 setsid "$@";',
    `elif command -v perl >/dev/null 2>&1; then ORCA_STATE_MUTATION_GROUP=1 perl -e ${quotePosixShell('setpgrp(0, 0); exec { $ARGV[0] } @ARGV or exit 127')} "$@";`,
    'else "$@"; fi; };',
    // Run timeout inside the group so KILL reaches tar/rm; use word lists once and retain old BusyBox -t support.
    `orca_deadline=; if timeout 1 true 2>/dev/null; then orca_deadline="timeout -s KILL ${ORCAD_STATE_MUTATION_DEADLINE_SECONDS}";`,
    `elif timeout -t 1 true 2>/dev/null; then orca_deadline="timeout -t ${ORCAD_STATE_MUTATION_DEADLINE_SECONDS} -s KILL"; fi;`,
    `orca_state_group $orca_deadline ${run};`,
    `status=$?; ${owned ? `[ "$status" -eq ${ORCAD_FENCE_LOST_EXIT} ] && exit ${ORCAD_FENCE_LOST_EXIT}; ` : ''}if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then echo ${ORCAD_STATE_MUTATION_DEADLINE}; fi`
  ].join(' ')
}

/** Scan known verdict lines because gateways can append merged stderr after completion (#30491). */
function lastVerdict(output: string, verdicts: readonly string[]): string | undefined {
  return output
    .split('\n')
    .map((line) => line.trim())
    .findLast((line) => verdicts.includes(line))
}

/** Clear candidate-written state when the original root was empty. */
export function clearOrcadStateSnapshotMembersCommand(
  host: RemoteHostPlatform,
  userDataDir: string,
  baseDir: string
): string {
  const windows = windowsStateCommand(host, baseDir, 'snapshot-clear', [userDataDir])
  if (windows) {
    return windows
  }
  return serializedStateMutationCommand(
    baseDir,
    [
      `root=${quotePosixShell(userDataDir)}; test -d "$root" || mkdir -p "$root"; ok=1;`,
      removeMembersCommand(plainMemberWords()),
      'if [ -n "$ok" ]; then echo RESTORED; else echo FAILED; fi'
    ].join(' ')
  )
}

function removeMembersCommand(members: string): string {
  return `[ -n "$ok" ] && for m in ${members}; do rm -rf "$root/$m" || { ok=; break; }; done;`
}

/** Compare only after stopping the candidate; changed state cannot be handed to an older build. */
export function compareOrcadStateSnapshotCommand(
  host: RemoteHostPlatform,
  userDataDir: string,
  snapshotDir: string,
  baseDir: string
): string {
  const windows = windowsStateCommand(host, baseDir, 'snapshot-compare', [userDataDir, snapshotDir])
  if (windows) {
    return windows
  }
  const unknown = '{ echo UNKNOWN; exit 0; };'
  return [
    `root=${quotePosixShell(userDataDir)}; dir=${quotePosixShell(snapshotDir)};`,
    `archive="$dir"/state.tar;`,
    `test -d "$root" && test -r "$root" && test -x "$root" || ${unknown}`,
    `test -f "$archive" || ${unknown}`,
    `comparison=$(mktemp -d "$dir"/compare.XXXXXX) || ${unknown}`,
    `trap 'rm -rf "$comparison"' EXIT HUP INT TERM;`,
    `tar -C "$comparison" -xf "$archive" || ${unknown}`,
    `links=$(find "$comparison" -type l -print) && [ -z "$links" ] || ${unknown}`,
    `verdict=UNCHANGED; for m in ${plainMemberWords()}; do`,
    'if [ -e "$root/$m" ] || [ -L "$root/$m" ]; then',
    `links=$(find "$root/$m" -type l -print) && [ -z "$links" ] || ${unknown}`,
    'diff -r "$root/$m" "$comparison/$m" >/dev/null 2>&1 || verdict=CHANGED;',
    'elif [ -e "$comparison/$m" ] || [ -L "$comparison/$m" ]; then verdict=CHANGED; fi; done;',
    'echo "$verdict"'
  ].join(' ')
}

export function orcadSnapshotIsUnchanged(output: string): boolean {
  return lastVerdict(output, ['UNCHANGED', 'CHANGED', 'UNKNOWN']) === 'UNCHANGED'
}
