// #461 CI 屏评审草案数据：模块定义、场景状态、执行记录与递交指令。
// 状态机（人已拍板）：灰=未接入（主检出未见脚本）；黄=已接入·待执行/未启动（扫到脚本，
// 无记录或已停止）；绿=最近成功 / 运行中·最近一轮通过；红=最近失败 / 最近一轮报错。
// 停止→黄；最新结果决定绿红；历史报错永久保留。灯由真实读数推导，不可手设。

export const MODULES = [
  {
    id: 'deploy',
    name: '部署',
    short: '部署',
    kind: 'single',
    script: '.bw/ci/deploy.sh',
    skill: 'ci-ops · 部署',
    summary:
      '把已发布版本的安装包部署到指定环境（生产机器），完成后独立读回服务状态与版本并写执行记录。单次执行。'
  },
  {
    id: 'monitor',
    name: '监控',
    short: '监控',
    kind: 'poll',
    interval: '每 5 分钟',
    script: '.bw/ci/monitor.sh',
    skill: 'ci-ops · 监控',
    summary:
      '轮询检查整个服务的可用性（在线 / 离线、健康端点），每轮结果写记录。轮询执行，经 Orca 自动化到点开会话。'
  },
  {
    id: 'health',
    name: '故障检测',
    short: '检测',
    kind: 'poll',
    interval: '每 15 分钟',
    script: '.bw/ci/health-check.sh',
    skill: 'ci-ops · 故障检测',
    summary:
      '按指标与错误日志轮询检查关键功能是否报错；阈值与控制带判定，不用模型判断「有没有事」。轮询执行。'
  },
  {
    id: 'restart',
    name: '重启',
    short: '重启',
    kind: 'single',
    script: '.bw/ci/restart.sh',
    skill: 'ci-ops · 重启',
    summary:
      '服务不可用时，基于已发布版本的包快速重新拉起（同版本同环境，跳过完整检查，尽快恢复可用）。单次执行，人触发。'
  }
]

export const SCENARIOS = [
  ['first', '首次进入（全灰）'],
  ['armed', '已接入（全黄）'],
  ['running', '运行中（绿·红并存）'],
  ['healthy', '全部健康（历史保留）']
]

// 每场景四模块的灯态与最近执行；errors 由记录区推导，不单存。
export const sceneStates = {
  first: {
    deploy: { state: 'gray' },
    monitor: { state: 'gray' },
    health: { state: 'gray' },
    restart: { state: 'gray' }
  },
  armed: {
    deploy: { state: 'yellow' },
    monitor: { state: 'yellow' },
    health: { state: 'yellow' },
    restart: { state: 'yellow' }
  },
  running: {
    deploy: {
      state: 'green',
      last: { time: '14:20', ok: true, text: 'v1.4.198 · 用时 3 分 12 秒' }
    },
    monitor: {
      state: 'green',
      running: true,
      last: { time: '14:32', ok: true, text: '服务在线 · 内存 62%' }
    },
    health: {
      state: 'red',
      running: true,
      last: { time: '14:35', ok: false, text: '关键接口 /api/orders 连续超时 · 阈值 2 次越线' }
    },
    restart: { state: 'yellow' }
  },
  healthy: {
    deploy: {
      state: 'green',
      last: { time: '10:05', ok: true, text: 'v1.4.198 · 用时 3 分 05 秒' }
    },
    monitor: {
      state: 'green',
      running: true,
      last: { time: '14:40', ok: true, text: '服务在线 · 内存 61%' }
    },
    health: {
      state: 'green',
      running: true,
      last: { time: '14:38', ok: true, text: '错误日志 0 条 · 指标在控制带内' }
    },
    restart: {
      state: 'green',
      last: { time: '09:58', ok: true, text: '用时 38 秒 · 服务恢复在线' }
    }
  }
}

