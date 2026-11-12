import { useLayoutEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
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
  const journey = journeys[journeyIndex] ?? journeys[0]
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

  function relatedFeatures(ids: readonly ExploreFeatureId[] | undefined): ReactNode {
    if (!ids?.length) {
      return null
    }
    return (
      <div className="mx-auto w-full max-w-[940px] px-8 pb-6 pt-5">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">{labels.related}</h4>
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
      </div>
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
            {relatedFeatures(feature.related)}
          </section>
        </TabsContent>
        <TabsContent value="journey" className={paneClassName}>
          <nav aria-label={labels.journeys} className={railClassName}>
            {journeys.map((item, index) => (
              <Button
                key={item.id}
                variant="ghost"
                aria-current={index === journeyIndex ? 'true' : undefined}
                className={cn(
                  rowClassName,
                  'mb-1 flex-col items-start gap-1 font-normal',
                  index === journeyIndex && 'bg-accent'
                )}
                onClick={() => setJourneyIndex(index)}
              >
                {item.title}
                {item.building && (
                  <span className="text-xs text-muted-foreground">{labels.building}</span>
                )}
              </Button>
            ))}
          </nav>
          <section
            key={journey.id}
            aria-label={journey.title}
            className="scrollbar-sleek min-h-0 min-w-0 overflow-auto"
          >
            <ExploreContent
              entry={journey}
              status={journey.building ? labels.building : labels.preparing}
            />
            {relatedFeatures(journey.related)}
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
