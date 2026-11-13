import { useLayoutEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { openWorkbenchGuide, type WorkbenchGuideId } from '../WorkbenchScreenGuide'
import {
  getBwExploreCatalog,
  type ExploreDemo,
  type ExploreFeature,
  type ExploreFeatureId,
  type ExploreJourney
} from './bw-explore-catalog'

const paneClassName =
  'min-h-0 min-w-0 data-[state=active]:grid grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[260px_minmax(0,1fr)] md:grid-rows-1 lg:grid-cols-[280px_minmax(0,1fr)]'
const railClassName =
  'scrollbar-sleek min-h-0 max-h-44 overflow-y-auto border-b border-border bg-card p-2 md:max-h-none md:border-b-0 md:border-r'
const rowClassName = 'h-auto min-h-9 w-full justify-start whitespace-normal text-left'
const featureGuides: Partial<Record<ExploreFeatureId, WorkbenchGuideId>> = {
  'project-wall': 'workbench-wall',
  'project-overview': 'workbench-overview',
  milestones: 'workbench-milestones'
}

export function BwExploreLayout({
  demo,
  onSelectDemo,
  footerText,
  onClose
}: {
  demo: ReactNode
  onSelectDemo: (demo: ExploreDemo) => void
  footerText: string | null
  onClose: () => void
}): JSX.Element {
  const catalog = getBwExploreCatalog()
  const { labels, groups, journeys } = catalog
  const features: Record<ExploreFeatureId, ExploreFeature> = catalog.features
  const [tab, setTab] = useState('feature')
  const [groupId, setGroupId] = useState<string>('execution')
  const [featureId, setFeatureId] = useState<ExploreFeatureId>('workspace')
  const [journeyIndex, setJourneyIndex] = useState(0)
  const feature = features[featureId]
  const guide = featureGuides[featureId]
  const journey: ExploreJourney = journeys[journeyIndex] ?? journeys[0]
  const featureContentRef = useRef<HTMLElement>(null)
  const focusRelatedContent = useRef(false)

  useLayoutEffect(() => {
    if (focusRelatedContent.current) {
      focusRelatedContent.current = false
      featureContentRef.current?.focus()
    }
  }, [tab, featureId])

  function selectFeature(id: ExploreFeatureId): void {
    setFeatureId(id)
    const selectedGroup = groups.find((group) => group.items.some((item) => item === id))
    if (selectedGroup) {
      setGroupId(selectedGroup.id)
    }
    const selectedDemo = features[id].demo
    if (selectedDemo) {
      onSelectDemo(selectedDemo)
    }
  }

  function relatedFeatures(
    ids: readonly ExploreFeatureId[] | undefined,
    compact = false
  ): ReactNode {
    if (!ids?.length) {
      return null
    }
    return (
      <nav
        aria-label={labels.related}
        className={cn(
          'mx-auto w-full max-w-[940px]',
          compact ? 'px-4 pb-2 sm:px-6' : 'px-8 pb-6 pt-5'
        )}
      >
        {!compact && (
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">{labels.related}</h4>
        )}
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <Button
              key={id}
              variant="outline"
              size="sm"
              onClick={() => {
                focusRelatedContent.current = true
                selectFeature(id)
                setTab('feature')
              }}
            >
              {features[id].title}
            </Button>
          ))}
        </div>
      </nav>
    )
  }

  return (
    <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0"
      >
        <div className="border-b border-border px-6">
          <TabsList variant="line" aria-label={labels.types}>
            <TabsTrigger value="journey">{labels.journeys}</TabsTrigger>
            <TabsTrigger value="feature">{labels.features}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="feature" className={paneClassName}>
          <nav aria-label={labels.features} className={railClassName}>
            {groups.map((group) => {
              const expanded = groupId === group.id
              return (
                <div key={group.id} className="mb-1">
                  <Button
                    variant="ghost"
                    className={cn(rowClassName, 'justify-between', expanded && 'bg-accent')}
                    aria-expanded={expanded}
                    onClick={() => selectFeature(group.items[0])}
                  >
                    {group.title}
                    {expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                  </Button>
                  {expanded && (
                    <div className="space-y-1 py-1 pl-3">
                      {group.items.map((id) => (
                        <Button
                          key={id}
                          variant="ghost"
                          className={cn(
                            rowClassName,
                            'justify-between text-[13px] font-normal',
                            id === featureId && 'bg-accent'
                          )}
                          aria-current={id === featureId ? 'true' : undefined}
                          onClick={() => selectFeature(id)}
                        >
                          <span>{features[id].title}</span>
                          {!features[id].demo && !features[id].content && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {labels.preparing}
                            </span>
                          )}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
          <section
            ref={featureContentRef}
            tabIndex={-1}
            aria-label={feature.title}
            className="scrollbar-sleek min-h-0 min-w-0 overflow-auto outline-none"
            key={featureId}
          >
            {feature.demo ? demo : <ExploreContent entry={feature} status={labels.preparing} />}
            {guide && (
              <div className="mx-auto max-w-[940px] px-4 pt-3 sm:px-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose()
                    openWorkbenchGuide(guide)
                  }}
                >
                  {translate('guidance.direction.followAlong', 'Try it in BW')}
                </Button>
              </div>
            )}
            {relatedFeatures(feature.related)}
          </section>
        </TabsContent>
        <TabsContent value="journey" className={paneClassName}>
          <nav aria-label={labels.journeys} className={cn(railClassName, 'px-2.5 py-3.5')}>
            <ol className="ml-2 border-l border-border pl-2">
              {journeys.map(
                (item, index) =>
                  !item.building && (
                    <li key={item.id} className="relative">
                      <span
                        aria-hidden
                        className={cn(
                          'absolute -left-[12px] top-1/2 z-10 size-1.5 -translate-y-1/2 rounded-full border border-muted-foreground bg-card',
                          index === journeyIndex && 'border-foreground bg-foreground'
                        )}
                      />
                      <JourneyButton
                        item={item}
                        selected={index === journeyIndex}
                        onClick={() => setJourneyIndex(index)}
                      />
                    </li>
                  )
              )}
            </ol>
            <Button
              variant="ghost"
              size="xs"
              className="ml-2 mt-1 text-muted-foreground"
              onClick={() => setJourneyIndex(0)}
            >
              <RotateCcw aria-hidden /> {labels.nextRound}
            </Button>
            <div className="mx-2 mt-3 border-t border-border pt-2">
              <p className="px-2 text-xs text-muted-foreground">{labels.throughout}</p>
              {journeys.map(
                (item, index) =>
                  item.building && (
                    <JourneyButton
                      key={item.id}
                      item={item}
                      selected={index === journeyIndex}
                      badge={labels.building}
                      onClick={() => setJourneyIndex(index)}
                    />
                  )
              )}
            </div>
          </nav>
          <section
            key={journey.id}
            aria-label={journey.title}
            className="scrollbar-sleek min-h-0 min-w-0 overflow-auto"
          >
            <header className="mx-auto max-w-[940px] px-4 pt-3.5 sm:px-6">
              <h3 className="text-[23px] font-semibold leading-[1.3]">{journey.title}</h3>
              <dl className="mt-1 flex flex-wrap gap-x-[22px] gap-y-1 text-xs leading-relaxed">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{labels.start}</dt>
                  <dd>{journey.start}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{labels.result}</dt>
                  <dd>{journey.result}</dd>
                </div>
              </dl>
              {!journey.content && !journey.building && (
                <p className="mt-3 text-xs text-muted-foreground">{labels.preparing}</p>
              )}
            </header>
            {journey.content && <journey.content />}
            {relatedFeatures(journey.related, !!journey.content)}
          </section>
        </TabsContent>
      </Tabs>
      <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-7">
        <span className="text-xs text-muted-foreground">{footerText}</span>
        <Button variant="outline" size="sm" onClick={onClose}>
          {translate('auto.components.ui.dialog.f26c4baeda', 'Close')}
        </Button>
      </footer>
    </div>
  )
}

function ExploreContent({
  entry,
  status
}: {
  entry: ExploreFeature | ExploreJourney
  status: string
}): JSX.Element {
  const Content = entry.content
  return (
    <>
      <header className="mx-auto max-w-[940px] px-8 pb-3 pt-7 text-center">
        {!Content && (
          <span className="mb-3 inline-block rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {status}
          </span>
        )}
        <h3 className="text-2xl font-semibold leading-tight tracking-tight">{entry.title}</h3>
        <p className="mx-auto mt-3 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
          {entry.summary}
        </p>
      </header>
      {Content && <Content />}
    </>
  )
}

function JourneyButton({
  item,
  selected,
  badge,
  onClick
}: {
  item: ExploreJourney
  selected: boolean
  badge?: string
  onClick(): void
}) {
  return (
    <Button
      variant="ghost"
      aria-current={selected ? 'true' : undefined}
      className={cn(
        rowClassName,
        'mb-1 min-h-8 justify-between gap-2 border-l-2 border-transparent font-normal',
        selected && 'border-l-foreground bg-accent font-medium'
      )}
      onClick={onClick}
    >
      <span className="min-w-0">{item.title}</span>
      {badge && (
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
          {badge}
        </span>
      )}
    </Button>
  )
}
