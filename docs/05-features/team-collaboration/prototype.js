// Design simulation only. No account, provider, runtime or repository operations.
const S = (title, desc, card, meta, state, action, system, result) => ({
  title,
  desc,
  card,
  meta,
  state,
  action,
  system,
  result
})
const journeys = [
  {
    title: '第一次使用 · 接受邀请',
    desc: '陈邀请林加入研发组。林安装 BW 后直接回到邀请，不需要先共享电脑。',
    context: '邀请 / 研发组',
    boundary: '新增：团队邀请与目录。复用：原生克隆、本人 Git 身份与工作区。邀请链接不含设备授权。',
    steps: [
      S(
        '陈邀请你加入研发组',
        '先确认邀请来自谁、将加入哪个团队。没有安装时，安装后可粘贴原邀请继续。',
        '研发组',
        '邀请人 陈 · 推荐项目 顺风耳',
        '待接受',
        '确认本人身份',
        '通过组织身份登录，将稳定 subject 与邀请接收身份核对；显示名不作身份。',
        '邀请上下文保留；尚未入组或授予主机访问。'
      ),
      S(
        '使用林的身份加入',
        '加入后可以发现团队项目。代码和工作区访问按各自权限判断。',
        '林 → 研发组',
        '成员 · 此邀请仅使用一次',
        '身份已核对',
        '接受邀请',
        '服务校验邀请有效期并幂等创建成员资格；超时先读回是否已加入。',
        '团队目录可读；未配置共享主机。'
      ),
      S(
        '你的团队项目',
        '先选择要参与的工作。项目目录不依赖陈的电脑在线。',
        '顺风耳',
        '负责人 陈 · API / Web 两个代码仓',
        '可发现',
        '在本机开始',
        '按团队项目 ID 找到仓库引用，核对本人 Git 访问与已有本机检出。',
        '已确定项目；还没有创建重复目录。'
      ),
      S(
        '准备本机工作区',
        '当前电脑没有此代码仓。原生克隆流程会让你确认目录。',
        '顺风耳 / API',
        '本机 Windows · 本人 Git 账号',
        '需要克隆',
        '克隆并打开',
        '交接原生 AddRepoDialog；复用克隆进度、错误与取消，再登记 ProjectHostSetup。',
        '成功后留下本机检出；失败可重试，不冒充就绪。'
      ),
      S(
        '开始第一件工作',
        '原生工作区／会话复用示意。需要模型时再完成智能体准备。',
        '修复订单重复通知',
        '林 · 本机 Windows · 独立工作树',
        '已就绪',
        '完成本旅程',
        '沿原生创建器准备任务工作树；不跳到陈的机器，不自动把任务标完成。',
        '加入团队 → 发现项目 → 本机开工，完整闭环。'
      )
    ]
  },
  {
    title: '第一次使用 · 创建团队',
    desc: '发起者建立协作目录，把已有项目放进去，再邀请同伴。',
    context: '创建团队',
    boundary: '新增最小管理员职责；团队创建者不自动取得别人的 Git 或主机权限。',
    steps: [
      S(
        '你想怎样开始？',
        '加入团队、创建团队、先做自己的项目都是有效起点。',
        '创建团队',
        '已有团队可使用邀请；个人工作可跳过团队',
        '自由选择',
        '创建研发组',
        '登录后以幂等请求创建团队和首位管理员；网络失败保留名称。',
        '一个稳定团队 ID 与一位管理员。'
      ),
      S(
        '把第一个项目放进团队',
        '可选择本机已有仓库，也可以打开或克隆。现在不需要共享机器。',
        '顺风耳',
        '选择已有 API / Web 仓库',
        '待发布',
        '查看共享内容',
        '预览项目名、负责人、仓库地址和材料主仓；不上传个人路径或会话。',
        '明确共享范围与材料来源。'
      ),
      S(
        '确认发布到研发组',
        '团队成员将能发现这个项目。Git 平台继续决定谁能读代码。',
        '顺风耳',
        '共享目录与仓库引用 · 未共享工作区',
        '已核对',
        '发布并创建邀请',
        '写入目录版本；邀请绑定团队与接收身份，不携带宿主 token。',
        '项目可发现，生成可撤销邀请。'
      ),
      S(
        '邀请已经准备好',
        '由你将邀请发给同伴。对方可在自己的机器上开始工作。',
        '邀请林加入研发组',
        '有效期 7 天（提议）· 单次接受',
        '待对方接受',
        '完成本旅程',
        '创建邀请只记录邀请事实；点击复制不算对方加入。',
        '管理员可查看待接受／已接受／过期状态。'
      )
    ]
  },
  {
    title: '第一次使用 · 直接做项目',
    desc: '个人使用完整可用。团队不是开始工作的门槛。',
    context: '我的项目',
    boundary: '复用现有添加与工作区；只有以后主动加入协作才需要团队身份。',
    steps: [
      S(
        '先做自己的项目',
        '不用填写团队，也不用配置远程主机。',
        '打开本地项目',
        '已有 Git 仓或普通文件夹',
        '可开始',
        '打开项目',
        '复用原生打开／新建入口和路径授权。',
        '仓库或文件夹在自己的项目墙可见。'
      ),
      S(
        '准备你要用的智能体',
        '仅在开始模型任务时核对本机依赖。已有配置直接复用。',
        '本机工作区',
        '默认智能体 · 需要时登录',
        '按需准备',
        '开始工作',
        '交接现有 OnboardingFlow 和原生会话；可跳过可选集成。',
        '无需团队即可执行自己的工作。'
      ),
      S(
        '后来需要同伴协作',
        '从当前项目菜单选择共享到团队；不重新导入代码。',
        '我的顺风耳项目',
        '原工作树和会话完整保留',
        '待关联',
        '选择研发组',
        '已加入团队则选目标；没有则创建／接受邀请，再执行 J04 发布。',
        '已有工作与新的协作关系连接起来。'
      )
    ]
  },
  {
    title: '老项目 · 共享到团队',
    desc: '发布的是稳定项目入口，不是把整台电脑交给团队。',
    context: '研发组 / 共享项目',
    boundary: '协作目录与 Git 名片职责分开：目录保存引用和版本化缓存，名片修改仍走 PR/MR。',
    steps: [
      S(
        '选择要共享的项目',
        '普通文件夹若无 Git 远端，须先接代码源或选择受控远端查看。',
        '顺风耳',
        '本机 Git 项目 · 已有两个仓库',
        '可发布',
        '选择目标团队',
        '验证本人团队管理资格与可发布范围；普通成员可向管理员申请。',
        '尚未改变其他人的可见内容。'
      ),
      S(
        '预览大家会看到什么',
        '项目名称、负责人、仓库地址。不会共享个人目录、智能体密钥和私有会话。',
        '顺风耳 · 陈负责',
        'API + Web · 材料主仓 API',
        '范围已明确',
        '确认发布',
        '将协作项目 UUID 与原生仓库身份关联；同名不自动当作同仓。',
        '一次目录变更，不创建远程执行授权。'
      ),
      S(
        '同伴刷新后看见项目',
        '林可以选择已有本机副本或克隆。陈离线不会让项目从目录消失。',
        '顺风耳',
        '团队可发现 · Git 权限另行核验',
        '已发布',
        '完成本旅程',
        '通过目录事件／下次刷新同步；同一团队项目只显示一张卡。',
        '发布 → 同伴发现 → 自己机器参与。'
      )
    ]
  },
  {
    title: '老用户 · 打开与刷新',
    desc: '先继续工作，再同步变化；刷新不暗中拉代码或切主机。',
    context: '研发组 / 项目目录',
    boundary: '服务缓存按账号、团队与来源隔离。部分失败保留对应旧快照；撤销信息优先于缓存。',
    steps: [
      S(
        '欢迎回来，林',
        '恢复昨天的本机工作区。项目目录先显示上次可读内容。',
        '顺风耳',
        '本机工作区仍在 · 目录上次更新 09:20',
        '正在核验',
        '刷新团队项目',
        '先验证成员资格，再请求目录版本与增量；现有会话不被中断。',
        '工作先恢复，缓存明确带时间。'
      ),
      S(
        '团队增加了一个项目',
        '研发组新增知识助手。你不必重新导入主机文件。',
        '知识助手',
        '负责人 王 · 代码尚未克隆',
        '新项目',
        '查看项目',
        '按团队＋项目 ID 合并目录，创建卡片但不自动下载代码。',
        '新增一张卡，不重复注册已有顺风耳。'
      ),
      S(
        '目录更新完成',
        '项目目录与工作区连接分别刷新。代码仍是你当前检出的版本。',
        '顺风耳 · 知识助手',
        '目录 09:25 · 陈的 Mac 离线',
        '部分来源离线',
        '继续原工作',
        '读取本人任务权限和可用宿主；失败来源保留时间，不合成健康状态。',
        '新增项目可见，原本机任务保持上下文。'
      ),
      S(
        '需要新代码时再更新',
        '点击“更新代码”才进入现有 Git 同步链。存在本地修改时保留现场。',
        '顺风耳 / API',
        '林 · 本机 · 当前分支 feature/notify',
        '等待用户选择',
        '完成本旅程',
        '目录刷新不执行 git pull；更新代码失败不换另一台机器冒充成功。',
        '团队目录、代码、任务和执行位置各自可核对。'
      )
    ]
  },
  {
    title: '离线 · 继续工作与恢复',
    desc: '区分团队服务离线、同伴机器离线与项目已被撤销。',
    context: '研发组 / 连接恢复',
    boundary: '无缓存时明确无法获取目录。过期缓存只供回看；新远端访问需重新验证授权。',
    steps: [
      S(
        '陈的电脑暂时离线',
        '项目仍在团队目录里。本机已有副本不受这次断连影响。',
        '顺风耳',
        '本机可用 · 陈的 Mac 离线',
        '来源离线',
        '在本机继续',
        '目录来自团队服务，连接来自 runtime，分别更新。',
        '项目不消失，不把断连写成任务数为零。'
      ),
      S(
        '团队服务也暂时不可达',
        '保留上次已知目录并标过期。成员与授权状态暂不可确认。',
        '上次可读的研发组目录',
        '09:25 快照 · 仅回看',
        '状态待核验',
        '继续个人本机工作',
        '禁止新增远端授权和发布；本机文件仍可用，Git 独立检查本人权限。',
        '离线不等于退出团队，权限也不被缓存延长。'
      ),
      S(
        '连接恢复，先核验资格',
        '先处理成员／资源撤销，再接受目录与工作区内容。',
        '研发组',
        '成员有效 · 目录版本 43',
        '已重新验证',
        '恢复对应来源',
        '拒绝旧 generation 和较低 revision；主机重连不新增第二张项目卡。',
        '返回同一项目、同一工作区身份。'
      )
    ]
  },
  {
    title: '同伴协作 · 只读工作区',
    desc: '我要看陈的工作进展，明确进入陈已分享的工作区。',
    context: '顺风耳 / 同伴工作区',
    boundary:
      '只读授权需要宿主强制执行。当前 Orca 设备 token 不能直接实现项目级只读；本页为目标行为。',
    steps: [
      S(
        '选择你要看的工作区',
        '项目标题保持一个，下面保留每个人真实的工作区和主机。',
        '陈 · 通知重构',
        '陈的 Mac · 已分享此工作树',
        '只读可申请',
        '请求查看',
        '按稳定成员身份请求对应工作树的 view grant；不共享全部主机。',
        '申请对象和范围清楚。'
      ),
      S(
        '陈批准只读查看',
        '不会因为加入团队而自动获取终端输入或其他项目。',
        '通知重构 / worktree-7',
        '仅文件与脱敏会话快照',
        '只读已授权',
        '打开只读视图',
        '宿主校验成员资格、grant 和资源路径；事件订阅同样受控。',
        '只建立此资源的只读通道。'
      ),
      S(
        '正在查看陈的工作区',
        '原生工作区／评审复用示意。这里有持续的“陈的 Mac · 只读”标识。',
        'PR #108 · 重复通知修复',
        '可看已授权 diff 与会话快照',
        '只读',
        '返回我的工作区',
        '禁止 PTY 输入、写文件、自动化及模型代执行；反馈走本人 provider 权限。',
        '查看不改变自己的默认开工位置。'
      ),
      S(
        '回到自己的任务',
        '同一项目下仍能找回两个人的工作，权限与机器互不混淆。',
        '林 · 修复通知',
        '本机 Windows · 自己的工作树',
        '继续工作',
        '完成本旅程',
        '沿原生工作区激活恢复明确 host＋repo；不继承远端残留。',
        '同伴协作结束，原工作继续。'
      )
    ]
  },
  {
    title: '按需 · 在远端执行',
    desc: '只有明确需要远端资源时，才选择执行位置和授权范围。',
    context: '顺风耳 / 远端执行',
    boundary:
      '项目限定执行需要 OS／容器隔离与受限凭据。宿主只有旧整机配对能力时，本功能必须显示不可用。',
    steps: [
      S(
        '这项工作需要远端资源',
        '默认仍是本机。用户主动选择“在远端运行”。',
        '运行 Linux 集成验证',
        '目标：团队 Linux runner',
        '尚未执行',
        '选择远端环境',
        '列出已发布的候选资源与当前能力，不按主机在线自动授权。',
        '用户知道下一步会在何处运行。'
      ),
      S(
        '检查项目执行边界',
        '未支持隔离的个人 Mac 不可选；团队 runner 支持受控执行。',
        '团队 Linux runner',
        '仅 API 工作区挂载 · 独立身份 · 限定网络与凭据',
        '可申请',
        '申请执行权限',
        '宿主所有者校验范围与可用能力；团队管理员身份不能绕过宿主批准。',
        '申请不会自动变成整机控制。'
      ),
      S(
        '执行授权已批准',
        '仅对此项目的指定工作区，任务身份绑定授权。',
        'API / 集成验证',
        '团队 runner · 隔离环境 · 有效授权',
        '可以启动',
        '开始远端任务',
        '创建受控原生工作区执行上下文；每次敏感调用、订阅、工具均验证范围。',
        '终端和模型不能读取其他项目或机器凭据。'
      ),
      S(
        '远端任务运行中',
        '始终显示执行主机。断线或授权失效有明确结果，不在别处重复运行。',
        '集成验证',
        '团队 runner · 授权续租有效',
        '运行中',
        '完成本旅程',
        '会话与任务沿原生执行核；授权到期终止专属任务并回传结果。',
        '执行结果可读回；完成仍由人确认。'
      )
    ]
  },
  {
    title: '成员变化 · 撤回与退出',
    desc: '把目录撤回、工作区权限、Git 权限和本机文件分清。',
    context: '研发组 / 成员管理',
    boundary:
      '提议上界：活动流授权最长 30 秒续租，失联到期停止。已读走的文件无法收回；真实保证待双机验收。',
    steps: [
      S(
        '确认移除成员林',
        '预览将失去的团队目录与工作区授权。本机代码不会被删除。',
        '林 · 研发组成员',
        '管理员 陈操作 · Git 权限需另行管理',
        '等待确认',
        '确认移除',
        '服务事务更新 membership 和关联 grant revision，记录撤销事件。',
        '新的团队资源请求立即拒绝。'
      ),
      S(
        '正在撤销活动访问',
        '在线宿主收到事件即关闭资源订阅，拒绝新输入与排队任务。',
        '林的团队授权会话',
        '停止输出 · 执行任务正在终止',
        '撤销中',
        '查看撤销结果',
        '失联宿主到授权租约到期停流／终止专属执行，禁止旧响应重建缓存。',
        '已发出的内容不可收回；不宣称离线瞬时撤销。'
      ),
      S(
        '林看到明确的变化',
        '原团队目录与受控远端视图关闭，本机项目仍可继续。',
        '已退出研发组',
        '本机代码保留 · Git 平台权限独立',
        '访问已撤销',
        '回到我的项目',
        '清理团队可见缓存；个人本机任务保留；退出、解散同样遵守授权撤销顺序。',
        '不会误删代码，也不会把过期权限显示成可用。'
      )
    ]
  },
  {
    title: '主机地址变化 · 自动恢复',
    desc: '地址变化不应该要求每位成员重新导入 hosts.json。',
    context: '顺风耳 / 共享资源',
    boundary: '服务目录只发布端点与公开身份；配对密钥沿原生保存。公钥改变必须停下重新确认。',
    steps: [
      S(
        '团队 runner 更换了地址',
        '团队与项目关系保持不变，当前连接暂时中断。',
        '团队 Linux runner',
        '旧地址不可达 · 项目目录仍可用',
        '正在恢复',
        '检查最新地址',
        '宿主发布带验证身份的端点版本；客户端从目录拉取新端点。',
        '地址可变化，主机稳定身份不变。'
      ),
      S(
        '验证仍是同一台主机',
        '核对持久公钥，不能仅按主机名称或 IP 信任。',
        '团队 Linux runner',
        '公钥身份一致 · 端点版本更新',
        '验证通过',
        '重新连接',
        '复用原生同公钥重配与连接恢复；设备 token 不进入团队共享清单。',
        '保留原有主机资源关联，不重复建卡。'
      ),
      S(
        '恢复已授权的工作区',
        '刷新连接后再次检查授权。密钥不一致则提示重新确认，不能自动连。',
        'API / 集成验证',
        '同一主机 · 同一工作区',
        '已恢复',
        '完成本旅程',
        '按明确 host-qualified identity 恢复订阅，拒绝旧端点的迟到响应。',
        '用户不再手工维护每个人的地址文件。'
      )
    ]
  },
  {
    title: '异常 · 邀请与代码无权限',
    desc: '在失败的那一步继续，不要求用户从头配置。',
    context: '邀请与访问恢复',
    boundary: '团队资格、代码平台访问、宿主资源授权是三条独立链路。',
    steps: [
      S(
        '这个邀请已过期',
        '不会偷偷接受或创建成员。请联系邀请人重新发送。',
        '研发组邀请',
        '未加入 · 当前本机工作不受影响',
        '已过期',
        '演示收到新邀请',
        '新邀请由管理员产生；原邀请保留过期状态，不重复消费。',
        '异常结果明确，不形成假成员。'
      ),
      S(
        '新邀请有效，请核对账号',
        '若登录账号与接收人不符，可切换身份后再接受。',
        '林 → 研发组',
        '接收身份已匹配',
        '可接受',
        '接受并查看项目',
        '邀请、成员创建、重复回调幂等；不因一次网络超时重复入组。',
        '成功加入团队。'
      ),
      S(
        '你能发现项目，但还不能读代码',
        '请用自己的代码平台账号申请仓库权限。不会使用陈的凭据。',
        '顺风耳 / API',
        'Git 平台拒绝访问 · 未创建工作区',
        '需要代码权限',
        '演示权限获批后重试',
        '通过本人 CLI 重新验证仓库访问；仅重试失败的代码准备阶段。',
        '团队关系不变，没有假克隆成功。'
      ),
      S(
        '现在可以在本机准备代码',
        '回到同一个项目继续原生克隆，不重复入组或创建项目卡。',
        '顺风耳 / API',
        '本人账号可读取 · 本机目录待确认',
        '可以继续',
        '完成本旅程',
        '复用原生克隆和工作区链，成功后才报告就绪。',
        '失败可恢复，流程不割裂。'
      )
    ]
  },
  {
    title: '既有用户 · 平滑进入团队',
    desc: '已有的项目和主机照常使用，新协作关系由人明确建立。',
    context: '我的项目 / 加入团队',
    boundary: '旧个人／团队开关只是展示属性。不会自动生成团队成员或把整机配对升级为项目授权。',
    steps: [
      S(
        '你的原有工作都在',
        '升级后恢复本机项目、已配对主机与原有会话，不强制重走引导。',
        '顺风耳',
        '本机 2 个工作区 · 既有连接保留',
        '继续可用',
        '加入研发组',
        '入口常驻；旧数据不按主机名猜人或团队，也不批量公开。',
        '升级不改变现有工作归属。'
      ),
      S(
        '关联你已有的代码',
        '团队有顺风耳项目，本机也有同一仓库。优先复用已有检出。',
        '顺风耳 / API',
        '远端身份一致 · 本机路径已确认',
        '可关联',
        '确认关联',
        '按 provider 实例与 canonical identity 匹配；fork／SSH 别名歧义需人工确认。',
        '一个团队项目关联已有 setup，不搬文件。'
      ),
      S(
        '明确新的共享范围',
        '团队可发现项目，旧整机配对作为高级连接单独管理。',
        '同伴工作区共享',
        '仅在宿主支持范围授权时开启',
        '按需配置',
        '完成本旅程',
        '原 team 标记不升级权限；迁移逐项幂等，失败保留现有工作。',
        '老用户进入新旅程，无隐式扩大授权。'
      )
    ]
  }
]
const details = {
  person: [
    '人员',
    '以组织身份提供者的稳定 subject 识别，同一人可加入多个团队、登录多台设备。Git 身份关联需要验证，不用姓名、主机名或邮箱字面相同自动合并。'
  ],
  membership: [
    '成员资格',
    '人员与团队 M:N 的中间对象，包含职责、有效状态与授权版本。最后一位管理员需先转交或解散；退出不会删除自己的 Git 文件。'
  ],
  team: [
    '团队',
    '拥有项目目录与成员关系；不依赖某个人的机器在线。团队管理员管理协作关系，但不会自动获得代码写入或宿主控制权。'
  ],
  project: [
    '协作项目',
    '归属一个团队，可关联多个代码仓；与代码仓通过 ProjectRepository M:N。首版项目对有效团队成员可发现；材料主仓显式选定。'
  ],
  repo: [
    '代码仓',
    '复用原生 Project 的 provider／Git 身份。相同仓可出现在多个协作项目；跨团队的协作卡片不合并，仓库和 Issue 事实仍由原平台维护。'
  ],
  setup: [
    '主机上的检出',
    'ProjectHostSetup 关联一个代码仓、一台执行主机与一个目录。仓库和主机 M:N；检出 1:N 工作树，工作树 1:N 会话。聚合标题不合并这些执行身份。'
  ],
  host: [
    '执行主机',
    '一台机器可承载多个检出。公开稳定身份与端点可登记，凭据沿原生安全存储；人员与设备不等价，环境 envId 也不能直接当跨重配永久身份。'
  ],
  grant: [
    '资源授权',
    '成员与 setup／工作树资源 M:N；授权明确只读或执行、修订与有效期。由宿主所有者批准；执行授权还要求受控环境，单纯配对和 cwd 限制均不够。'
  ]
}
let scene = 0,
  step = 0,
  timer = null
