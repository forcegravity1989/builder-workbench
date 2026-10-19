// 高效四原则（4DX）仪表：两屏各一条 4 灯读数带。
// 灯色语义：lit = 有可推导的读数且正性事实成立；灰 = 没数据、零值或推导不出
// （铁律二：没有正性证据不点绿，灰是事实不是错误）。灯只从屏上已加载的真实
// 数据现算，不提供手动置绿路径；判断归人，仪表只陈述事实读数。
import type { JSX } from 'react'
import type { WallCardView } from '../ProjectWallCard'
import { ACCEPTANCE_STAGE_LABELS } from '../../../../shared/workbench/version-workflow'
import type { AcceptanceWorkflowStage } from '../../../../shared/workbench/version-workflow'
import './fourdx.css'

const FOURDX_PRINCIPLES = [
  { n: '①', title: '聚焦最重要目标' },
  { n: '②', title: '关注引领性指标' },
  { n: '③', title: '建立醒目记分表' },
  { n: '④', title: '落实节奏问责制' }
] as const

export type Lamp = { lit: boolean; text: string; title: string }

function unknownLamp(title: string, text = 'Unknown'): Lamp {
  return { lit: false, text, title: `${title}：没有可推导的数据，如实置灰（铁律二）` }
}

/** 项目墙口径：全部从墙卡现成读数现算；时钟由调用方经 now 传入（仓内 useNow 约定）。 */
export function buildWallLamps(
  cards: WallCardView[],
  lastRefreshedAt: number | null,
  now: number
): Lamp[] {
  // ① 聚焦最重要目标：上墙项目里「版本已定」的占比（版本=人确认过的焦点）。
  const loadingVersion = cards.some((card) => card.readings.version.kind === 'loading')
  const decided = cards.filter((card) => card.readings.version.kind === 'value').length
  const goal: Lamp =
    cards.length === 0 || loadingVersion
      ? unknownLamp('版本读数尚未就绪')
      : decided > 0
        ? {
            lit: true,
            text: `${decided}/${cards.length} 项目版本已定`,
            title: '①聚焦最重要目标：上墙项目中已在计划屏定版的占比（现算）'
          }
        : unknownLamp('没有项目定过版本', '版本未定')

  // ② 关注引领性指标：引领指标正本在被管项目的指标材料里，墙屏无此数据源——
  // 不拿会话/PR 等活动量冒充引领指标，如实置灰。
  const lead = unknownLamp('引领指标在被管项目的指标材料里，墙屏无此数据源', '未上墙')

  // ③ 建立醒目记分表：记分表=墙卡读数区，新鲜度用现成的 lastRefreshedAt。
  // 刷新过一次即 lit（有读数=记分表在记分）；文案带出真实账龄，老账不装新鲜。
  const score: Lamp =
    lastRefreshedAt === null
      ? unknownLamp('还没完成过一次刷新')
      : {
          lit: true,
          text:
            now - lastRefreshedAt < 600_000
              ? '记分 10 分钟内新鲜'
              : `记分 ${Math.round((now - lastRefreshedAt) / 60_000)} 分钟前`,
          title: '③建立醒目记分表：整墙读数上次刷新的时间距今（现算）'
        }

  // ④ 落实节奏问责制：在跑会话与 PR 待审是节奏的事实输入；任一 Unknown 则整体 Unknown。
  let sessions = 0
  let prs = 0
  let cadenceUnknown = cards.length === 0
  for (const card of cards) {
    if (card.readings.sessions.kind === 'value') {
      sessions += card.readings.sessions.count
    } else {
      cadenceUnknown = true
    }
    if (card.readings.prs.kind === 'value') {
      prs += card.readings.prs.count
    } else {
      cadenceUnknown = true
    }
  }
  const cadence: Lamp = cadenceUnknown
    ? unknownLamp('有项目的会话/PR 读数不可得（离线或读取中）')
    : {
        lit: true,
        text: `在跑会话 ${sessions} · PR 待审 ${prs}`,
        title: '④落实节奏问责制：全部上墙项目的在跑会话与待审 PR 合计（现算；判断归人）'
      }

  return [goal, lead, score, cadence]
}

export type FourDxAcceptanceFacts = {
  versionSelected: boolean
  sourcesLoaded: boolean
  hasPlan: boolean
  goalsTotal: number
  goalsWithMetric: number
  hasDocument: boolean
  readingsTotal: number
  stage: AcceptanceWorkflowStage | undefined
}

/** 验收屏口径：从本屏已加载的 plan/document 现算，换成本版本的视角。 */
export function buildAcceptanceLamps(facts: FourDxAcceptanceFacts): Lamp[] {
  // 先答「有没有可推导的材料」：没选版本或材料还在读 = 没数据，四灯一律灰，
  // 不把「未读到」说成「未开始」（铁律二）。加载完成后才允许做缺席断言。
  const context: Lamp | null = !facts.versionSelected
    ? unknownLamp('尚未选择版本')
    : facts.sourcesLoaded
      ? null
      : unknownLamp('本版计划与验收材料还在读取', '读取中…')
  if (context) {
    return [context, context, context, context]
  }

  const goal: Lamp =
    facts.hasPlan && facts.goalsTotal > 0
      ? {
          lit: true,
          text: `本版 ${facts.goalsTotal} 个目标`,
          title: '①聚焦最重要目标：本版计划材料里人确认过的目标数（现算）'
        }
      : unknownLamp('本版已读完材料但没有可用计划，不猜')

  const lead: Lamp =
    facts.hasPlan && facts.goalsTotal > 0
      ? {
          lit: facts.goalsWithMetric > 0,
          text: `${facts.goalsWithMetric}/${facts.goalsTotal} 目标挂指标`,
          title: '②关注引领性指标：计划目标里挂了指标靶的占比（现算）'
        }
      : unknownLamp('没有计划材料，无从推导')

  const score: Lamp = facts.hasDocument
    ? {
        lit: facts.readingsTotal > 0,
        text: facts.readingsTotal > 0 ? `${facts.readingsTotal} 条读数已录` : '读数未录',
        title: '③建立醒目记分表：验收材料里已录入的指标读数条数（现算）'
      }
    : unknownLamp('还没有验收材料')

  // 走到这里版本已选且材料读完：材料里没有已记录阶段=节奏未开始，是可推导的缺席事实。
  const cadence: Lamp = facts.stage
    ? {
        lit: true,
        text: `节奏已到「${ACCEPTANCE_STAGE_LABELS[facts.stage]}」`,
        title: '④落实节奏问责制：模型记录到的 SOP 阶段（位置比较，无内容启发）'
      }
    : {
        lit: false,
        text: '节奏未开始',
        title: '④落实节奏问责制：版本已选且材料读完，仍无已记录阶段=未开始（置灰如实）'
      }

  return [goal, lead, score, cadence]
}

export function FourDxInstrument({ lamps }: { lamps: Lamp[] }): JSX.Element {
  return (
    <div className="fourdx-instrument" data-fourdx="instrument" aria-label="高效四原则仪表">
      <span className="fourdx-instrument-title">高效四原则</span>
      {FOURDX_PRINCIPLES.map((p, index) => {
        const lamp = lamps[index]
        return (
          <span
            key={p.n}
            className={`fourdx-lamp${lamp.lit ? ' is-lit' : ' is-unknown'}`}
            title={lamp.title}
          >
            <span className="fourdx-badge">{p.n}</span>
            <span className="fourdx-lamp-name">{p.title}</span>
            <span className="fourdx-lamp-value">{lamp.text}</span>
          </span>
        )
      })}
    </div>
  )
}
