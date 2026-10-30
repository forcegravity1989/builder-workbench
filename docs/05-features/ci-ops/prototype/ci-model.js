// CI 部署原型数据模型：模块、四阶段六步流程、两种模式、版本登记、配置事实、每步读数/时间/日志、
// 初始灯态与执行记录（含失败步数据）、记录→流程视图推导（九轮：流程块按所选记录渲染）、递交指令文本。
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

const okSteps = {
  pkg: 'ok',
  precheck: 'ok',
  cleanup: 'ok',
  deploy: 'ok',
  verify: 'ok',
  record: 'ok'
}

// 上线包路径从版本登记取（验收包登记是正源）：读数/命令/日志引用同一份，历史记录按各自版本对得上号。
const pkgOf = (version) =>
  VERSIONS.find((v) => v.version === version)?.pkg || `dist/app-${version}.7z`
const pkgNameOf = (version) => pkgOf(version).split('/').pop()

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
        pkg: `${pkgOf(version)} 存在可读 · 12.4 MB`,
        precheck: 'ssh 连通 · 磁盘余量 8.2 GB ≥ 包×2 · /opt/app 存在',
        cleanup: '远端 app.service 已停止',
        deploy: '上传 12.4 MB → 解包 → systemctl restart app · 退出码 0',
        verify: `/healthz 200 · 部署目录版本 ${version} = 所选 ${version}`,
        record: '已写 .bw/ci/records.jsonl'
      }

// 每步将执行的命令（演示数据，对应 deploy.sh 按步分段）：流程块「命令」开关页内回显，纠错核对不经会话。
export const stepCommands = (mode, version) =>
  mode === 'dev'
    ? {
        pkg: ['test -n "$BW_CI_START_CMD"  # 启动命令已配置'],
        precheck: ['netstat -ano | findstr :8025'],
        cleanup: ['taskkill /F /PID $OLD_PID 2>/dev/null || true', 'sleep 1  # 等端口释放'],
        deploy: ['npm start > .bw/ci/logs/dev-server.log 2>&1 &'],
        verify: ['curl -fsS http://127.0.0.1:8025/healthz'],
        record: ['printf \'%s\\n\' "$record" >> .bw/ci/records.jsonl']
      }
    : {
        pkg: [`test -r "${pkgOf(version)}" && du -h "${pkgOf(version)}"`],
        precheck: ['ssh deploy@192.168.1.30 "df -h /opt && test -d /opt/app"'],
        cleanup: ['ssh deploy@192.168.1.30 "systemctl stop app"'],
        deploy: [
          `scp ${pkgOf(version)} deploy@192.168.1.30:/opt/app/`,
          `ssh deploy@192.168.1.30 "cd /opt/app && tar xf ${pkgNameOf(version)} && systemctl restart app"`
        ],
        verify: [
          'curl -fsS http://192.168.1.30:8025/healthz',
          'ssh deploy@192.168.1.30 "cat /opt/app/VERSION"  # 版本核对'
        ],
        record: ['printf \'%s\\n\' "$record" >> .bw/ci/records.jsonl']
      }

// 每步日志（演示数据，按步骤分段）：「日志」开关页内按步回显，不再整段一块（评审反馈八轮）。
export const stepLogs = (mode, version) =>
  mode === 'dev'
    ? {
        pkg: '[ci-step] pkg start\n[ci-step] pkg ok',
        precheck:
          '[ci-step] precheck start\nnetstat -ano | findstr :8025 → 端口空闲\n[ci-step] precheck ok',
        cleanup:
          '[ci-step] cleanup start\ntaskkill → 无旧进程，端口已确认释放\n[ci-step] cleanup ok',
        deploy: '[ci-step] deploy start\nnpm start → 进程 5678 拉起，3 秒未退\n[ci-step] deploy ok',
        verify:
          '[ci-step] verify start\ncurl -fsS http://127.0.0.1:8025/healthz → 200 {"ok":true}\n[ci-step] verify ok',
        record: '[ci-step] record start\n[ci-step] record ok'
      }
    : {
        pkg: '[ci-step] pkg start\n[ci-step] pkg ok',
        precheck:
          '[ci-step] precheck start\nssh deploy@192.168.1.30 "df -h /opt && test -d /opt/app" → 磁盘 8.2G 可用，目录存在\n[ci-step] precheck ok',
        cleanup:
          '[ci-step] cleanup start\nssh deploy@192.168.1.30 "systemctl stop app"\n[ci-step] cleanup ok',
        deploy: `[ci-step] deploy start\nscp ${pkgOf(version)} deploy@192.168.1.30:/opt/app/\nssh deploy@192.168.1.30 "cd /opt/app && tar xf ${pkgNameOf(version)} && systemctl restart app" → 退出码 0\n[ci-step] deploy ok`,
        verify: `[ci-step] verify start\ncurl -fsS http://192.168.1.30:8025/healthz → 200 {"ok":true}\n部署目录版本 ${version} = 所选 ${version}\n[ci-step] verify ok`,
        record: '[ci-step] record start\n[ci-step] record ok'
      }

