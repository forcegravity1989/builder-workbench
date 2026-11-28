import { MONICA_DISPLAY_NAME } from './monica-display-name'
import englishSourceCopy from './monica-product-copy.json'

function isCatalogBranch(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function replaceProductName(key: string, copy: string): string {
  if (key === 'auto.components.sidebar.SidebarFeedbackDialog.workbenchDescription') {
    // The WeLink group's actual name is independent of the product name.
    return copy.replace(/\bWorkbench\b/g, MONICA_DISPLAY_NAME)
  }
  return copy.replace(/\b(?:Workbench|BW|Orca)\b/g, MONICA_DISPLAY_NAME)
}

/** Change only reviewed product copy keys, leaving the source catalog and other surfaces intact. */
export function applyMonicaProductCopy(
  catalog: Record<string, unknown>,
  includeEnglishFallbacks = false
): Record<string, unknown> {
  const result = { ...catalog }
  copyKeys: for (const [key, english] of Object.entries(englishSourceCopy)) {
    const segments = key.split('.')
    const leaf = segments.pop()
    if (!leaf) {
      continue
    }
    let current = result
    for (const segment of segments) {
      const branch = current[segment]
      if (!isCatalogBranch(branch) && !includeEnglishFallbacks) {
        continue copyKeys
      }
      const next = isCatalogBranch(branch) ? { ...branch } : {}
      current[segment] = next
      current = next
    }
    const copy = current[leaf]
    if (typeof copy === 'string' || includeEnglishFallbacks) {
      current[leaf] = replaceProductName(key, typeof copy === 'string' ? copy : english)
    }
  }
  return result
}
