import { z } from 'zod'
import { useState } from 'react'
import { Flag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MilestoneField } from './milestone-field'
import { MilestoneIconButton } from './milestone-icon-button'
import { milestoneDay } from '../../../shared/workbench/milestone-calendar'
import type { MilestoneNode, MilestoneDraft } from '../../../shared/workbench/project-milestones'
import {
  MILESTONE_DAY_WIDTH as dayWidth,
  MILESTONE_LABEL_WIDTH as labelWidth
} from './use-milestone-gesture'

const civilDate = z.iso.date()

type Actions = {
  enabled: boolean
  change(node: MilestoneNode): void
  remove(id: string): void
}

function Caption({
  node,
  change,
  remove
}: { node: MilestoneNode } & Pick<Actions, 'change' | 'remove'>) {
  return (
    <div className="wb-ml-node-editor">
      <MilestoneField
        multiline
        required
        editable
        value={node.outcome}
        label={`${node.date ?? node.month} 里程碑成果`}
        onChange={(outcome) => change({ ...node, outcome })}
      />
      <MilestoneIconButton label={`删除里程碑：${node.outcome}`} onClick={() => remove(node.id)}>
        <X size={14} />
      </MilestoneIconButton>
    </div>
  )
}

function NodeGroup({
  nodes,
  width = 0,
  captionOffset = 0,
  enabled,
  change,
  remove
}: Actions & { nodes: MilestoneNode[]; width?: number; captionOffset?: number }) {
  const [open, setOpen] = useState(false)
  const first = nodes[0],
    date = first.date
  const summary = nodes.length > 1 ? `${nodes.length} 个里程碑` : first.outcome
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {date ? (
          <button
            className="wb-ml-node-flag"
            aria-label={`${date} ${summary}`}
            title={`${date} ${summary}`}
          >
            <Flag size={17} />
            {width >= 90 && <span>{date.slice(5).replace('-', '/')}</span>}
            {width >= 90 && nodes.length > 1 && <small>{nodes.length}</small>}
          </button>
        ) : (
          <button className="text-xs text-muted-foreground">未指定日期 · {nodes.length}</button>
        )}
      </PopoverTrigger>
      {date && width >= 80 && (
        <div className="wb-ml-node-caption" style={{ left: captionOffset }}>
          {enabled && nodes.length === 1 ? (
            <Caption node={first} change={change} remove={remove} />
          ) : (
            <button className="wb-ml-node-summary" onClick={() => setOpen(true)} title={summary}>
              {summary}
            </button>
          )}
        </div>
      )}
      <PopoverContent
        aria-label="里程碑详情"
        className="max-h-96 overflow-y-auto scrollbar-sleek"
        data-ml-stop-pan
      >
        {nodes.map((node) => (
          <section className="wb-ml-node-detail" key={node.id}>
            {!node.date && <small>{node.month} · 未指定日期</small>}
            {enabled ? (
              <>
                <Input
                  className="wb-ml-node-date"
                  type="date"
                  max="9999-12-31"
                  aria-label={`里程碑日期：${node.outcome}`}
                  defaultValue={node.date ?? ''}
                  onBlur={(e) => {
                    const input = e.currentTarget
                    if (
                      civilDate.safeParse(input.value).success &&
                      input.validity.valid &&
                      input.value !== node.date
                    ) {
                      setOpen(false)
                      change({ id: node.id, date: input.value, outcome: node.outcome })
                    } else {
                      input.value = node.date ?? ''
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      e.currentTarget.value = node.date ?? ''
                      e.currentTarget.blur()
                    }
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    }
                  }}
                />
                <Caption
                  node={node}
                  change={change}
                  remove={(id) => {
                    setOpen(false)
                    remove(id)
                  }}
                />
              </>
            ) : (
              <>
                {node.date && <small>{node.date}</small>}
                <p className="whitespace-pre-wrap break-words">{node.outcome}</p>
              </>
            )}
          </section>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export function MilestoneNavigation({
  nodes,
  origin,
  width,
  visibleDate,
  add,
  ...actions
}: Actions & {
  nodes: MilestoneNode[]
  origin: number
  width: number
  visibleDate(): string
  add(node: MilestoneNode): void
}) {
  const [newDate, setNewDate] = useState<string | null>(null)
  const [outcome, setOutcome] = useState('')
  const groups = new Map<string, MilestoneNode[]>()
  for (const node of nodes) {
    const key = node.date ?? ''
    const group = groups.get(key)
    if (group) {
      group.push(node)
    } else {
      groups.set(key, [node])
    }
  }
  const dates = [...groups.keys()]
    .filter(
      (date) =>
        date && milestoneDay(date) >= origin && milestoneDay(date) < origin + width / dayWidth
    )
    .sort()
  return (
    <div className="wb-ml-roadmap" style={{ width: width + labelWidth }} aria-label="关键里程碑">
      <div className="wb-ml-label">
        <strong>关键里程碑</strong>
        {groups.has('') && <NodeGroup nodes={groups.get('')!} {...actions} />}
        {actions.enabled && (
          <MilestoneIconButton
            className="wb-ml-cell-add"
            label="添加里程碑"
            data-contextual-tour-target="milestone-start"
            onClick={() => {
              setNewDate(visibleDate())
              setOutcome('')
            }}
          >
            <Flag size={16} />
          </MilestoneIconButton>
        )}
      </div>
      <div className="wb-ml-node-axis" style={{ width }}>
        {dates.map((date, i) => {
          const day = milestoneDay(date)
          const space = Math.min(
            i ? day - milestoneDay(dates[i - 1]) : Infinity,
            i + 1 < dates.length ? milestoneDay(dates[i + 1]) - day : Infinity
          )
          const size = Math.max(28, Math.min(208, space * dayWidth - 12))
          const left = (day - origin + 0.5) * dayWidth - size / 2
          const captionOffset = Math.max(0, Math.min(left, width - size)) - left
          return (
            <div className="wb-ml-node" key={date} style={{ width: size, left }}>
              <NodeGroup
                nodes={groups.get(date)!}
                width={size}
                captionOffset={captionOffset}
                {...actions}
              />
            </div>
          )
        })}
      </div>
      <Dialog
        open={newDate !== null && actions.enabled}
        onOpenChange={(open) => {
          if (!open) {
            setNewDate(null)
          }
        }}
      >
        <DialogContent data-ml-stop-pan aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>添加里程碑</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (
                !newDate ||
                !civilDate.safeParse(newDate).success ||
                !outcome.trim() ||
                !actions.enabled
              ) {
                return
              }
              add({ id: crypto.randomUUID(), date: newDate, outcome: outcome.trim() })
              setNewDate(null)
            }}
          >
            <label>
              日期
              <Input
                type="date"
                max="9999-12-31"
                required
                value={newDate ?? ''}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </label>
            <label>
              预期成果
              <Textarea
                required
                maxLength={200}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNewDate(null)}>
                取消
              </Button>
              <Button type="submit" disabled={!newDate || !outcome.trim()}>
                添加
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type Edit = (update: (draft: MilestoneDraft) => MilestoneDraft) => void
export function milestoneNodeActions(
  nodes: MilestoneNode[],
  edit: Edit,
  editField: Edit,
  navigate: (date: string) => void
) {
  const update = (commit: Edit, transform: (nodes: MilestoneNode[]) => MilestoneNode[]) =>
    commit((d) => ({
      ...d,
      material: { ...d.material, milestones: transform(d.material.milestones) }
    }))
  return {
    add(node: MilestoneNode) {
      update(edit, (list) => [...list, node])
      if (node.date) {
        navigate(node.date)
      }
    },
    change(node: MilestoneNode) {
      const moved = nodes.find((m) => m.id === node.id)?.date !== node.date
      update(moved ? edit : editField, (list) => list.map((m) => (m.id === node.id ? node : m)))
      if (moved && node.date) {
        navigate(node.date)
      }
    },
    remove(id: string) {
      update(edit, (list) => list.filter((m) => m.id !== id))
    }
  }
}
