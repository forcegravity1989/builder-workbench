import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export const getArtifactsSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.artifacts.sharedLinksTitle', "Files you've shared"),
    description: translate(
      'auto.components.settings.artifacts.sharedLinksDescription',
      'Links this computer created. Deleting a link makes it stop working immediately.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.artifacts.keywordArtifacts', 'artifacts'),
      ...translateSearchKeyword('auto.components.settings.artifacts.keywordShare', 'share'),
      ...translateSearchKeyword('auto.components.settings.artifacts.keywordLink', 'link'),
      ...translateSearchKeyword('auto.components.settings.artifacts.keywordDelete', 'delete')
    ]
  }
])
