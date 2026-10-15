import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

// Why (BW #323): the catalog mirrors the collapsed three-card pane. Entries
// for the six hidden cards are dropped with their UI; their locale keys stay
// pending 待决 1 (six-card code keep-or-drop).
export const getIntegrationsPaneSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate(
      'auto.components.settings.integrations.search.f16e41cc72',
      'GitHub Integration'
    ),
    description: translate(
      'auto.components.settings.integrations.search.7166b9090c',
      'GitHub authentication via the gh CLI.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.integrations.search.b79c21bd42',
        'github'
      ),
      ...translateSearchKeyword('auto.components.settings.integrations.search.41ccade05c', 'gh'),
      ...translateSearchKeyword(
        'auto.components.settings.integrations.search.c450244ad7',
        'integration'
      )
    ]
  },
  {
    title: translate(
      'auto.components.settings.integrations.search.codehubTitle',
      'CodeHub Integration'
    ),
    description: translate(
      'auto.components.settings.integrations.search.codehubDescription',
      'codehub-cli presence and login for issues and merge requests.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.integrations.search.codehubKeyword',
        'codehub'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.integrations.search.codehubCliKeyword',
        'codehub-cli'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.integrations.search.c450244ad7',
        'integration'
      )
    ]
  },
  {
    title: translate(
      'auto.components.settings.integrations.search.welinkTitle',
      'WeLink Integration'
    ),
    description: translate(
      'auto.components.settings.integrations.search.welinkDescription',
      'welink-cli presence and login for project group notifications.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.integrations.search.welinkKeyword',
        'welink'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.integrations.search.welinkCliKeyword',
        'welink-cli'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.integrations.search.c450244ad7',
        'integration'
      )
    ]
  }
])
