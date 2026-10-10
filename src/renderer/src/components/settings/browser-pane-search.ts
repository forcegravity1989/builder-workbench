import type { SettingsSearchEntry } from './settings-search'
import { getBrowserPaneSearchEntries } from './browser-search'
import { getBrowserUsePaneSearchEntries } from './browser-use-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'

export const getBrowserPaneCombinedSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    // Why: the Workbench shell hides the Browser Use block, so search must not land on it.
    ...(isWorkbenchShell() ? [] : getBrowserUsePaneSearchEntries()),
    ...getBrowserPaneSearchEntries()
  ]
)