// 进入即全量：已接入后的成熟状态（最近一次上线成功），历史含成功与失败记录；
// 九轮起流程块视图从所选记录推导（recordFlowView），灯态只留颜色与失败步定位。
export const initialState = {
  deploy: {
    state: 'green'
  }
}

// 历史报错（r-3）失败步的日志段：显示在流程第 4 步「部署」的日志区，不再经记录区展开。
const failLog = `[ci-step] deploy start
ssh deploy@192.168.1.30 "cd /opt/app && tar xf app-1.4.199.tar.gz && systemctl restart app"
Job for app.service failed because the control process exited with error code (1)
[ci-step] deploy fail`

// 执行记录（演示数据，按时间倒序）：九轮起每条记录带每步时间（times）与失败步数据（steps/failedStep/cause/log），
// 流程块按所选记录渲染（recordFlowView）；历史下拉只列最近 10 条。
export const initialRecords = [
  {
    id: 'r-5',
    time: '10-29 09:41',
    moduleId: 'deploy',
    ok: true,
    mode: 'release',
    version: '1.4.201',
    result: '成功',
    detail: '版本 1.4.201 · 全程 3 分 08 秒 · /healthz 200',
    times: {
      pkg: '09:38',
      precheck: '09:39',
      cleanup: '09:40',
      deploy: '09:40',
      verify: '09:41',
      record: '09:41'
    }
  },
  {
    id: 'r-4',
    time: '10-29 09:12',
    moduleId: 'deploy',
    ok: true,
    mode: 'dev',
    version: null,
    result: '成功',
    detail: '全程 42 秒 · 本地探针 200',
    times: {
      pkg: '09:11',
      precheck: '09:11',
      cleanup: '09:12',
      deploy: '09:12',
      verify: '09:12',
      record: '09:12'
    }
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
    cause: '远端解包后启动退出码 1',
    failedStep: 'deploy',
    steps: { pkg: 'ok', precheck: 'ok', cleanup: 'ok', deploy: 'fail' },
    times: { pkg: '18:52', precheck: '18:53', cleanup: '18:54', deploy: '18:55' },
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
    detail: '版本 1.4.199 · 全程 4 分 11 秒 · /healthz 200',
    times: {
      pkg: '18:38',
      precheck: '18:39',
      cleanup: '18:40',
      deploy: '18:40',
      verify: '18:41',
      record: '18:41'
    }
  }
]

// 记录结果短标（历史下拉条目用）：失败带步序定位，与流程条数字徽章同用一套序号。
export const recordResultText = (record) => {
  if (record.ok) {
    return '✓ 成功'
  }
  const idx = FLOW.findIndex((s) => s.id === record.failedStep)
  return idx !== -1 ? `✗ 第 ${idx + 1} 步「${FLOW[idx].name}」失败` : '✗ 失败'
}

// 记录 → 流程块视图（九轮：流程块按所选记录渲染）：成功记录按模式/版本模板推导每步读数与日志；
// 失败记录只带已完成步的读数与日志，失败步日志取记录自带日志段，其后步骤未开始。
export const recordFlowView = (record) => {
  const templateReadings = stepReadings(record.mode, record.version)
  const templateLogs = stepLogs(record.mode, record.version)
  if (record.ok) {
    return {
      steps: { ...okSteps },
      times: record.times || {},
      readings: templateReadings,
      logs: templateLogs,
      failedStep: undefined,
      cause: undefined
    }
  }
  const readings = {}
  const logs = {}
  for (const s of FLOW) {
    if (record.steps?.[s.id] === 'ok') {
      readings[s.id] = templateReadings[s.id]
      logs[s.id] = templateLogs[s.id]
    }
  }
  if (record.failedStep) {
    logs[record.failedStep] = record.log
  }
  return {
    steps: record.steps || {},
    times: record.times || {},
    readings,
    logs,
    failedStep: record.failedStep,
    cause: record.cause
  }
}

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

// 动作按钮（八轮反馈）：非灰态主动作（部署/从失败步重试）进模式行「配置」旁；灰态单独动作行给生成入口。
// 报错不经按钮——历史报错显示在流程列表对应步骤（在哪用在哪显示）。
export const moduleButtons = (module, state) => {
  if (state.state === 'gray') {
    return [{ key: 'generate', label: '生成部署脚本' }]
  }
  if (state.state === 'red') {
    return [{ key: 'retry', label: '从失败步重试' }]
  }
  return [{ key: 'run', label: '部署' }]
}
