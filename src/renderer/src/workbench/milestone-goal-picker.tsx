import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MilestoneField } from './milestone-field'
import type {
  MilestoneDelivery,
  MilestoneVersion,
  MilestoneFeature,
  MilestoneDraft
} from '../../../shared/workbench/project-milestones'

export function MilestoneGoalPicker({
  delivery,
  versions,
  editable,
  feature,
  change
}: {
  delivery: MilestoneDelivery
  versions: MilestoneVersion[]
  editable: boolean
  feature: string
  change(goalSlot?: number, goalId?: string): void
}) {
  const [open, setOpen] = useState(false)
  const goals =
    versions.find(
      (v) => v.cycleId === delivery.version.cycleId && v.version === delivery.version.version
    )?.goals ?? []
  const index = goals.findIndex((g) => g.goalId === delivery.goalId)
  const label =
    index !== -1 ? `G${index + 1}` : delivery.goalSlot ? `G${delivery.goalSlot}` : '目标'
  const detail = `${delivery.version.version} · ${index !== -1 ? goals[index].title : delivery.goalId ? '目标已失效，请重新选择' : delivery.goalSlot ? '规划位置，实际目标尚未关联' : '选择本版目标'}`
  if (!editable) {
    return (
      <span className="wb-ml-goal-tag" title={detail}>
        {label}
        {delivery.goalId && index === -1 ? ' · 待核对' : ''}
      </span>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="wb-ml-goal-trigger"
          title={detail}
          aria-label={`${feature} · ${delivery.version.version} 关联目标`}
        >
          {label}
          <ChevronDown size={11} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="wb-ml-goal-options">
        {Array.from({ length: 4 }, (_, i) => (
          <button
            key={goals[i]?.goalId ?? i}
            aria-pressed={index !== -1 ? index === i : delivery.goalSlot === i + 1}
            onClick={() => {
              change(i + 1, goals[i]?.goalId)
              setOpen(false)
            }}
          >
            G{i + 1}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export function MilestoneFeatureMetadata({
  feature,
  versions,
  editable,
  changeOwner,
  edit
}: {
  feature: MilestoneFeature
  versions: MilestoneVersion[]
  editable: boolean
  changeOwner(owner: string): void
  edit(update: (draft: MilestoneDraft) => MilestoneDraft): void
}) {
  return (
    <div className="wb-ml-feature-meta">
      <small className="wb-ml-owner">
        <MilestoneField
          label="负责人"
          value={feature.owner}
          editable={editable}
          onChange={changeOwner}
        />
      </small>
      {feature.deliveries.map((delivery) => (
        <MilestoneGoalPicker
          key={delivery.id}
          delivery={delivery}
          versions={versions}
          editable={editable}
          feature={feature.title}
          change={(goalSlot, goalId) =>
            edit((draft) => ({
              ...draft,
              material: {
                ...draft.material,
                features: draft.material.features.map((item) =>
                  item.id !== feature.id
                    ? item
                    : {
                        ...item,
                        deliveries: item.deliveries.map((entry) =>
                          entry.id !== delivery.id ? entry : { ...entry, goalSlot, goalId }
                        )
                      }
                )
              }
            }))
          }
        />
      ))}
    </div>
  )
}
