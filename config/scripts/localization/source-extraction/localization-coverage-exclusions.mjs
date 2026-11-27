import fs from 'node:fs/promises'
import path from 'node:path'

// Why: the BW overlay is Chinese-first and exempt from Orca i18n extraction as a whole subtree;
// per-string allowlisting would need a reviewed entry for every copy change. Reasons required.
export async function readExclusions(root, exclusionsPath) {
  const absolutePath = path.resolve(root, exclusionsPath)
  const raw = await fs.readFile(absolutePath, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return '[]'
  })
  const exclusions = JSON.parse(raw)
  for (const entry of exclusions) {
    if (!entry?.pathPrefix) {
      throw new Error(`${exclusionsPath}: every exclusion needs a non-empty pathPrefix`)
    }
    if (!entry?.reason) {
      throw new Error(`${exclusionsPath}: exclusion ${entry.pathPrefix} needs a documented reason`)
    }
  }
  return exclusions
}

export function applyExclusions(reports, exclusions) {
  return reports.filter(
    (report) => !exclusions.some((entry) => report.filePath.startsWith(entry.pathPrefix))
  )
}
