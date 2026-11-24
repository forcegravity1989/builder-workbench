import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { writePluginFileAtomically } from '../plugins/plugin-atomic-file-write'
import {
  PrototypeReviewAnnotationSchema,
  type PrototypeReviewAnnotation
} from '../../shared/workbench/prototype-review-annotation'

const AnnotationListSchema = z.array(PrototypeReviewAnnotationSchema)
// Why: any connected member may submit, so one document's notes are bounded.
const MAX_ANNOTATIONS_PER_DOCUMENT = 200
// Why: a member can name any document, so the number of documents holding notes is bounded too.
const MAX_DOCUMENTS = 500
// Why: the same Windows file reopened through another spelling (drive-letter case, slash style)
// must read back the notes written under the first one.
function keyOf(documentKey: string): string {
  return /^[a-z]:[\\/]/i.test(documentKey)
    ? documentKey.replaceAll('\\', '/').toLowerCase()
    : documentKey
}
// Notes are kept per document, so every reviewer's submissions for one file read back together.
const annotations = new Map<string, PrototypeReviewAnnotation[]>()
let loaded = false
let writes: Promise<unknown> = Promise.resolve()
const annotationsPath = () =>
  join(getCanonicalUserDataPath(), 'workbench-prototype-review-annotations-v2.json')

async function loadAnnotations(): Promise<void> {
  if (loaded) {
    return
  }
  loaded = true
  try {
    const stored = AnnotationListSchema.parse(JSON.parse(await readFile(annotationsPath(), 'utf8')))
    for (const annotation of stored) {
      const key = keyOf(annotation.documentKey)
      annotations.set(key, [...(annotations.get(key) ?? []), annotation])
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

function persistAnnotations(): Promise<void> {
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      const stored = [...annotations.values()].flat()
      await mkdir(getCanonicalUserDataPath(), { recursive: true })
      await writePluginFileAtomically(annotationsPath(), JSON.stringify(stored), { mode: 0o600 })
    })
  writes = write
  return write
}

export async function readPrototypeReviewAnnotations(
  documentKey: string
): Promise<PrototypeReviewAnnotation[]> {
  await loadAnnotations()
  return AnnotationListSchema.parse(annotations.get(keyOf(documentKey)) ?? [])
}

export async function addPrototypeReviewAnnotation(
  annotation: PrototypeReviewAnnotation
): Promise<PrototypeReviewAnnotation> {
  await loadAnnotations()
  const key = keyOf(annotation.documentKey)
  const current = annotations.get(key) ?? []
  if (current.length === 0 && annotations.size >= MAX_DOCUMENTS) {
    throw new Error('批注的文档数已达上限')
  }
  if (
    current.length >= MAX_ANNOTATIONS_PER_DOCUMENT &&
    !current.some((item) => item.id === annotation.id)
  ) {
    throw new Error('该文档的批注已达上限')
  }
  const next = current.some((item) => item.id === annotation.id)
    ? current.map((item) => (item.id === annotation.id ? annotation : item))
    : [...current, annotation]
  annotations.set(key, next)
  await persistAnnotations()
  return annotation
}

export async function deletePrototypeReviewAnnotation(
  documentKey: string,
  annotationId: string
): Promise<boolean> {
  await loadAnnotations()
  const key = keyOf(documentKey)
  const current = annotations.get(key) ?? []
  const next = current.filter((annotation) => annotation.id !== annotationId)
  if (next.length === current.length) {
    return false
  }
  annotations.set(key, next)
  await persistAnnotations()
  return true
}
