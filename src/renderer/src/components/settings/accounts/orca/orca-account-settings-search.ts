import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '../../search/settings-search-keywords'

export const getOrcaAccountSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.orcaAccount.account', 'Orca account'),
    description: isWorkbenchShell()
      ? translate(
          'auto.components.settings.orcaAccount.workbenchDescription',
          'This account is used by Orca cloud connectors on the bot host.'
        )
      : translate(
          'auto.components.settings.orcaAccount.searchDescription',
          'Sign in or out of the account used by Artifacts and Orca Relay.'
        ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.orcaAccount.keywordAccount', 'account'),
      ...translateSearchKeyword('auto.components.settings.orcaAccount.keywordLogin', 'login'),
      ...translateSearchKeyword('auto.components.settings.orcaAccount.keywordLogout', 'logout'),
      ...translateSearchKeyword('auto.components.settings.orcaAccount.keywordSignIn', 'sign in'),
      ...translateSearchKeyword('auto.components.settings.orcaAccount.keywordSignOut', 'sign out'),
      ...(isWorkbenchShell()
        ? []
        : translateSearchKeyword('auto.components.settings.orcaAccount.keywordRelay', 'relay')),
      ...translateSearchKeyword('auto.components.settings.orcaAccount.keywordCloud', 'cloud')
    ]
  }
])
