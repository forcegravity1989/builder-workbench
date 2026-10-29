// CI 部署原型数据模型：模块、四阶段六步流程、两种模式、版本登记、配置事实、每步读数与演示日志、初始全量状态与记录、递交指令文本。
// 流程骨架与 spec.md「部署流程：四阶段六步」、skill-deploy.md「部署流程契约」逐字对齐；
// PROMPTS 与 skill-deploy.md 递交文本表逐字一致（verify-ci.cjs 有断言盯住）。
// 评审反馈（2026-10-29）：不做场景切换，进入即呈现已接入后的全量形态。

export const MODULES = [
  { id: 'deploy', name: '部署', short: '部署', kind: 'single', script: '.bw/ci/deploy.sh' }
]

export const MODES = [
  ['dev', '开发'],
  ['release', '上线']
]

// 四阶段六步：软件包准备在最前——没有可用包（或未配置启动命令）时失败发生在清场之前。
export const FLOW = [
  {
    id: 'pkg',
    phase: '部署前准备',
    name: '软件包准备',
    dev: '校验启动命令已配置',
    release: '校验所选版本包存在可读'
  },
  {
    id: 'precheck',
    phase: '部署前准备',
    name: '预检',
    dev: '端口占用、旧实例探测（旧实例≠失败，是待清场）',
    release: 'ssh 连通、磁盘余量 ≥ 包大小×2、目标目录存在'
  },
  {
    id: 'cleanup',
    phase: '部署前准备',
    name: '清场',
    dev: '杀本地旧进程、等端口释放',
    release: '远端停服务'
  },
  {
    id: 'deploy',
    phase: '开始部署',
    name: '部署',
    dev: '执行启动命令拉起服务',
    release: '上传包 → 远端解包 → 按项目方式启动'
  },
  {
    id: 'verify',
    phase: '部署后验证',
    name: '验证',
    dev: '本地探针（未配探针退化为进程存活）',
    release: '远端探针读回 + 部署目录版本 = 所选包版本'
  },
  {
    id: 'record',
    phase: '归档',
    name: '记录',
    dev: '写 records.jsonl（模式、版本、各步结果、失败步定位、耗时）',
    release: '同左'
  }
]

export const FLOW_PHASES = ['部署前准备', '开始部署', '部署后验证', '归档']

// 上线版本登记（演示数据）：来自各版本验收材料的包登记（版本 → 包路径），默认最新；包不存在灰掉不隐藏。
export const VERSIONS = [
  {
    version: '1.4.201',
    pkg: 'dist/app-1.4.201-20261029_0930.7z',
    time: '10-29 09:30',
    available: true
  },
  {
    version: '1.4.199',
    pkg: 'dist/app-1.4.199-20261028_1841.7z',
    time: '10-28 18:41',
    available: true
  },
  {
    version: '1.4.197',
    pkg: 'dist/app-1.4.197-20261026_1102.7z',
    time: '10-26 11:02',
    available: false
  }
]

// 配置事实（演示数据全为已配置）：随模式显示对应配置项，板面只显示「已配置/未配置」，内容收在会话与资产。
export const CONFIG_FACTS = {
  dev: [
    ['启动命令', true],
    ['探针', true]
  ],
  release: [
    ['服务器信息', true],
    ['探针', true]
  ]
}

const okSteps = {
  pkg: 'ok',
  precheck: 'ok',
  cleanup: 'ok',
  deploy: 'ok',
  verify: 'ok',
  record: 'ok'
}

// 每步读数（演示数据）：一行事实随步骤完成进板面；对应记录协议的 readings 字段。
export const stepReadings = (mode, version) =>
  mode === 'dev'
    ? {
        pkg: '启动命令已配置（npm start · 端口 8025）',
        precheck: '端口 8025 空闲',
        cleanup: '无旧进程，端口已确认释放',
        deploy: '执行 npm start · 进程 5678 拉起 3 秒未退',
        verify: '本地探针 /healthz 200',
        record: '已写 .bw/ci/records.jsonl'
      }
    : {
        pkg: `dist/app-${version}-20261029_0930.7z 存在可读 · 12.4 MB`,
        precheck: 'ssh 连通 · 磁盘余量 8.2 GB ≥ 包×2 · /opt/app 存在',
        cleanup: '远端 app.service 已停止',
        deploy: '上传 12.4 MB → 解包 → systemctl restart app · 退出码 0',
        verify: `/healthz 200 · 部署目录版本 ${version} = 所选 ${version}`,
        record: '已写 .bw/ci/records.jsonl'
      }

