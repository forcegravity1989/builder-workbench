import { SearchableSetting } from '@/components/settings/SearchableSetting'
import type { SettingsSearchEntry } from '@/components/settings/settings-search'
import { isWorkbenchShell } from '../is-workbench-shell'
import { ConnectorsPane } from './ConnectorsPane'

// 集成页的薄挂载：执行工具接入外部服务（MCP）作为集成页的一节，只在 Workbench 壳出现。

const SECTION_ID = 'workbench-agent-connectors'

const SEARCH_ENTRY: SettingsSearchEntry = {
  title: '执行工具的外部服务',
  description: 'Claude Code、Codex 接入的 MCP 服务',
  keywords: ['connector', 'mcp', '连接器', 'linear', 'notion', 'jira', 'sentry', 'figma'],
  targetSectionId: SECTION_ID
}

export function workbenchAgentConnectorSearchEntries(): SettingsSearchEntry[] {
  return isWorkbenchShell() ? [SEARCH_ENTRY] : []
}

export function WorkbenchAgentConnectorsSection(): React.JSX.Element | null {
  if (!isWorkbenchShell()) {
    return null
  }
  return (
    <SearchableSetting
      title={SEARCH_ENTRY.title}
      description={SEARCH_ENTRY.description}
      keywords={SEARCH_ENTRY.keywords}
      className="max-w-none space-y-3"
      id={SECTION_ID}
    >
      <h3 className="text-sm font-semibold text-foreground">执行工具的外部服务</h3>
      <ConnectorsPane />
    </SearchableSetting>
  )
}
