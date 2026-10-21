// Why (BW #323): auth readbacks for the BW-only CLIs (codehub-cli, welink-cli,
// cloudbuild's cb). Kept in a BW file so the upstream Orca agent-detection
// module stays within its line budget; its probe orchestration imports these
// next to the gh/glab readbacks.
import {
  execCommandInWslOrThrow,
  execLocalPreflightCommandOrThrow,
  shellQuote
} from '../ipc/preflight-command-exec'
import type { WslPreflightTarget } from '../ipc/preflight-wsl-agent-detection'

export type BwCliProbe = { installed: boolean; wslTarget?: WslPreflightTarget }

// Why (BW #366): the BW CLI probe/auth orchestration lives here so the upstream
// agent-detection module stays within its line budget. The detect callback is
// injected (agent-detection's detectCommandRuntime) to avoid a circular import;
// cb probes with its `version` subcommand because `--version` is an unknown
// flag. Call order (codehub, welink, cb) matches the execFile mock chains in
// preflight-host-cli-status.test.ts — keep both in sync.
export async function probeBwClis(
  detect: (command: string, versionArgs?: string[]) => Promise<BwCliProbe>
): Promise<{ codehub: BwCliProbe; welink: BwCliProbe; cloudbuild: BwCliProbe }> {
  const [codehub, welink, cloudbuild] = await Promise.all([
    detect('codehub-cli'),
    detect('welink-cli'),
    detect('cb', ['version'])
  ])
  return { codehub, welink, cloudbuild }
}

// Why: auth only when the probe found the binary — mirrors the gh/glab
// conditional readbacks in agent-detection.
export async function readBwCliAuths(probes: {
  codehub: BwCliProbe
  welink: BwCliProbe
  cloudbuild: BwCliProbe
}): Promise<{ codehub: boolean; welink: boolean; cloudbuild: boolean }> {
  const [codehub, welink, cloudbuild] = await Promise.all([
    probes.codehub.installed
      ? isCodehubAuthenticated(probes.codehub.wslTarget)
      : Promise.resolve(false),
    probes.welink.installed
      ? isWelinkAuthenticated(probes.welink.wslTarget)
      : Promise.resolve(false),
    probes.cloudbuild.installed
      ? isCloudbuildAuthenticated(probes.cloudbuild.wslTarget)
      : Promise.resolve(false)
  ])
  return { codehub, welink, cloudbuild }
}

// Why (BW #323): neither CLI carries the login verdict in its exit code —
// real-shell finding 2026-10-16: `auth status` exits 0 even when logged out
// (codehub prints "You are not logged in.", welink prints "Status: not
// authenticated"), so exit-0-implies-authenticated would light a false green.
// The verdict is parsed from output markers in every branch.
export async function isCodehubAuthenticated(wslTarget?: WslPreflightTarget): Promise<boolean> {
  try {
    const result = await (wslTarget
      ? execCommandInWslOrThrow(wslTarget, `${shellQuote('codehub-cli')} auth status`)
      : execLocalPreflightCommandOrThrow('codehub-cli', ['auth', 'status']))
    return codehubOutputSaysLoggedIn(`${result.stdout}\n${result.stderr}`)
  } catch (error) {
    return codehubOutputSaysLoggedIn(errorOutput(error))
  }
}

// Why (BW #323): logged in, codehub-cli prints a host table whose LOGIN column
// reads `yes`; logged out it prints a hint message carrying neither marker.
function codehubOutputSaysLoggedIn(output: string): boolean {
  return output.includes('LOGIN') && output.includes('yes')
}

// Why (BW #323): welink-cli auth status exits 0 in every state. A live token
// prints a `User Token` credentials line; an EXPIRED token prints the same
// line with EXPIRED (human decision on intent 待决 3, 2026-10-16: counts as
// not authenticated — no green light on a stale token); never logged in
// prints `Status: not authenticated` with no User Token line at all.
export async function isWelinkAuthenticated(wslTarget?: WslPreflightTarget): Promise<boolean> {
  try {
    const result = await (wslTarget
      ? execCommandInWslOrThrow(wslTarget, `${shellQuote('welink-cli')} auth status`)
      : execLocalPreflightCommandOrThrow('welink-cli', ['auth', 'status']))
    return welinkOutputSaysAuthenticated(`${result.stdout}\n${result.stderr}`)
  } catch (error) {
    return welinkOutputSaysAuthenticated(errorOutput(error))
  }
}

function welinkOutputSaysAuthenticated(output: string): boolean {
  return (
    output.includes('User Token') &&
    !output.includes('EXPIRED') &&
    !output.includes('not authenticated')
  )
}

// Why (BW #366): cb auth status exits 0 in every state (same trap as
// codehub/welink — real-shell 2026-10-19: an expired token still exits 0 and
// prints `Token Expires: … (expired)`), so the verdict comes from output
// markers: only a Token Expires line WITHOUT the (expired) suffix is a live
// login. Never-logged-in output carries no Token Expires line at all.
export async function isCloudbuildAuthenticated(wslTarget?: WslPreflightTarget): Promise<boolean> {
  try {
    const result = await (wslTarget
      ? execCommandInWslOrThrow(wslTarget, `${shellQuote('cb')} auth status`)
      : execLocalPreflightCommandOrThrow('cb', ['auth', 'status']))
    return cloudbuildOutputSaysAuthenticated(`${result.stdout}\n${result.stderr}`)
  } catch (error) {
    return cloudbuildOutputSaysAuthenticated(errorOutput(error))
  }
}

function cloudbuildOutputSaysAuthenticated(output: string): boolean {
  return output.includes('Token Expires') && !output.includes('(expired)')
}

function errorOutput(error: unknown): string {
  const stdout = (error as { stdout?: string }).stdout ?? ''
  const stderr = (error as { stderr?: string }).stderr ?? ''
  return `${stdout}\n${stderr}`
}
