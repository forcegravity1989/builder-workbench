import {
  KB_GAPS,
  KB_NOTE_KINDS,
  type KbGap,
  type KbNote,
  type KbNoteKind
} from './knowledge-demo-data'

export function gapsOfDoc(docId: string): KbGap[] {
  return KB_GAPS.filter((g) => g.docId === docId)
}

export function openGapsOfDoc(docId: string): KbGap[] {
  return gapsOfDoc(docId).filter((g) => g.state === 'diff' || g.state === 'unknown')
}

export function openGapCount(): number {
  return KB_GAPS.filter((g) => g.state === 'diff' || g.state === 'unknown').length
}

export function notesOfDoc(notes: readonly KbNote[], docId: string): KbNote[] {
  return notes.filter((n) => n.docId === docId)
}

export function noteKindName(kind: KbNoteKind): string {
  return KB_NOTE_KINDS.find((k) => k.key === kind)?.name ?? kind
}

export function gapMark(
  docId: string,
  notes: readonly KbNote[]
): {
  openCount: number
  noteCount: number
  allOk: boolean
} {
  const open = openGapsOfDoc(docId)
  const docNotes = notesOfDoc(notes, docId)
  return {
    openCount: open.length,
    noteCount: docNotes.length,
    allOk: open.length === 0 && gapsOfDoc(docId).some((g) => g.state === 'ok')
  }
}