// 最近一次执行的整段日志（演示数据）：流程块头「日志」开关页内回显。
export const successLog = (mode, version) =>
  mode === 'dev'
    ? `[ci-step] pkg start
[ci-step] pkg ok
[ci-step] precheck start
netstat -ano | findstr :8025 → 端口空闲
[ci-step] precheck ok
[ci-step] cleanup start
taskkill → 无旧进程，端口已确认释放
[ci-step] cleanup ok
[ci-step] deploy start
npm start → 进程 5678 拉起，3 秒未退
[ci-step] deploy ok
[ci-step] verify start
curl -fsS http://127.0.0.1:8025/healthz → 200 {"ok":true}
[ci-step] verify ok
[ci-step] record start
[ci-step] record ok`
    : `[ci-step] pkg start
[ci-step] pkg ok
[ci-step] precheck start
ssh deploy@192.168.1.30 "df -h /opt && test -d /opt/app" → 磁盘 8.2G 可用，目录存在
[ci-step] precheck ok
[ci-step] cleanup start
ssh deploy@192.168.1.30 "systemctl stop app"
[ci-step] cleanup ok
[ci-step] deploy start
scp dist/app-${version}-20261029_0930.7z deploy@192.168.1.30:/opt/app/
ssh deploy@192.168.1.30 "cd /opt/app && tar xf app-${version}-20261029_0930.7z && systemctl restart app" → 退出码 0
[ci-step] deploy ok
[ci-step] verify start
curl -fsS http://192.168.1.30:8025/healthz → 200 {"ok":true}
部署目录版本 ${version} = 所选 ${version}
[ci-step] verify ok
[ci-step] record start
[ci-step] record ok`

// 进入即全量：已接入后的成熟状态（最近一次上线成功，六步全过、每步读数），历史含成功与失败记录。
export const initialState = {
  deploy: {
    state: 'green',
    steps: okSteps,
    readings: stepReadings('release', '1.4.201'),
    last: {
      time: '10-29 09:41',
      ok: true,
      mode: 'release',
      version: '1.4.201',
      text: '上线 · 版本 1.4.201 · 全程 3 分 08 秒',
      log: successLog('release', '1.4.201')
    }
  }
}

const failLog = `[ci-step] pkg ok
[ci-step] precheck ok
[ci-step] cleanup ok
[ci-step] deploy start
ssh deploy@192.168.1.30 "cd /opt/app && tar xf app-1.4.199.tar.gz && systemctl restart app"
Job for app.service failed because the control process exited with error code (1)
[ci-step] deploy fail`

export const initialRecords = [
  {
    id: 'r-5',
    time: '10-29 09:41',
    moduleId: 'deploy',
    ok: true,
    mode: 'release',
    version: '1.4.201',
    result: '成功',
    detail: '版本 1.4.201 · 全程 3 分 08 秒 · /healthz 200'
  },
  {
    id: 'r-4',
    time: '10-29 09:12',
    moduleId: 'deploy',
    ok: true,
    mode: 'dev',
    version: null,
    result: '成功',
    detail: '全程 42 秒 · 本地探针 200'
  },
  {
    id: 'r-3',
    time: '10-28 18:55',
    moduleId: 'deploy',
    ok: false,
    mode: 'release',
    version: '1.4.199',
    result: '失败',
    detail: '第 4 步「部署」失败：远端解包后启动退出码 1',
    failedStep: 'deploy',
    log: failLog
  },
  {
    id: 'r-2',
    time: '10-28 18:41',
    moduleId: 'deploy',
    ok: true,
    mode: 'release',
    version: '1.4.199',
    result: '成功',
    detail: '版本 1.4.199 · 全程 4 分 11 秒 · /healthz 200'
  }
]