const $ = (s) => document.querySelector(s)
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
function stop() {
  clearTimeout(timer)
  timer = null
  $('#play').textContent = '播放动画'
}
function render() {
  const j = journeys[scene],
    s = j.steps[step]
  $('#scenes').innerHTML = journeys
    .map(
      (j, i) =>
        `<button class="${i === scene ? 'active' : ''}" data-scene="${i}" aria-current="${i === scene ? 'step' : 'false'}"><span>${String(i + 1).padStart(2, '0')}</span>${j.title}</button>`
    )
    .join('')
  $('#scene-code').textContent =
    `J${String(scene + 1).padStart(2, '0')} / ${journeys.length} 条旅程`
  $('#scene-title').textContent = j.title
  $('#scene-desc').textContent = j.desc
  $('#counter').textContent = `${step + 1} / ${j.steps.length}`
  $('#timeline').innerHTML = j.steps
    .map(
      (s, i) =>
        `<button class="${i <= step ? 'done' : ''}" data-step="${i}" aria-label="第 ${i + 1} 步：${esc(s.title)}" title="${esc(s.title)}"></button>`
    )
    .join('')
  $('#stage').innerHTML =
    `<div class="appbar"><span class="dot"></span><span class="dot"></span><b>Workbench</b><span>${esc(j.context)}</span></div><div class="mock"><div class="mock-nav">我的工作<b>项目</b>我的项目<br>研发组<br>同伴工作区<br><br>帮助 · 设置</div><div class="mock-main"><h3>${esc(s.title)}</h3><p>${esc(s.desc)}</p><div class="mock-card"><div class="avatar">${scene === 8 ? '↗' : '项'}</div><div><strong>${esc(s.card)}</strong><p>${esc(s.meta)}</p></div><span class="state ${/失败|过期|离线|需要|撤销|待/.test(s.state) ? 'warn' : 'ok'}">${esc(s.state)}</span></div><div class="mock-actions"><button class="primary" id="action">${esc(s.action)} ${step === j.steps.length - 1 ? '✓' : '→'}</button>${scene === 0 && step === 0 ? '<button data-switch="2">先做自己的项目</button>' : ''}${scene === 1 && step === 0 ? '<button data-switch="0">加入已有团队</button><button data-switch="2">先做自己的项目</button>' : ''}</div><div class="ribbon">设计模拟 · 点击按钮推进场景，不执行真实操作</div></div></div>`
  $('#human').textContent = s.action
  $('#system').textContent = s.system
  $('#result').textContent = s.result
  $('#boundary').textContent = j.boundary
  $('#prev').disabled = step === 0
  $('#next').disabled = step === j.steps.length - 1
  history.replaceState(null, '', `#j${scene + 1}-${step + 1}`)
}
function advance() {
  if (step < journeys[scene].steps.length - 1) {
    step++
    render()
    return true
  }
  stop()
  return false
}
function tick() {
  timer = setTimeout(
    () => {
      if (advance()) {
        if (step === journeys[scene].steps.length - 1) {
          stop()
        } else {
          tick()
        }
      }
    },
    6000 / Number($('#speed').value)
  )
}
$('#play').onclick = () => {
  if (timer) {
    stop()
    return
  }
  if (step === journeys[scene].steps.length - 1) {
    step = 0
    render()
  }
  $('#play').textContent = '暂停'
  tick()
}
$('#prev').onclick = () => {
  stop()
  if (step > 0) {
    step--
  }
  render()
}
$('#next').onclick = () => {
  stop()
  advance()
}
$('#restart').onclick = () => {
  stop()
  step = 0
  render()
}
$('#speed').onchange = () => {
  if (timer) {
    clearTimeout(timer)
    tick()
  }
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-scene],[data-step],[data-switch],#action')
  if (!a) {
    return
  }
  stop()
  if (a.dataset.scene !== undefined) {
    scene = Number(a.dataset.scene)
    step = 0
  } else if (a.dataset.step !== undefined) {
    step = Number(a.dataset.step)
  } else if (a.dataset.switch !== undefined) {
    scene = Number(a.dataset.switch)
    step = 0
  } else if (step < journeys[scene].steps.length - 1) {
    step++
  } else {
    scene = (scene + 1) % journeys.length
    step = 0
  }
  render()
})
document.querySelectorAll('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      stop()
      document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== b.dataset.tab))
      document
        .querySelectorAll('[data-tab]')
        .forEach((t) => t.classList.toggle('selected', t === b))
    })
)
function nodeDetail(key) {
  document
    .querySelectorAll('.node')
    .forEach((n) => n.classList.toggle('active', n.dataset.node === key))
  $('#node-detail').innerHTML = `<h3>${details[key][0]}</h3><p>${details[key][1]}</p>`
}
document.querySelectorAll('.node').forEach((n) => {
  n.onclick = () => nodeDetail(n.dataset.node)
  n.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      nodeDetail(n.dataset.node)
    }
  }
})
$('#theme').onclick = () => {
  const r = document.documentElement
  r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark'
}
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input,select,button') || $('#journey').hidden) {
    return
  }
  if (e.key === 'ArrowRight') {
    $('#next').click()
  } else if (e.key === 'ArrowLeft') {
    $('#prev').click()
  }
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stop()
  }
})
const match = location.hash.match(/^#j(\d+)-(\d+)$/)
if (match) {
  scene = Math.min(journeys.length - 1, Math.max(0, Number(match[1]) - 1))
  step = Math.min(journeys[scene].steps.length - 1, Math.max(0, Number(match[2]) - 1))
}
render()
nodeDetail('membership')
