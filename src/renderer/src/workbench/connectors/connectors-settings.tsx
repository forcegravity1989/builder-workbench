import { Plug } from 'lucide-react'
import { SettingsSection } from '@/components/settings/SettingsSection'
import type { SettingsRenderContext } from '@/components/settings/settings-render-context'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import { isWorkbenchShell } from '../is-workbench-shell'
import { ConnectorsPane } from './ConnectorsPane'

// Orca 设置页的薄挂载：导航元数据与分节渲染各一处调用，只在 Workbench 壳里出现。
const SECTION_ID = 'connectors'
const TITLE = 'Connector'
const DESCRIPTION = '让 Claude Code、Codex 读写外部服务：挑选、安装、登录、查看状态。'

export function workbenchConnectorNavSections(): SettingsNavSection[] {
  if (!isWorkbenchShell()) {
    return []
  }
  return [
    {
      id: SECTION_ID,
      title: TITLE,
      description: DESCRIPTION,
      icon: Plug,
      searchEntries: [
        {
          title: TITLE,
          description: DESCRIPTION,
          keywords: ['connector', 'mcp', '连接器', 'linear', 'notion', 'jira', 'sentry', 'figma']
        }
      ],
      group: 'capabilities'
    }
  ]
}

export function renderWorkbenchConnectorsSettingsSection(
  context: SettingsRenderContext
): React.JSX.Element | null {
  if (!isWorkbenchShell()) {
    return null
  }
  const { navigation, view } = context
  return (
    <SettingsSection
      id={SECTION_ID}
      title={TITLE}
      description={DESCRIPTION}
      searchEntries={navigation.getSectionSearchEntries(SECTION_ID)}
    >
      {view.isSectionMounted(SECTION_ID) ? <ConnectorsPane /> : null}
    </SettingsSection>
  )
}
