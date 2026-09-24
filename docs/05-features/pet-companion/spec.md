# Spec · 宠物（pet-companion）

> **30 秒导读**：这是什么——本次变更的**规格件**：宠物长什么样、姿势怎么从数据推出来、皮肤从哪来、怎么操作、出错怎么办、怎么验收。给谁看——过规格 gate 的人、之后实现它的会话。现在作数吗——**draft**（2026-09-24 起草，待规格 gate；状态正本见 [STATUS.md](STATUS.md)）；上游意图见 [intent.md](intent.md)；可点原型见下节链接（按 02 §3.2 不进仓）。

## 原型

**可点原型**：https://claude.ai/artifact/NuibdfPSZ2v3oy43Py85Xv（artifact，浏览器直接开）。里面是一个 1:1 的壳骨架：172px 侧栏 + 内容区，宠物在侧栏底部「帮助」上方；页脚的「原型演示数据」栏只属于原型，用来改「待评审 / 阻塞 / 进行中 / 会话动静 / 健康灯」五个事实，看宠物怎么变、悬停它说什么、点它去哪；设置 → 外观里能换皮肤（Clawd / Codex 内置 / 自定义 / 关闭）。原型里的推导规则与本篇「设计拍板 2」逐条一致，Codex 皮肤是示意像素画，不是官方资产。视觉沿用设计系统 claude 色板。

## 设计拍板

1. **落点 = 侧栏底部**，「帮助」上方，一格 72px 高（宠物本体 48×52，即 Codex 192×208 帧的 1/4，`image-rendering: pixelated`）。所有屏都在；**只有进了项目才有信号**，项目墙上它只是装饰态（发呆），不汇总多项目——一屏只说一件事。
2. **姿势 = 内核派生视图**（`PetPose`，落 `crates/bw/src/derive/pet.rs`），壳只 `match` 渲染，不写一行判断。输入四样已有事实：当前项目 Issue 列表（状态标签）、健康 `Signal`、进行中 Issue 工作树的 Claude 会话文件最近修改时间（复用 `bw_engine::orca::claude_project_dir` 那套目录）、当前时间。规则从上到下第一条命中即停：

   | # | 事实 | 姿势（沿用 Codex 轨道名） | 悬停说的话（人话，含数据） | 点它去哪 |
   |---|---|---|---|---|
   | 0 | 没打开项目 | `idle` | 「项目墙：没有项目上下文」 | 不跳 |
   | 1 | 健康 `Signal::Red` | `failed`（趴下） | 「健康灯红：<推导原因一句>」 | 总览 |
   | 2 | 待评审 n>0 | `review`（举牌，牌上写 n） | 「n 个 Issue 等你评审」 | 计划屏待评审列 |
   | 3 | 阻塞 n>0 | `waiting` | 「n 个 Issue 被阻塞」 | 计划屏 |
   | 4 | 进行中 >0 且任一会话文件 ≤ 3 分钟内写过 | `running`（跑） | 「AI 正在跑：#12 的会话 40 秒前还在写」 | 会话屏 |
   | 5 | 进行中 >0 且会话文件都 > 3 分钟没写 | `waiting` | 「#12 的会话 12 分钟没动静，可能在等你」 | 会话屏 |
   | 6 | 其余（含进行中但读不到会话文件） | `idle` | 「进行中 k 件，读不到会话动静（不是 Claude 会话或目录不可读）」或「待评审 0、阻塞 0、进行中 0；健康<色>」 | 计划屏 |

   - `idle` 之外的装饰动作（眨眼、挥手、跳一下）不携带含义、不受数据影响；`prefers-reduced-motion` 时全部静止在 idle 首帧（Codex 同样处理）。
   - 阈值 3 分钟是内核常量，不是设置项；它只回答「文件最近写没写」，不解释 agent 在想什么。
   - 悬停文案永远陈述读到的数据；`idle` 不许写成「一切正常」。