// 递交 prompt 真实文本：与 skill-deploy.md「递交 prompt 真实文本」表逐字一致。
export const PROMPTS = {
  generate: () =>
    '按 ci-ops skill 为本项目生成 .bw/ci/deploy.sh：先勘察项目实际代码与已有部署资产（构建方式、服务形态、探针口径、目标环境），已有资产编排复用、缺失环节按模板生成；按四阶段六步骨架（软件包准备→预检→清场→部署→验证→记录）编排，软件包准备必须在清场之前；执行时按步骤标记协议输出 [ci-step] 进度，执行后必须独立读回服务状态与版本并写 .bw/ci/records.jsonl 记录，失败如实写 ok:false 与 failedStep。完成后提 PR 经人审合入 main，不直接改 main。',
  configure: () =>
    '按 ci-ops skill 配置本项目部署所需资产：开发启动命令与端口、探针 URL、上线服务器信息（IP/用户/上传路径）。已有配置先从项目资产读出来给我确认，缺失或要改的向我收集；配置写进项目资产随 .bw/ci/deploy.sh 同审合入。密码不进配置，只在部署执行时输入。',
  deployDev: () =>
    '执行本项目的 .bw/ci/deploy.sh --mode=dev：软件包准备（校验启动命令）→ 预检（端口/旧实例）→ 清场（杀旧进程）→ 部署（执行启动命令）→ 验证（独立读回服务状态）→ 记录。按记录协议把结果追加进 .bw/ci/records.jsonl（mode=dev），失败如实写 ok:false 与 failedStep，不重试到绿。',
  deployRelease: (version) =>
    `执行本项目的 .bw/ci/deploy.sh --mode=release --version=${version}：软件包准备（校验所选包）→ 预检（连通/磁盘/目录）→ 清场（远端停服务）→ 部署（上传解包启动）→ 验证（探针读回+版本核对）→ 记录。按记录协议把结果追加进 .bw/ci/records.jsonl（mode=release、version=${version}），失败如实写 ok:false 与 failedStep，不重试到绿。`,
  retry: (mode, version, failedStep) =>
    `执行本项目的 .bw/ci/deploy.sh --mode=${mode} --version=${version} --from=${failedStep}：从失败步起跑，之前步骤不重复执行；结果按记录协议追加进 .bw/ci/records.jsonl，失败仍如实写 ok:false 与 failedStep。`,
  stop: () => '执行 bash .bw/ci/deploy.sh --stop，停掉本机监督实例并确认端口释放；结果如实回报。'
}

export const dotClass = (state) =>
  ({ gray: 'off', yellow: 'wait', green: 'ok', red: 'err' })[state] || 'off'

// 红态带步序定位：与流程条数字徽章、记录文案（第 N 步）同用一套序号。
export const moduleStateText = (module, state) => {
  if (state.state === 'red') {
    const idx = FLOW.findIndex((s) => s.id === state.failedStep)
    return idx !== -1 ? `最近一次失败 · 停在第 ${idx + 1} 步` : '最近一次失败'
  }
  return (
    {
      gray: '未接入',
      yellow: '已接入 · 待执行',
      green: '最近一次成功'
    }[state.state] || '未知'
  )
}

export const moduleButtons = (module, state, errors) => {
  if (state.state === 'gray') {
    return [{ key: 'generate', label: '生成部署脚本' }]
  }
  if (state.state === 'yellow') {
    return [{ key: 'run', label: '部署' }]
  }
  if (state.state === 'green') {
    return [
      { key: 'run', label: '再次部署' },
      ...(errors ? [{ key: 'errors', label: `报错记录 ${errors}` }] : [])
    ]
  }
  // red：从失败步重试 + 报错定位
  return [
    { key: 'retry', label: '从失败步重试' },
    ...(errors ? [{ key: 'errors', label: `报错记录 ${errors}` }] : [])
  ]
}