// 执行与报错记录（bw/ci 固定树本地，默认不上仓）。error 记录带 log，前端折叠回显。
export const sceneRecords = {
  first: [],
  armed: [],
  running: [
    {
      id: 'r1',
      time: '14:35',
      moduleId: 'health',
      ok: false,
      result: '发现异常',
      detail: '关键接口 /api/orders 连续超时（阈值 2 次越线）',
      log: '[14:35:01] GET /api/orders → 504 (upstream timeout after 30s)\n[14:35:01] GET /api/orders 重试 1 → 504\n[14:35:02] 判定：连续超时 2 次，越线（阈值 ≥2 次）\n[14:35:02] 结果：FAIL · 退出码 1 · 记录已写入 bw/ci 本地'
    },
    {
      id: 'r2',
      time: '14:32',
      moduleId: 'monitor',
      ok: true,
      result: '通过',
      detail: '服务在线 · 内存 62%'
    },
    {
      id: 'r3',
      time: '14:30',
      moduleId: 'monitor',
      ok: false,
      result: '报错',
      detail: '健康端点超时（重试后恢复，未越线）',
      log: '[14:30:02] GET /health → 超时（5s 无响应）\n[14:30:07] GET /health 重试 → 200 OK（86ms）\n[14:30:07] 判定：本轮报错 1 次，未越线（阈值 ≥3 次）\n[14:30:07] 结果：FAIL（单轮）· 退出码 1 · 记录已写入 bw/ci 本地'
    },
    {
      id: 'r4',
      time: '14:27',
      moduleId: 'health',
      ok: true,
      result: '通过',
      detail: '错误日志 0 条 · 指标在控制带内'
    },
    {
      id: 'r5',
      time: '14:22',
      moduleId: 'monitor',
      ok: true,
      result: '通过',
      detail: '服务在线 · 内存 58%'
    },
    {
      id: 'r6',
      time: '14:20',
      moduleId: 'deploy',
      ok: true,
      result: '成功',
      detail: 'v1.4.198 · 用时 3 分 12 秒'
    },
    {
      id: 'r7',
      time: '14:18',
      moduleId: 'deploy',
      ok: false,
      result: '失败',
      detail: '生产机 SSH 连接超时，部署中止（未改动任何文件）',
      log: '[14:18:03] ssh deploy@prod-03 "echo ok" → 连接超时 (10s)\n[14:18:14] 重试 1 → 连接超时\n[14:18:14] 判定：生产机不可达，部署中止\n[14:18:14] 结果：FAIL · 退出码 2 · 记录已写入 bw/ci 本地'
    },
    {
      id: 'r8',
      time: '14:15',
      moduleId: 'monitor',
      ok: true,
      result: '通过',
      detail: '服务在线 · 内存 55%'
    }
  ],
  healthy: [
    {
      id: 'h1',
      time: '14:40',
      moduleId: 'monitor',
      ok: true,
      result: '通过',
      detail: '服务在线 · 内存 61%'
    },
    {
      id: 'h2',
      time: '14:38',
      moduleId: 'health',
      ok: true,
      result: '通过',
      detail: '错误日志 0 条 · 指标在控制带内'
    },
    {
      id: 'h3',
      time: '10:05',
      moduleId: 'deploy',
      ok: true,
      result: '成功',
      detail: 'v1.4.198 · 用时 3 分 05 秒'
    },
    {
      id: 'h4',
      time: '09:58',
      moduleId: 'restart',
      ok: true,
      result: '成功',
      detail: '用时 38 秒 · 服务恢复在线'
    },
    {
      id: 'h5',
      time: '09:52',
      moduleId: 'restart',
      ok: false,
      result: '失败',
      detail: '重启后健康端点仍未恢复',
      log: '[09:52:41] 停止旧进程 → done (pid 2841)\n[09:52:44] 拉起服务 → done\n[09:52:49] GET /health → 超时（5s 无响应）\n[09:52:49] 判定：重启后健康端点未恢复\n[09:52:49] 结果：FAIL · 退出码 1 · 记录已写入 bw/ci 本地'
    },
    {
      id: 'h6',
      time: '09:47',
      moduleId: 'monitor',
      ok: false,
      result: '报错',
      detail: '服务离线（连接拒绝）',
      log: '[09:47:02] GET /health → 连接拒绝 (ECONNREFUSED)\n[09:47:07] GET /health 重试 → 连接拒绝\n[09:47:12] 判定：服务离线，本轮 FAIL\n[09:47:12] 结果：FAIL · 退出码 1 · 记录已写入 bw/ci 本地'
    },
    {
      id: 'h7',
      time: '09:30',
      moduleId: 'monitor',
      ok: true,
      result: '通过',
      detail: '服务在线 · 内存 57%'
    }
  ]
}

