import React from 'react'

/** Step 1 right pane — last week goals / tasks / session (prototype-v7). */
export function PlanLastWeekPane(): React.JSX.Element {
  return (
    <div className="plan-step plan-step-1">
      <div className="sec">
        <div className="block-title">
          <h2>上周目标 · 完成情况</h2>
          <span className="wb-tag wb-tag-outline">v0.3 · W37 结束时</span>
        </div>
        <div className="goals">
          <div className="wb-card goal">
            <span className="card-kicker">目标 1</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>再纳入 2 个真实项目</span>
            <span className="bar">
              <i style={{ width: '50%' }} />
            </span>
            <span className="goal-meta">
              1 / 2<span className="wb-tag wb-tag-warning">未达</span>
            </span>
            <span className="wb-muted" style={{ fontSize: 11.5 }}>
              上周只跑满第 1 个项目
            </span>
          </div>
          <div className="wb-card goal">
            <span className="card-kicker">目标 2</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>记分牌 6 条指标全接真数据</span>
            <span className="bar warn">
              <i style={{ width: '67%' }} />
            </span>
            <span className="goal-meta">
              4 / 6<span className="wb-tag wb-tag-warning">delay</span>
            </span>
            <span className="wb-muted" style={{ fontSize: 11.5 }}>
              接真数据 2→4；CI 仍见红
            </span>
          </div>
          <div className="wb-card goal">
            <span className="card-kicker">目标 3</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>发版从 4 步变成 1 条命令</span>
            <span className="bar">
              <i style={{ width: '33%' }} />
            </span>
            <span className="goal-meta">
              仍 3 步<span className="wb-tag wb-tag-danger">遗留</span>
            </span>
            <span className="wb-muted" style={{ fontSize: 11.5 }}>
              #158 未合 · 发版间隔 21 天
            </span>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="block-title">
          <h2>上周任务 · 完成情况</h2>
          <span className="wb-muted wb-mono" style={{ fontSize: 11 }}>
            完 2 · 遗留 1
          </span>
        </div>
        <div className="task-table">
          <div className="task-row head">
            <span>编号</span>
            <span>上周要做的事</span>
            <span>从 → 到</span>
            <span>挂目标</span>
            <span>结果</span>
          </div>
          <div className="task-row done-row">
            <span className="id">#151</span>
            <div className="task-main">
              <span>记分牌再接 2 条真数据</span>
            </div>
            <span className="delta">2 → 4</span>
            <span className="wb-tag wb-tag-warning" style={{ justifySelf: 'start' }}>
              目标 2
            </span>
            <span className="wb-tag wb-tag-success" style={{ justifySelf: 'start' }}>
              达成
            </span>
          </div>
          <div className="task-row done-row">
            <span className="id">#147</span>
            <div className="task-main">
              <span>第 1 个真实项目跑满一周</span>
            </div>
            <span className="delta">项目数 1</span>
            <span className="wb-tag wb-tag-success" style={{ justifySelf: 'start' }}>
              目标 1
            </span>
            <span className="wb-tag wb-tag-success" style={{ justifySelf: 'start' }}>
              达成
            </span>
          </div>
          <div className="task-row">
            <span className="id">#158</span>
            <div className="task-main">
              <span>出包脚本改 tag，发版一条命令</span>
              <span className="wb-muted" style={{ fontSize: 11 }}>
                仍在跑 · 发版仍 3 步
              </span>
            </div>
            <span className="delta">4 → 1 步</span>
            <span className="wb-tag wb-tag-danger" style={{ justifySelf: 'start' }}>
              目标 3
            </span>
            <span className="wb-tag wb-tag-danger" style={{ justifySelf: 'start' }}>
              遗留
            </span>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="block-title">
          <h2>上周的会话记录</h2>
          <span className="wb-muted wb-mono" style={{ fontSize: 11 }}>
            W37 · 周一 计划对齐 · #120
          </span>
        </div>
        <div className="wb-card session-log">
          <div className="session-meta">
            <span className="wb-tag wb-tag-outline">更新指标与版本计划</span>
            <span className="wb-muted wb-mono">09:00–09:28 · Claude Code · bw/week-plan</span>
          </div>
          <div className="session-lines">
            <div className="session-line">
              <span className="t">00:40</span>
              <span className="who">Agent</span>
              <span className="txt">W36 结果：指标全通；本周目标写进评论，纳入 3 件。</span>
            </div>
            <div className="session-line key">
              <span className="t">04:12</span>
              <span className="who">你</span>
              <span className="txt">接真数据优先；第 1 个真实项目要跑满一周。</span>
              <span className="wb-tag wb-tag-accent" style={{ flex: 'none' }}>
                → 目标
              </span>
            </div>
            <div className="session-line">
              <span className="t">11:05</span>
              <span className="who">Agent</span>
              <span className="txt">
                已挂 #151 / #153（接真数据）、#147（项目跑满）、#158（发版一条命令）。
              </span>
            </div>
            <div className="session-line key">
              <span className="t">18:40</span>
              <span className="who">你</span>
              <span className="txt">发版日先盯住，脚本改不动也要能发。</span>
              <span className="wb-tag wb-tag-warning" style={{ flex: 'none' }}>
                → 风险
              </span>
            </div>
            <div className="session-line muted-line">
              <span className="t">28:00</span>
              <span className="who">系统</span>
              <span className="txt">会话结束 · 结果见上方目标与任务完成情况</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