3. **皮肤 = Codex 宠物包格式，资产不随包分发**。本机设置 `settings.toml` 新键 `pet`：`"clawd"`（默认）｜`"off"`｜`"codex:<内置 id>"`｜`"custom:<id>"`。
   - **Clawd**：仓内自绘矢量（`crates/app-shell/assets/pet/clawd.svg`，编译期 `include_str!`），五种姿势用 CSS 动画驱动，不做 spritesheet；配色取设计系统 claude 色板的 `--color-accent`。
   - **Codex 内置八只**（codex / dewey / fireball / rocky / seedy / stacky / bsod / null-signal）：Codex 自己也不把它们放进仓，而是首次使用时从 `https://persistent.oaistatic.com/codex/pets/v1/<id>-spritesheet-v4.webp` 下载到 `$CODEX_HOME/cache/tui-pets/v1/assets/`；这些图不在 Apache-2.0 覆盖范围内、许可未明。**Workbench 只读本机这份缓存**：有就列出、没有就灰显「在 Codex 里选过一次才会出现」；不下载、不打进安装包。发起人原话是「打进去」——本条是 spec 对「打什么进去」的收窄：打进去的是格式与读取，不是资产；要改判见「标注的冲突 1」。
   - **自定义**：`$CODEX_HOME/pets/<id>/pet.json`（`CODEX_HOME` 缺省 `~/.codex`）按 Codex 规则原样解析：`id` / `displayName` / `description` / `spritesheetPath`（只许目录内相对路径，`..` 与绝对路径拒绝）/ `frame`（缺省 192×208、8 列 × 9 行）/ `animations`（`frames` 索引、`fps` 缺省 8 上限 60、`loop` 缺省 true、`fallback` 缺省 `idle`）；图必须正好 1536×1872，帧数 ≤ 256；轨道缺省行号 0 idle、1 running-right、2 running-left、3 waving、4 jumping、5 failed、6 waiting、7 running、8 review。旧的 `avatars/<id>/avatar.json` 也认。坏包如实报「这只宠物读不出来：<原因>」并回到 Clawd，不猜。
   - 渲染：spritesheet 以 data URI 进 `background-image`，每条轨道一段 `steps(n)` 的 `background-position` 动画，帧时长取轨道均值（Codex 末帧略长，视觉差可忽略）；不用 JS 定时器逐帧画。
4. **交互只有两种**：悬停出人话（`title` + 自绘 tooltip），点它跳到对应屏（表列最后一栏）。不弹窗、不通知、不说话、没有气泡人格。
5. **设置屏 · 外观**新增一行「宠物」：与「配色」同一文法（`.set-row` + `.choice` 预览卡），三组：默认（Clawd / 关闭）、Codex 内置（读缓存，缺的灰显）、自定义（读 `~/.codex/pets/`，坏包灰显并写原因）。选中即存本机设置、立刻生效。
6. **不做**：桌面悬浮窗（Codex 桌面版形态）、稀有度 / 孵化 / 进化、通知提醒、多项目汇总、Orca 会话状态 RPC（Orca 没有暴露；有了再换数据源）。

## 操作逻辑

**主路径**：打开 Workbench → 侧栏底部 Clawd 发呆（项目墙，装饰态）→ 打开项目 → 内核现算：待评审 2 → Clawd 举牌「2」→ 悬停「2 个 Issue 等你评审」→ 点它 → 计划屏，待评审列高亮 → 人去合或打回（既有动作）。

**分支**：
- 人拖 Issue 进「进行中」并开工 → Orca 起 Claude 会话 → 会话文件开始写 → 下一次重算它「跑」；3 分钟没写 → 「等」，悬停给出分钟数。
- 开工工具是 Cursor / Codex / Open Design → 读不到会话文件 → 它发呆，悬停如实写「读不到会话动静」；举牌 / 阻塞 / 趴下三态不受影响（数据来自 Issue 标签与健康）。
- 健康灯红 → 趴下，优先于其他一切；点它去总览。
- 设置里关闭 → 侧栏不渲染、推导不跑；再打开立刻回来。
- 换皮肤 → 立刻换，姿势不变（姿势来自数据，皮肤只是画法）。
- 回到项目墙 → 装饰态，悬停说「没有项目上下文」。
- 杀进程重开 → 同一份 Issue / 健康 / 文件时间 → 同一个姿势（不存上次姿势）。

