import type { GlobalSettings } from '../../../../../../shared/global-settings-types'
import { SearchableSetting } from '../../SearchableSetting'
import { SettingsSwitchRow } from '../../SettingsFormControls'
import {
  getLinkRoutingModifierDescription,
  getLinkRoutingModifierTitle
} from './browser-link-routing-copy'
import { useTranslate } from '../../../../i18n/use-translate'

type BrowserLinkRoutingModifierSettingProps = {
  settings: Pick<GlobalSettings, 'openLinksInApp' | 'openLinksInAppModifierInverts'>
  isMac: boolean
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function BrowserLinkRoutingModifierSetting({
  settings,
  isMac,
  updateSettings
}: BrowserLinkRoutingModifierSettingProps): React.JSX.Element {
  const t = useTranslate()
  const openLinksInApp = settings.openLinksInApp === true
  const title = getLinkRoutingModifierTitle(openLinksInApp, t)
  const description = getLinkRoutingModifierDescription({ openLinksInApp, isMac }, t)

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={[
        'browser',
        'links',
        'routing',
        'shift',
        'modifier',
        'invert',
        'opposite',
        isMac ? 'cmd' : 'ctrl'
      ]}
    >
      <div className="ml-4 border-l border-border pl-4">
        <SettingsSwitchRow
          label={title}
          description={description}
          checked={settings.openLinksInAppModifierInverts === true}
          onChange={() =>
            updateSettings({
              openLinksInAppModifierInverts: settings.openLinksInAppModifierInverts !== true
            })
          }
        />
      </div>
    </SearchableSetting>
  )
}
