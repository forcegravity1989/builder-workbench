import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export const getOrcaAccountSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.w3Account.searchAccount', 'W3 account'),
    description: translate(
      'auto.components.settings.w3Account.searchDescription',
      'Sign in with W3 or sign out.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.w3Account.keywordW3', 'w3'),
      ...translateSearchKeyword('auto.components.settings.w3Account.keywordAccount', 'account'),
      ...translateSearchKeyword('auto.components.settings.w3Account.keywordLogin', 'login'),
      ...translateSearchKeyword('auto.components.settings.w3Account.keywordLogout', 'logout'),
      ...translateSearchKeyword('auto.components.settings.w3Account.keywordSignIn', 'sign in'),
      ...translateSearchKeyword('auto.components.settings.w3Account.keywordSignOut', 'sign out'),
      ...translateSearchKeyword('auto.components.settings.w3Account.keywordHuawei', 'huawei')
    ]
  }
])