**出错怎么办**：
- Codex 缓存目录不存在或图校验失败 → 该皮肤灰显并写原因；当前若正选着它 → 回 Clawd 并 toast 原话。
- 自定义包 `pet.json` 解析失败 / 尺寸不对 / 路径穿越 → 同上，原因照抄解析错误。
- Claude 会话目录不可读（权限、路径编码不同）→ 规则 4/5 不可得，落规则 6，悬停如实说；不报错打扰。
- 健康推导本身 Unknown → 不进规则 1；悬停里写「健康未知」。

## 客户会问

- **它会不会变成通知、把我拽回来？** 不会。它不弹窗不响，只是在你看向侧栏时告诉你有没有事；要不要回来仍是你决定。
- **我用 Cursor 开工，它会动吗？** 举牌（待评审）、等（阻塞）、趴下（红灯）照旧——这些来自 Issue 和健康数据；「跑 / 等」两态今天只读得到 Claude 会话文件，Cursor 会话它读不到，就如实发呆并说明。
- **我在 Codex 里做的宠物能直接用吗？** 能。同一个目录、同一份 `pet.json`，Workbench 原样读。
- **能不能自己画一只 Clawd 皮肤？** 能，做成 `pet.json` 包放进 `~/.codex/pets/` 即可；仓内那只 Clawd 是矢量自绘。
- **它记不记得我多久没回来、给我打分？** 不记。它没有心情、经验值，也不存历史；重开一样。

## 硬核挑战（内部 FAQ）

- **资产许可**：Codex 八只皮肤在 OpenAI CDN、不在 Apache-2.0 仓内，未见明确再分发许可 → 不打包、不下载，只读本机 Codex 已缓存文件（用户自己在 Codex 里选过就有）。若发起人愿意承担许可风险坚持随包分发：每张 webp ≤ 4MB，八张最多 32MB 进安装包，并须在 `standard/vendor/` 留来源与许可说明——这是 gate 决定，不是实现细节。Clawd 属 Anthropic 品牌资产，内部试用可，对外分发前重议（intent 开放问题 3）。
- **「跑 / 等」的数据源**：Orca 没有会话状态 RPC；Workbench 今天靠 Claude 的 `~/.claude/projects/<路径编码>/<会话>.jsonl` 判定会话存在（`session_ids_for_worktree`）。本特性只多读一个 mtime。误判面：Claude Code 每轮工具调用都写 jsonl，长思考中也会写，3 分钟阈值够粗；跨工具读不到就如实发呆。
- **重算节律**：壳今天**没有周期重算**——`Req::Refresh` 只由总览 / 计划 / 项目墙 / 连接器页的按钮触发，且它走 `PullWorkspace` 拉远端，不能拿来每分钟跑。规则 4/5 需要一条**轻定时**：壳每 60 秒发一次只重读会话文件 mtime、用内核缓存的 Issue 与健康重算 `PetPose` 的请求（不拉远端、不走事件总线的 ViewModel 全量重拼）。这是新增的一条定时，但它不触碰铁律四（不是任务调度）；实现时写清它只服务宠物，关闭宠物即停。
- **渲染成本**：CSS `steps()` 动画在 WebView 常驻 6–8 fps 的 48px 小图，可忽略；reduce-motion 静止。spritesheet 以 data URI 进样式（≤ 4MB × 1 张，只当前皮肤），不常驻八张。
- **守卫**：推导放 `crates/bw`（壳零业务判断）；宠物组件放 `crates/app-shell/src/chrome/pet.rs`（侧栏本就在 chrome，不跨屏导入）；用 hook 的函数必须是 `#[component]`（屏 hook 守卫）；行数守卫无压力。
- **成功怎么量**：不挂指标（02 §6.2 环 2「不强求」；没有能反馈北极星的价值指标）；以发起人试用两周的反馈决定留不留、要不要项目墙汇总。
- **与设计系统**：设计系统没有动画组件约定；新增 `.pet` 一组类后要走 `design-system-import` 回推，README「怎么演进」已有路径。

