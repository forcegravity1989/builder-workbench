import type {
  BwCliInstallFinishedPayload,
  BwCliInstallId
} from '../../shared/bw-cli-install-commands'

// Why (BW #323): install is an app-run background command (user decision
// 2026-10-16) — start / isRunning drive the card's "Installing…" state and
// onFinished delivers the completion / failure notification payload. BW-only
// file: the upstream `cli-install-api.ts` name is taken by the CliApi domain
// contract, so this one carries the bw- prefix like its main-process runner.
export type CliInstallApi = {
  start: (args: { cli: BwCliInstallId }) => Promise<{ started: boolean }>
  isRunning: (args: { cli: BwCliInstallId }) => Promise<boolean>
  onFinished: (callback: (payload: BwCliInstallFinishedPayload) => void) => () => void
}
