// #461 CI 屏评审草案数据：部署模块定义、场景状态、执行记录与递交指令。
// 2026-10-28 评审收敛：只做部署模块（监控/故障检测/重启转后续演进）。
// 状态机（人已拍板）：灰=未接入（主检出未见脚本）；黄=已接入·待执行；绿=最近一次成功；
// 红=最近一次失败。最新结果决定绿红；历史报错永久保留。灯由真实读数推导，不可手设。
// 板面不铺说明文本（2026-10-28 人反馈）：模块语义、脚本路径、扫描机制等工作机制
// 收在按钮提示与 ci-ops skill 正本，模型只留驱动状态与动作所需的数据。
// 递交指令文本与 skill-deploy.md 的「递交 prompt 真实文本」表逐字一致——改文本等于改行为。

export const MODULES = [
  {
    id: 'deploy',
    name: '部署',
    short: '部署',
    kind: 'single',
    script: '.bw/ci/deploy.sh'
  }
]

export const SCENARIOS = [
  ['first', '首次进入（灰）'],
  ['armed', '已接入（黄）'],
  ['success', '部署成功（绿·历史保留）'],
  ['failed', '最近失败（红）']
]

// 每场景部署灯态与最近执行；errors 由记录区推导，不单存。
export const sceneStates = {
  first: {
    deploy: { state: 'gray' }
  },
  armed: {
    deploy: { state: 'yellow' }
  },
  success: {
    deploy: {
      state: 'green',
      last: { time: '14:20', ok: true, text: '版本 1.4.198 · 全程 3 分 12 秒' }
    }
  },
  failed: {
    deploy: {
      state: 'red',
      last: { time: '14:18', ok: false, text: '生产机 SSH 连接超时，部署中止' }
    }
  }
}

// 执行与报错记录（bw/ci 固定树本地，默认不上仓）。error 记录带 log，前端折叠回显。
// 字段口径对齐 skill-deploy.md 记录协议：结果摘要人话，报错附日志原文。
export const sceneRecords = {
  first: [],
  armed: [],
  success: [
    {
      id: 's1',
      time: '14:20',
      moduleId: 'deploy',
      ok: true,
      result: '成功',
      detail: '版本 1.4.198 · 全程 3 分 12 秒 · /healthz 200'
    },
    {
      id: 's2',
      time: '11:02',
      moduleId: 'deploy',
      ok: true,
      result: '成功',
      detail: '版本 1.4.197 · 全程 3 分 40 秒 · /healthz 200'
    },
    {
      id: 's3',
      time: '09:15',
      moduleId: 'deploy',
      ok: false,
      result: '失败',
      detail: '版本包构建失败：单测未过，部署未开始',
      log: '[09:15:44] npm test → 2 failing\n[09:15:44]   ● api › orders 用例超时\n[09:15:45] 判定：构建段失败，未触碰目标环境\n[09:15:45] 结果：FAIL · 退出码 1 · 记录已写入 bw/ci 本地'
    }
  ],
  failed: [
    {
      id: 'f1',
      time: '14:18',
      moduleId: 'deploy',
      ok: false,
      result: '失败',
      detail: '生产机 SSH 连接超时，部署中止（未改动任何文件）',
      log: '[14:18:03] ssh deploy@prod-03 "echo ok" → 连接超时 (10s)\n[14:18:14] 重试 1 → 连接超时\n[14:18:14] 判定：生产机不可达，部署中止\n[14:18:14] 结果：FAIL · 退出码 2 · 记录已写入 bw/ci 本地'
    },
    {
      id: 'f2',
      time: '10:05',
      moduleId: 'deploy',
      ok: true,
      result: '成功',
      detail: '版本 1.4.198 · 全程 3 分 05 秒 · /healthz 200'
    }
  ]
}

// 递交 CI 助手的指令文本（生产经 Orca 原生发送弹窗确认目标会话后发送）。
// 与 skill-deploy.md「递交 prompt 真实文本」逐字一致，评审改文本两处同步。
export const PROMPTS = {
  generate: (m) =>
    `按 ci-ops skill 为本项目生成 ${m.script}：先勘察项目实际代码与已有部署资产（构建方式、服务形态、探针口径、目标环境），已有资产编排复用、缺失环节按模板生成；执行后必须独立读回服务状态与版本并写 .bw/ci/records.jsonl 记录，失败如实写 ok:false 与日志。完成后提 PR 经人审合入 main，不直接改 main。`,
  deploy:
    '执行本项目的 .bw/ci/deploy.sh：构建版本包 → 部署到指定环境 → 独立读回服务状态与版本 → 写执行记录。按记录协议把结果追加进 .bw/ci/records.jsonl，失败如实写 ok:false 与日志，不重试到绿。'
}

export function dotClass(state) {
  return { gray: 'off', yellow: 'warn', green: 'ok', red: 'err' }[state] || 'off'
}

export function moduleStateText(m, s) {
  if (s.state === 'gray') {
    return '未接入'
  }
  if (s.state === 'yellow') {
    return '已接入 · 待执行'
  }
  if (s.state === 'green') {
    return '最近一次成功'
  }
  return '最近一次失败'
}

// 各灯态下的板面按钮（图标+短动词统一格式；红态附报错记录入口）。
export function moduleButtons(m, s, errors) {
  if (s.state === 'gray') {
    return [{ key: 'generate', label: `生成${m.short}脚本` }]
  }
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
