import type {
  TerminalPreviewConnectResult,
  TerminalPreviewDataPayload
} from '../../shared/terminal-preview'

export type TerminalPreviewApi = {
  connect: (
    ptyId: string,
    opts?: { scrollbackRows?: number }
  ) => Promise<TerminalPreviewConnectResult>
  input: (ptyId: string, data: string) => Promise<boolean>
  /** Claim the PTY grid for the preview dialog; resolves to the size actually in effect. */
  fit: (ptyId: string, cols: number, rows: number) => Promise<{ cols: number; rows: number } | null>
  ack: (ptyId: string, bytes: number) => Promise<void>
  unsubscribe: (ptyId: string) => Promise<void>
  onData: (callback: (payload: TerminalPreviewDataPayload) => void) => () => void
}
