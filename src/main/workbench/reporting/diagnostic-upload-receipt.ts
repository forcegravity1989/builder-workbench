import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { getCanonicalUserDataPath } from '../../persistence/loading-store/user-data-path'
import { writePluginFileAtomically } from '../../plugins/plugin-atomic-file-write'

const ReceiptSchema = z.object({
  spaceId: z.string().regex(/^\d{1,20}$/),
  fileId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  route: z.object({ wslDistro: z.string().min(1).max(256).optional() })
})

export type DiagnosticUploadReceipt = z.infer<typeof ReceiptSchema>

function receiptDirectory(): string {
  return join(getCanonicalUserDataPath(), 'workbench-diagnostic-receipts')
}

function receiptPath(ticketId: string): string {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(ticketId)) {
    throw new Error('ticketId has invalid format')
  }
  return join(receiptDirectory(), `${ticketId}.json`)
}

// Keep the public reference opaque: only main may select the remote deletion target.
export async function saveDiagnosticUploadReceipt(
  ticketId: string,
  receipt: DiagnosticUploadReceipt
): Promise<void> {
  const path = receiptPath(ticketId)
  const value = ReceiptSchema.parse(receipt)
  await mkdir(receiptDirectory(), { recursive: true, mode: 0o700 })
  await writePluginFileAtomically(path, JSON.stringify(value), { mode: 0o600 })
}

export async function readDiagnosticUploadReceipt(
  ticketId: string
): Promise<DiagnosticUploadReceipt | null> {
  try {
    return ReceiptSchema.parse(JSON.parse(await readFile(receiptPath(ticketId), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function forgetDiagnosticUploadReceipt(ticketId: string): Promise<void> {
  await rm(receiptPath(ticketId), { force: true })
}
