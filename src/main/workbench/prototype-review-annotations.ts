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
      annotations.set(annotation.documentKey, [
        ...(annotations.get(annotation.documentKey) ?? []),
        annotation
      ])
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
  return AnnotationListSchema.parse(annotations.get(documentKey) ?? [])
}

export async function addPrototypeReviewAnnotation(
  annotation: PrototypeReviewAnnotation
): Promise<PrototypeReviewAnnotation> {
  await loadAnnotations()
  const current = annotations.get(annotation.documentKey) ?? []
  if (
    current.length >= MAX_ANNOTATIONS_PER_DOCUMENT &&
    !current.some((item) => item.id === annotation.id)
  ) {
    throw new Error('该文档的批注已达上限')
  }
  const next = current.some((item) => item.id === annotation.id)
    ? current.map((item) => (item.id === annotation.id ? annotation : item))
    : [...current, annotation]
  annotations.set(annotation.documentKey, next)
  await persistAnnotations()
  return annotation
}

export async function deletePrototypeReviewAnnotation(
  documentKey: string,
  annotationId: string
): Promise<boolean> {
  await loadAnnotations()
  const current = annotations.get(documentKey) ?? []
  const next = current.filter((annotation) => annotation.id !== annotationId)
  if (next.length === current.length) {
    return false
  }
  annotations.set(documentKey, next)
  await persistAnnotations()
  return true
}
