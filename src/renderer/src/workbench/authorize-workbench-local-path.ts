/** Authorize a local path so renderer fs reads work before repos.add registers it. */
export async function authorizeWorkbenchLocalPath(targetPath: string): Promise<void> {
  const trimmed = targetPath.trim()
  if (!trimmed) {
    return
  }
  await window.api.fs.authorizeExternalPath({ targetPath: trimmed })
}
