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
const annotations = new Map<string, PrototypeReviewAnnotation[]>()
let loaded = false
let writes: Promise<unknown> = Promise.resolve()
const annotationsPath = () =>
  join(getCanonicalUserDataPath(), 'workbench-prototype-review-annotations.json')

function key(pageId: string, documentKey: string): string {
  return `${pageId}:${documentKey}`
}

async function loadAnnotations(): Promise<void> {
  if (loaded) {
    return
  }
  loaded = true
  try {
    const stored = AnnotationListSchema.parse(JSON.parse(await readFile(annotationsPath(), 'utf8')))
    for (const annotation of stored) {
      const entryKey = key(annotation.pageId, annotation.documentKey)
      annotations.set(entryKey, [...(annotations.get(entryKey) ?? []), annotation])
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
  pageId: string,
  documentKey: string
): Promise<PrototypeReviewAnnotation[]> {
  await loadAnnotations()
  return AnnotationListSchema.parse(annotations.get(key(pageId, documentKey)) ?? [])
}

export async function addPrototypeReviewAnnotation(
  annotation: PrototypeReviewAnnotation
): Promise<PrototypeReviewAnnotation> {
  await loadAnnotations()
  const entryKey = key(annotation.pageId, annotation.documentKey)
  const current = annotations.get(entryKey) ?? []
  const next = current.some((item) => item.id === annotation.id)
    ? current.map((item) => (item.id === annotation.id ? annotation : item))
    : [...current, annotation]
  annotations.set(entryKey, next)
  await persistAnnotations()
  return annotation
}

export async function deletePrototypeReviewAnnotation(
  pageId: string,
  documentKey: string,
  annotationId: string
): Promise<boolean> {
  await loadAnnotations()
  const entryKey = key(pageId, documentKey)
  const current = annotations.get(entryKey) ?? []
  const next = current.filter((annotation) => annotation.id !== annotationId)
  if (next.length === current.length) {
    return false
  }
  annotations.set(entryKey, next)
  await persistAnnotations()
  return true
}
