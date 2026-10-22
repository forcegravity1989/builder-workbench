import type { CharterSubmitOutcome } from '../../shared/workbench/charter'

const submissions = new Map<string, Promise<CharterSubmitOutcome>>()

/** All clients of an owning runtime share one fixed charter tree per repository. */
export async function serializeCharterSubmission(
  key: string,
  submit: () => Promise<CharterSubmitOutcome>
) {
  const previous = submissions.get(key)
  const current = (async () => {
    await previous?.catch(() => undefined)
    return submit()
  })()
  submissions.set(key, current)
  try {
    return await current
  } finally {
    if (submissions.get(key) === current) {
      submissions.delete(key)
    }
  }
}
