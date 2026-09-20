/** Demo charter/scoreboard for Workbench overview — mirrors loop-buddy hifi overview. */
export const OVERVIEW_DEMO = {
  projectName: 'workbench',
  healthLabel: '未知',
  versionChip: 'v0.3 · 本周',
  charter: [
    {
      k: '想做什么',
      v: '1、所有项目都一样。 2、加速并规范项目运作。3、一张工作台打通所有系统，集成各种好用组件和工作流'
    },
    { k: '对标', v: 'Workbench', mono: true },
    { k: '目标方向', v: '更多的项目纳入到 workbench 管理' },
    { k: '项目群', v: 'WeLink · 群 996840920634630304 · 通知 merged + release' },
    { k: '远端', v: 'codehub · z30026659/workbench', mono: true }
  ] as const,
  northStar: {
    name: '(还没填)被 Workbench 纳入的项目是否又快又好',
    value: '—',
    target: '目标未设',
    status: 'Unknown'
  },
  versions: [
    {
      id: 'v03',
      label: 'v0.3 · 本周',
      state: '进行中' as const,
      goal: '再纳入 2 个真实项目；记分牌 6 条指标全接真数据；发版从 4 步变成 1 条命令。',
      weekNote: 'W38：CI 止血到 75%；09-18 发版；接第 2 个真实项目。#158 顺延 W39。',
      counts: { todo: 2, doing: 1, review: 0, done: 2, blocked: 1 }
    },
    {
      id: 'v02',
      label: 'v0.2',
      state: '已发版' as const,
      goal: '跑通周一对齐旅程；总览名片 + 北极星可读。',
      weekNote: '已发：周一对齐原型合入；记分牌先接 4 条真数据。',
      counts: { todo: 0, doing: 0, review: 0, done: 5, blocked: 0 }
    }
  ]
} as const
