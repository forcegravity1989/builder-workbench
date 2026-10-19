import { createHash } from 'node:crypto'
import { z } from 'zod'
import { RuntimeClientError } from '../runtime/types'

export const MeetingRecordingSchema = z.object({
  index: z.number().int().positive(),
  name: z.string().min(1),
  label: z.string().min(1)
})
export type MeetingRecording = z.infer<typeof MeetingRecordingSchema>

export function selectMeetingRecordings(
  inventory: MeetingRecording[],
  selection: string
): MeetingRecording[] {
  if (
    inventory.length === 0 ||
    new Set(inventory.map((item) => item.label)).size !== inventory.length
  ) {
    throw new RuntimeClientError(
      'meeting-recordings-unavailable',
      '录制清单为空或名称重复，不能确定读取范围。'
    )
  }
  if (selection === 'all') {
    return inventory
  }
  const matches = /^\d+$/.test(selection)
    ? inventory.filter((item) => item.index === Number(selection))
    : inventory.filter((item) => item.name === selection || item.label === selection)
  if (matches.length !== 1) {
    throw new RuntimeClientError(
      'invalid_argument',
      `无法唯一定位录制「${selection}」，请先用 --list 查看序号和名称。`
    )
  }
  return matches
}

/** The browser and CLI compare UTF-16 units; byte counts would split Chinese text incorrectly. */
export function transcriptFingerprint(text: string): string {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  }
  return (hash >>> 0).toString(16)
}

export function verifyTranscriptChunks(
  chunks: string[],
  expected: { length: number; fingerprint: string }
): { text: string; characters: number; sha256: string } {
  const text = chunks.join('')
  if (
    !text.trim() ||
    text.length !== expected.length ||
    transcriptFingerprint(text) !== expected.fingerprint
  ) {
    throw new RuntimeClientError(
      'meeting-transcript-incomplete',
      '转写稿为空、截断或读取期间发生变化，未保存为完整稿件。'
    )
  }
  return { text, characters: text.length, sha256: createHash('sha256').update(text).digest('hex') }
}
