// Why (BW #323): auth readbacks for the BW-only CLIs (codehub-cli, welink-cli).
// Kept in a BW file so the upstream Orca agent-detection module stays within
// its line budget; its probe orchestration imports these next to the gh/glab
// readbacks and follows the same exit-0-plus-marker-fallback shape.
import {
  execCommandInWslOrThrow,
  execLocalPreflightCommandOrThrow,
  shellQuote
} from '../ipc/preflight-command-exec'
import type { WslPreflightTarget } from '../ipc/preflight-wsl-agent-detection'

// Why (BW #323): parallel to isGhAuthenticated for codehub-cli. Its auth
// status prints a host table whose LOGIN column reads `yes` when logged in;
// keep a marker fallback for partial output on a thrown error, like gh.
export async function isCodehubAuthenticated(wslTarget?: WslPreflightTarget): Promise<boolean> {
  try {
    await (wslTarget
      ? execCommandInWslOrThrow(wslTarget, `${shellQuote('codehub-cli')} auth status`)
      : execLocalPreflightCommandOrThrow('codehub-cli', ['auth', 'status']))
    return true
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? ''
    const stderr = (error as { stderr?: string }).stderr ?? ''
    const output = `${stdout}\n${stderr}`
    return output.includes('LOGIN') && output.includes('yes')
  }
}

// Why (BW #323): welink-cli auth status exits 0 both when logged in and when
// the token is EXPIRED (it auto-refreshes on the next command), so exit 0
// counts as connected — the EXPIRED middle state must not force a re-login
// (intent 待决 3 draft). Marker fallback: a credentials block is present.
export async function isWelinkAuthenticated(wslTarget?: WslPreflightTarget): Promise<boolean> {
  try {
    await (wslTarget
      ? execCommandInWslOrThrow(wslTarget, `${shellQuote('welink-cli')} auth status`)
      : execLocalPreflightCommandOrThrow('welink-cli', ['auth', 'status']))
    return true
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? ''
    const stderr = (error as { stderr?: string }).stderr ?? ''
    const output = `${stdout}\n${stderr}`
    return output.includes('User Token')
  }
}
