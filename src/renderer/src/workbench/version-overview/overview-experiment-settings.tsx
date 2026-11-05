import { useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useProjectPage } from '../project-page-state'
import { getProjectHostSetupProjectionFromState } from '@/store/project-host-setup-selector'
import { SearchableSetting } from '@/components/settings/SearchableSetting'
import { SettingsRow, SettingsSwitch } from '@/components/settings/SettingsFormControls'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  overviewExperimentEnabled,
  overviewExperimentEntries,
  overviewProjectId
} from './overview-experiments'

export function OverviewExperimentSettings() {
  const { projects } = useAppStore(getProjectHostSetupProjectionFromState)
  const settings = useAppStore((state) => state.settings)
  const origin = useProjectPage()
  const originRepoId = origin?.kind === 'version-overview' ? origin.options.repoId : null
  const activeProjectId = useAppStore((state) => {
    const repoId = originRepoId ?? state.activeRepoId
    return repoId ? overviewProjectId(state, repoId) : undefined
  })
  const [selection, setSelection] = useState<string | undefined>(undefined)
  const projectId = selection ?? activeProjectId ?? projects[0]?.id
  const project = projects.find((item) => item.id === projectId)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const save = async (key: 'sdlc' | 'ai', enabled: boolean) => {
    if (!project || saving.current) {
      return
    }
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      const state = useAppStore.getState()
      await state.updateSettingsOrThrow({
        workbenchOverviewByProject: { [project.id]: { [key]: enabled } }
      })
    } catch (reason) {
      setError(`保存失败：${reason instanceof Error ? reason.message : String(reason)}`)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  return (
    <SearchableSetting
      title="项目统计"
      description={overviewExperimentEntries.map((entry) => entry.title).join(' ')}
      keywords={overviewExperimentEntries.flatMap((entry) => [...entry.keywords])}
      className="space-y-3 py-2"
      id="workbench-overview-experiments"
    >
      <Label>项目统计</Label>
      <Select
        value={project?.id ?? ''}
        disabled={busy || !projects.length}
        onValueChange={(value) => {
          setSelection(value)
          setError(null)
        }}
      >
        <SelectTrigger aria-label="适用项目" className="w-full max-w-sm">
          <SelectValue placeholder="尚未添加项目" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">仅在本机生效，项目内所有版本共用。</p>
      {overviewExperimentEntries.map((entry) => (
        <SettingsRow
          key={entry.key}
          label={entry.title}
          description={entry.description}
          control={
            <SettingsSwitch
              checked={overviewExperimentEnabled(settings, project?.id, entry.key)}
              disabled={!settings || !project || busy}
              ariaLabel={entry.title}
              onChange={() => {
                void save(entry.key, !overviewExperimentEnabled(settings, project?.id, entry.key))
              }}
            />
          }
        />
      ))}
      <p className="text-xs text-muted-foreground">
        两项默认关闭。关闭后停止对应采集并隐藏统计，已有材料保留；版本、目标、任务、计划和人工验收继续可用。
      </p>
      {busy && (
        <p className="text-xs text-muted-foreground" role="status">
          正在保存…
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </SearchableSetting>
  )
}
