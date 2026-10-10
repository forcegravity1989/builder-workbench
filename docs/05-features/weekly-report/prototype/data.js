// 示例事实集中存放，统计与报告读取同一份数据。
window.weeklyFixture = {
  project: '推理服务优化',
  version: 'v0.8',
  owner: '陈宁',
  start: '2026-10-05T00:00:00+08:00',
  endExclusive: '2026-10-10T00:00:00+08:00',
  collected: '2026-10-10 18:00（示例）',
  scenarios: {
    complete: { risksLoaded: true, milestonesDefined: true, verificationLoaded: true },
    missing: { risksLoaded: false, milestonesDefined: false, verificationLoaded: false },
    failed: { risksLoaded: true, milestonesDefined: true, verificationLoaded: true }
  },
  goals: [
    {
      id: 'G1',
      title: '降低在线推理延迟',
      deliverable: '交付批处理优化并完成性能验证',
      criterion: '同一压测口径下 P95 ≤ 120ms',
      date: '10 月 12 日',
      acceptance: '待人验收'
    },
    {
      id: 'G2',
      title: '保证服务稳定运行',
      deliverable: '修复重试与日志问题，补齐告警说明',
      criterion: '故障复现验证通过，告警能定位问题',
      date: '10 月 15 日',
      acceptance: '待人验收'
    }
  ],
  issues: [
    {
      id: 101,
      type: '需求',
      goal: 'G1',
      title: '批处理调度优化',
      created: '2026-09-25',
      closed: null,
      due: '10 月 12 日',
      status: '待评审',
      progress: 'MR !53 已合入；压测记录显示 P95 118ms，待按目标验收。',
      next: '复核压测条件，提交目标验收',
      events: [
        { at: '2026-10-07', text: 'MR !53 合入' },
        { at: '2026-10-09', text: '压测记录 P95 118ms' }
      ]
    },
    {
      id: 102,
      type: '问题',
      goal: 'G2',
      title: '超时重试导致重复请求',
      created: '2026-09-26',
      closed: '2026-10-08',
      due: '10 月 8 日',
      status: '已关闭',
      progress: '修复已合入，复现用例验证通过，由维护人关闭。',
      next: '观察试运行日志',
      events: [{ at: '2026-10-08', text: '修复验证通过，维护人关闭 Issue' }]
    },
    {
      id: 103,
      type: '问题',
      goal: 'G2',
      title: '长请求的告警上下文缺失',
      created: '2026-10-05',
      closed: null,
      due: '10 月 14 日',
      status: '进行中',
      progress: '已复现，定位到上下文透传遗漏。',
      next: '补齐上下文并回归验证',
      events: [{ at: '2026-10-05', text: '新增问题，复现与定位完成' }]
    },
    {
      id: 104,
      type: '需求',
      goal: 'G1',
      title: '完成高并发试运行',
      created: '2026-09-30',
      closed: null,
      due: '10 月 12 日',
      status: '阻塞',
      progress: '试运行环境尚未释放，已登记交付风险。',
      next: '协调环境，准备替代验证路径',
      events: [{ at: '2026-10-09', text: '环境未到位，登记节点延期风险' }]
    },
    {
      id: 105,
      type: '工作',
      goal: 'G2',
      title: '补充告警排障说明',
      created: '2026-10-06',
      closed: '2026-10-09',
      due: '10 月 9 日',
      status: '已关闭',
      progress: '排障说明已更新，维护人核对后关闭。',
      next: '结合试运行反馈维护',
      events: [{ at: '2026-10-09', text: '排障说明核对完成，维护人关闭 Issue' }]
    },
    {
      id: 106,
      type: '问题',
      goal: 'G2',
      title: '少量请求的日志字段为空',
      created: '2026-09-28',
      closed: null,
      due: '10 月 14 日',
      status: '待办',
      progress: '本周无新增处理记录，等待与上下文问题一起定位。',
      next: '补充复现样本',
      events: []
    }
  ],
  risks: [
    {
      issue: 104,
      goal: 'G1',
      level: '中',
      impact: '高并发试运行可能影响 10 月 12 日交付',
      action: '10 月 11 日协调环境；未释放则先完成替代环境验证',
      due: '10 月 11 日',
      status: '处理中'
    }
  ],
  milestones: [
    {
      title: '性能验证完成',
      goal: 'G1',
      date: '10 月 12 日',
      condition: '压测与试运行记录齐备，维护人验收',
      status: '待验证，试运行存在延期风险'
    }
  ],
  evidence: {
    plan: {
      title: 'v0.8 版本计划',
      source: '项目材料（示例）',
      text: 'G1：降低在线推理延迟，P95 ≤ 120ms。G2：修复重试与日志问题，补齐告警说明。目标状态均待人验收。'
    },
    metrics: {
      title: '10 月 9 日压测记录',
      source: '项目验证材料（示例）',
      text: '在相同模型、硬件与并发配置下测得 P95 118ms。该读数只能支持性能判据，不能证明试运行或整个目标完成。'
    }
  }
}