// 递交 CI 助手的指令文本（生产经 Orca 原生发送弹窗确认目标会话后发送）。
export const PROMPTS = {
  generate: (m) =>
    `按 ci-ops skill 的${m.name}模板，结合本项目实际代码（构建方式、部署入口、服务形态、运行环境）生成 ${m.script} 与使用说明，提交项目仓 PR 待人审合入 main。`,
  deploy:
    '执行主分支 .bw/ci/deploy.sh：把已发布版本的安装包部署到指定环境，完成后独立读回服务状态与版本并写执行记录。',
  monitorStart:
    '按 ci-ops skill 登记一条 Orca 自动化：每 5 分钟开会话执行 .bw/ci/monitor.sh 检查服务可用性，每轮结果写 bw/ci 本地记录。',
  monitorStop: '停用监控的自动化调度；已写记录保留，灯回到已接入·未启动。',
  healthStart:
    '按 ci-ops skill 登记一条 Orca 自动化：每 15 分钟开会话执行 .bw/ci/health-check.sh 检查关键功能报错，每轮结果写 bw/ci 本地记录。',
  healthStop: '停用故障检测的自动化调度；已写记录保留，灯回到已接入·未启动。',
  restart:
    '执行主分支 .bw/ci/restart.sh：基于已发布版本的包快速重新拉起服务（同版本同环境），完成后读回服务状态并写执行记录。'
}

export function dotClass(state) {
  return { gray: 'off', yellow: 'warn', green: 'ok', red: 'err' }[state] || 'off'
}

export function moduleStateText(m, s) {
  if (s.state === 'gray') {
    return '未接入'
  }
  if (s.state === 'yellow') {
    return m.kind === 'poll' ? '已接入 · 未启动' : '已接入 · 待执行'
  }
  if (s.state === 'green') {
    return m.kind === 'poll'
      ? s.running
        ? '运行中 · 最近一轮通过'
        : '最近一轮通过'
      : '最近执行成功'
  }
  return m.kind === 'poll' ? (s.running ? '运行中 · 最近一轮报错' : '最近一轮报错') : '最近执行失败'
}

export function navStateText(m, s) {
  if (s.state === 'gray') {
    return '未接入'
  }
  if (s.state === 'yellow') {
    return m.kind === 'poll' ? '未启动' : '待执行'
  }
  if (s.state === 'green') {
    return m.kind === 'poll' ? (s.running ? '运行中' : '通过') : '成功'
  }
  return m.kind === 'poll' ? '报错' : '失败'
}

// 各灯态下的板面按钮（图标+短动词统一格式；红态附报错记录入口）。
export function moduleButtons(m, s, errors) {
  if (s.state === 'gray') {
    return [{ key: 'generate', label: `生成${m.short}脚本` }]
  }
  if (m.kind === 'single') {
    if (s.state === 'yellow') {
      return [{ key: 'run', label: m.name }]
    }
    if (s.state === 'green') {
      return [{ key: 'run', label: `再次${m.name}` }]
    }
    return [
      { key: 'run', label: `重新${m.name}` },
      { key: 'errors', label: `报错记录 ${errors}` }
    ]
  }
  if (s.state === 'yellow') {
    return [{ key: 'start', label: `启动${m.short}` }]
  }
  return [
    { key: 'stop', label: `停止${m.short}` },
    ...(s.state === 'red' ? [{ key: 'errors', label: `报错记录 ${errors}` }] : [])
  ]
}
