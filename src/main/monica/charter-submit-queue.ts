const submissions = new Map<string, Promise<unknown>>()

/** All clients of an owning runtime share one fixed charter tree per repository. */
export async function serializeCharterSubmission<T>(key: string, submit: () => Promise<T>) {
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
