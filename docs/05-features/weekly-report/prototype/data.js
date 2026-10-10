window.weeklyTemplate = {
  sections: [
    {
      key: 'goals',
      title: '一、目标',
      columns: ['目标', '交付要求', '计划完成', '当前情况'],
      widths: [22, 40, 14, 24]
    },
    {
      key: 'progress',
      title: '二、关键进展',
      columns: ['工作方向', '关键进展', '下周计划'],
      widths: [20, 45, 35]
    },
    {
      key: 'risks',
      title: '三、关键风险',
      columns: ['风险等级', '风险描述', '应对措施', '责任人', '计划关闭', '状态'],
      widths: [8, 28, 32, 8, 12, 12]
    },
    {
      key: 'milestones',
      title: '四、里程碑',
      columns: ['节点', '计划完成', '达成条件', '当前情况'],
      widths: [20, 14, 38, 28]
    },
    {
      key: 'requirements',
      title: '五、子目标／需求详细进展',
      columns: ['子目标', '任务', '计划完成', '责任人', '状态', '本周进展'],
      widths: [15, 21, 11, 8, 10, 35]
    },
    {
      key: 'problems',
      title: '六、问题单进展',
      columns: ['问题', '状态', '责任人', '处理进展', '下一步'],
      widths: [24, 10, 10, 30, 26]
    },
    {
      key: 'members',
      title: '七、项目成员',
      columns: ['姓名', '角色', '负责范围'],
      widths: [16, 24, 60]
    }
  ]
}
window.weeklyReports = [
  {
    period: '2026-10-05',
    label: '2026.10.05 — 10.09',
    project: '推理服务优化',
    projectVersion: 'v0.8',
    owner: '陈宁',
    start: '2026-10-05T00:00:00+08:00',
    endExclusive: '2026-10-10T00:00:00+08:00',
    collected: '2026-10-10T09:00:00+08:00',
    issuesComplete: true,
    risksKnown: true,
    verificationKnown: true,
    goals: [
      {
        id: 'G1',
        title: '降低在线推理延迟',
        deliverable: '完成批处理优化；同口径压测 P95 ≤ 120ms，完成高并发试运行',
        due: '10月12日',
        status: '待验收'
      },
      {
        id: 'G2',
        title: '保证服务稳定运行',
        deliverable: '修复重试和日志问题；验证告警能定位问题',
        due: '10月15日',
        status: '待验收'
      }
    ],
    progress: [
      {
        title: '推理性能',
        current: '批处理优化已交付，压测 P95 118ms；高并发试运行待完成。',
        next: '协调试运行环境，完成性能目标验收。'
      },
      {
        title: '服务稳定性',
        current: '重复请求问题修复并验证关闭；排障说明已更新；告警上下文问题已定位。',
        next: '修复上下文透传，补齐日志复现样本。'
      }
    ],
    risks: [
      {
        level: '中',
        description: '试运行环境未释放，可能影响10月12日交付。',
        action: '10月11日协调资源；必要时采用替代环境验证。',
        owner: '陈宁',
        due: '10月11日',
        status: '处理中'
      }
    ],
    milestones: [
      {
        title: '性能验证完成',
        due: '10月12日',
        condition: '压测与试运行记录齐备，维护人验收',
        status: '试运行待完成，有延期风险'
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
        due: '10月12日',
        owner: '陈宁',
        status: '待评审',
        progress: '优化已交付，P95 118ms，待目标验收。',
        next: '复核压测条件',
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
        due: '10月8日',
        owner: '陈宁',
        status: '已关闭',
        progress: '修复并通过复现验证，维护人关闭。',
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
        due: '10月14日',
        owner: '陈宁',
        status: '进行中',
        progress: '已复现，定位到上下文透传遗漏。',
        next: '修复透传并验证',
        events: [{ at: '2026-10-05', text: '问题复现与定位完成' }]
      },
      {
        id: 104,
        type: '需求',
        goal: 'G1',
        title: '高并发试运行',
        created: '2026-09-30',
        closed: null,
        due: '10月12日',
        owner: '陈宁',
        status: '阻塞',
        progress: '环境未到位，已登记交付风险。',
        next: '协调环境',
        events: [{ at: '2026-10-09', text: '环境未到位，登记节点延期风险' }]
      },
      {
        id: 105,
        type: '工作',
        goal: 'G2',
        title: '告警排障说明',
        created: '2026-10-06',
        closed: '2026-10-09',
        due: '10月9日',
        owner: '陈宁',
        status: '已关闭',
        progress: '说明已更新并核对。',
        next: '结合试运行反馈维护',
        events: [{ at: '2026-10-09', text: '说明核对完成，维护人关闭 Issue' }]
      },
      {
        id: 106,
        type: '问题',
        goal: 'G2',
        title: '少量请求的日志字段为空',
        created: '2026-09-28',
        closed: null,
        due: '10月14日',
        owner: '陈宁',
        status: '待办',
        progress: '本周无新增处理记录。',
        next: '补充复现样本',
        events: []
      }
    ],
    members: [
      { name: '陈宁', role: '项目维护与开发', scope: '推理性能、服务稳定性；开发、验证与交付协调' }
    ],
    sources: {
      fixture: true,
      system: 'CodeHub',
      project: '推理服务优化',
      plan: 'v0.8版本计划',
      metrics: '10月9日同模型、硬件与并发口径的压测记录：P95 118ms；目标待人验收。'
    }
  },
  {
    period: '2026-09-28',
    label: '2026.09.28 — 10.02',
    project: '推理服务优化',
    projectVersion: 'v0.8',
    owner: '陈宁',
    start: '2026-09-28T00:00:00+08:00',
    endExclusive: '2026-10-03T00:00:00+08:00',
    collected: '2026-10-03T09:00:00+08:00',
    issuesComplete: true,
    risksKnown: false,
    verificationKnown: false,
    goals: [
      {
        id: 'G1',
        title: '降低在线推理延迟',
        deliverable: '完成批处理优化；同口径压测 P95 ≤ 120ms，完成高并发试运行',
        due: '10月12日',
        status: '待验收'
      },
      {
        id: 'G2',
        title: '保证服务稳定运行',
        deliverable: '修复重试和日志问题；验证告警能定位问题',
        due: '10月15日',
        status: '待验收'
      }
    ],
    progress: [
      {
        title: '推理性能',
        current: '批处理优化开发中；性能验证结果未知。',
        next: '完成开发与评审，启动压测。'
      },
      {
        title: '服务稳定性',
        current: '重复请求问题已复现；日志字段问题待定位。',
        next: '完成重复请求修复，补充日志样本。'
      }
    ],
    risks: [],
    milestones: [],
    issues: [
      {
        id: 101,
        type: '需求',
        goal: 'G1',
        title: '批处理调度优化',
        created: '2026-09-25',
        closed: null,
        due: '10月12日',
        owner: '陈宁',
        status: '进行中',
        progress: '调度优化开发中，性能结果未知。',
        next: '完成评审与压测',
        events: [{ at: '2026-09-30', text: '批处理优化开发中' }]
      },
      {
        id: 102,
        type: '问题',
        goal: 'G2',
        title: '超时重试导致重复请求',
        created: '2026-09-26',
        closed: null,
        due: '10月8日',
        owner: '陈宁',
        status: '进行中',
        progress: '已复现，正在修复。',
        next: '完成修复与验证',
        events: [{ at: '2026-09-29', text: '重复请求问题复现完成' }]
      },
      {
        id: 104,
        type: '需求',
        goal: 'G1',
        title: '高并发试运行',
        created: '2026-09-30',
        closed: null,
        due: '10月12日',
        owner: '陈宁',
        status: '待办',
        progress: '已明确试运行范围。',
        next: '准备试运行环境',
        events: [{ at: '2026-09-30', text: '试运行需求登记' }]
      },
      {
        id: 106,
        type: '问题',
        goal: 'G2',
        title: '少量请求的日志字段为空',
        created: '2026-09-28',
        closed: null,
        due: '10月14日',
        owner: '陈宁',
        status: '待办',
        progress: '已登记，等待复现样本。',
        next: '补充样本',
        events: [{ at: '2026-09-28', text: '日志问题登记' }]
      }
    ],
    members: [
      { name: '陈宁', role: '项目维护与开发', scope: '推理性能、服务稳定性；开发、验证与交付协调' }
    ],
    sources: {
      fixture: true,
      system: 'CodeHub',
      project: '推理服务优化',
      plan: 'v0.8版本计划',
      metrics: null
    }
  }
]
