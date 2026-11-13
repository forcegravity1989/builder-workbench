import { Input } from '@/components/ui/input'
import { ProjectWallCard, type WallCardView } from '../ProjectWallCard'
import { ProjectCard } from '../overview-project-card'
import { sampleCharter } from './DirectionCharterDemo'
import '../workbench-wall.css'

const repo = {
  id: 'direction-demo',
  path: '',
  kind: 'git',
  displayName: sampleCharter.name,
  badgeColor: '',
  addedAt: 0
} as const
const card: WallCardView = {
  primaryRepo: repo,
  displayName: repo.displayName,
  charter: sampleCharter,
  readings: { kind: 'empty' },
  hostTags: [{ hostId: 'local', label: '本机', online: true, isLocal: true }],
  project: {
    key: repo.id,
    groupId: null,
    name: repo.displayName,
    primaryRepoId: repo.id,
    repoIds: [repo.id],
    rows: [repo],
    hostIds: ['local'],
    slots: []
  }
}

export function DirectionWallDemo({ time }: { time: number }) {
  if (time >= 4300) {
    return (
      <div className="wb-ov direction-charter-demo">
        <header className="page-head">
          <h1>总览</h1>
        </header>
        <div className="content">
          <ProjectCard
            projectName={repo.displayName}
            charter={sampleCharter}
            version={null}
            previewExpanded={false}
          />
        </div>
      </div>
    )
  }
  return (
    <main className="wb-wall direction-wall-demo">
      <header className="page-head">
        <h1>
          项目墙 <small>1 个项目</small>
        </h1>
      </header>
      <div className="wallbar">
        <Input
          aria-label="搜索项目"
          placeholder="搜索项目"
          readOnly
          value={repo.displayName.slice(0, Math.max(0, Math.floor((time - 1050) / 280)))}
        />
      </div>
      <section className="wall-group">
        <h2>
          团队项目 <small>1</small>
        </h2>
        <div className="wall-grid">
          <ProjectWallCard
            card={card}
            switching={false}
            configured={false}
            onOpen={() => {}}
            onOverview={() => {}}
            onClone={() => {}}
            onConfigure={() => {}}
            onStage={() => {}}
            nativeMenu={null}
            repoMenu={() => null}
            onRepoSettings={() => {}}
          />
        </div>
      </section>
    </main>
  )
}