## 要求与验收

- **R1 派生唯一**：`PetPose` 只由 Issue 标签、`Signal`、会话文件 mtime、当前时间推导；无任何 `set_pose`；同一份输入两次调用结果相同（单测覆盖表中 0–6 每条规则及优先级）。
- **R2 诚实**：读不到会话文件时不出现 `running` / 规则 5 的 `waiting`；`idle` 悬停文案必须含读到的计数或「读不到」字样；健康 Unknown 不触发 `failed`。
- **R3 宠物包解析**：`pet.json` 好包 / 缺 `spritesheetPath` 走缺省 / 尺寸错 / 路径穿越四类单测；坏包错误原文透传到 toast；旧 `avatar.json` 可读。
- **R4 不分发第三方资产**：安装包与仓内不含 `*-spritesheet-v4.webp`；Codex 皮肤只从 `$CODEX_HOME/cache/tui-pets/v1/assets/` 读（gate 改判则本条改写，并补许可说明）。
- **R5 设置往返**：`pet` 键写 `settings.toml`；关闭后 DOM 无 `.pet-slot`；重启后皮肤与姿势与重启前一致（独立读回 settings.toml + 深链核对）。
- **R6 点击导航**：表列「点它去哪」四个目标各一条断言。
- **R7 门禁**：fmt / clippy / app-shell 编译 / 三结构守卫 / 行数守卫 / cargo test 全过；`verify --profile pr` 带本特性 suite。
- **R8 规格 gate 自查**：可点原型链接 + 操作逻辑（主路径 / 分支 / 出错）齐备，即本篇。

### 验收点 ↔ 用例（环 5 / 环 6 定义层，实现随带入补）

| 验收点 | suite（`.bw/release/e2e/suites/pet.json`，`feature: pet-companion`） | 用例名 |
|---|---|---|
| R2 | 深链 `BW_OPEN=<沙箱项目> BW_PANEL=overview`，项目无进行中 Issue → 宠物 `data-pose="idle"`，`aria-label` 含「进行中 0」 | `pet-idle-honest` |
| R1/R6 | 沙箱仓打一条待评审标签 → 重开壳 → `data-pose="review"` 且牌数 = gh 读回的待评审数 → 点击 → `data-screen="plan"` | `pet-review-sign` |
| R5 | 设置选 `codex:dewey`（缓存预置）→ 杀进程重开 → settings.toml `pet="codex:dewey"` 与 DOM 皮肤一致 | `pet-skin-roundtrip` |
| R5 | 设置选关闭 → DOM 无 `.pet-slot`；重开仍无 | `pet-off` |
| 旅程（环 6，`kind: acceptance`） | 深链进计划屏 → 拖一条 Issue 进待评审（写标签成功）→ 宠物举牌 → 点它 → 待评审列高亮 → gh 独立读回标签 | `pet-journey` |

## 标注的冲突

1. **「把 codex 的宠物包打进去」的范围**：发起人原话可读作「随包分发八只资产」；本 spec 拍板 3 收窄为「打进格式与读取，只读本机 Codex 缓存」，理由是资产不在 Apache-2.0 仓内、许可未明。规格 gate 须明确二选一；改判则 R4 改写并补 `standard/vendor/` 许可说明。
2. **新增一条 60 秒轻定时**：与「壳只渲染和转发意图」不冲突（定时只发请求、推导在内核），但它是壳第一条周期性请求；实现设计时在 [06-module/桌面壳](../../06-module/桌面壳.md) 回写这条取舍。
3. **hifi 八屏原型没有宠物**：按 hifi README 的历史边界不改旧原型；本特性的样子以本篇原型链接与合入后的真壳截图为准。
4. **发起人提到的分支 `claude/bw-pet-setup-f3cf33`** 远端不存在，其中可能有先前的设想；本篇未能参考，若人手里还有，规格 gate 时对照补。
