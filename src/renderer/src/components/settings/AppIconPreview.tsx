import icon from '../../../../../resources/icon.png?url'
import { translate } from '@/i18n/i18n'

export function AppIconPreview(): React.JSX.Element {
  return (
    <div className="flex items-center justify-center">
      <img
        src={icon}
        alt={translate('auto.components.settings.AppIconSelector.415fa76f64', 'Selected app icon')}
        className="size-24 rounded-2xl object-contain"
      />
    </div>
  )
}
