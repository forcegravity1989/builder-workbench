import { Input } from '@/components/ui/input'
import { ProjectWallCard, type WallCardView } from '../ProjectWallCard'
import { DirectionOverviewFrame, sampleCharter } from './DirectionCharterDemo'
import '../workbench-wall.css'

const ignore = () => {}

function makeCard(id: string, name: string, charter: WallCardView['charter']): WallCardView {
  const repo = {
    id,
    path: '',
    kind: 'git',
    displayName: name,
    badgeColor: '',
    addedAt: 0,
    projectVisibility: 'team'
  } as const
  return {
    primaryRepo: repo,
    displayName: name,
    charter,
    readings: { kind: 'empty' },
    hostTags: [{ hostId: 'local', label: '本机', online: true, isLocal: true }],
    project: {
      key: id,
      groupId: null,
      name,
      primaryRepoId: id,
      repoIds: [id],
      rows: [repo],
      hostIds: ['local'],
      slots: []
    }
  }
}

const bookExchange = makeCard('direction-demo', sampleCharter.name, sampleCharter)
const communityMap = makeCard('direction-demo-secondary', '社区地图', null)

export function DirectionWallDemo({ time }: { time: number }) {
  if (time >= 4300) {
    return <DirectionOverviewFrame expanded={false} />
  }

  const query = bookExchange.displayName.slice(0, Math.max(0, Math.floor((time - 1050) / 280)))
  const cards = query ? [bookExchange] : [bookExchange, communityMap]

  return (
    <div className="wb-wall direction-demo-window direction-wall-demo">
      <header className="page-head">
        <h1>
          项目墙 <small>2 个项目</small>
        </h1>
      </header>
      <div className="wallbar">
        <Input aria-label="搜索项目" placeholder="搜索项目" readOnly value={query} />
      </div>
      <section className="wall-group">
        <h2>
          团队项目 <small>{cards.length}</small>
        </h2>
        <div className="wall-grid">
          {cards.map((card) => (
            <ProjectWallCard
              key={card.project.key}
              card={card}
              switching={false}
              configured={false}
              onOpen={ignore}
              onOverview={ignore}
              onClone={ignore}
              onConfigure={ignore}
              onStage={ignore}
              nativeMenu={null}
              repoMenu={() => null}
              onRepoSettings={ignore}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
