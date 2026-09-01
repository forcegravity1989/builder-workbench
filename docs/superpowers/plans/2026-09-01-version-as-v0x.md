# 版本收成 v0.x Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 计划版本、自建版本、发版号收成同一个 `v0.x`；对人说版本目标；版本视图左上角笔改名，一次同步里程碑和标签。

**Architecture:** 号的格式和集合算法进 `crates/bw/src/version.rs`。排期只认 `bw:plan:v0.x` + 同名里程碑，不再写 `bw:week:*`。运作活①去重改成标题 + 标签 + 本 ISO 周创建时间。壳：创建弹窗提示上一发/未发；发版锁死当前视图；版本标题就地笔/勾改名。会话灌词走系统提示词 `{{version_context}}`，只在运作活①非空。

**Tech Stack:** Rust workspace（`bw` / `bw-engine` / `app-shell`）、Dioxus 0.7、codehub GitLab v4 milestone/label API、外置 `standard/system-prompt`。

**规格正本:** [`changes/version-as-v0x/spec.md`](../../../changes/version-as-v0x/spec.md) · 原型 [`prototype.html`](../../../changes/version-as-v0x/prototype.html)

## Global Constraints

- 合法版本名：`^v[0-9]+\\.[0-9]+$`。不认 `v0.1.0`、`W35`、`2026-W35`、`MVP收尾`。
- 三处同一串：`bw:plan:v0.3`、里程碑标题 `v0.3`、Release / `bw:released:v0.3`。
- 不再写 `bw:week:*`，不建周号里程碑。ISO 周只做节律（运作活①该不该开、健康时间窗、资产盘点周五）。
- 已发的号锁死，不能改名，版本视图没有笔。
- 发版弹窗号只读，说明里不写上一发 / 未发。上一发 / 未发 / 推荐只出现在创建版本和运作活①提示词。
- 旧非 `v0.x` 不迁、不双读，一律未分配。
- `principles/03` 不改。资产盘点标题和定时不改。健康时间窗算法不改。
- 本仓不建单元测试大坝；只在已有测旁边补这条会错的纯函数。壳行为对人看 / 读回。
- 未点头不 `git commit`。任务末「Commit」步先停。
- `#![forbid(unsafe_code)]` 在 `bw-engine` 仍守。单文件 2000 行上限。

---

## File map

| 路径 | 职责 |
|---|---|
| `crates/bw/src/version.rs` | `is_v0x` / `bump_patch` / `VersionInventory` / `ops1_started` |
| `crates/bw/src/lib.rs` | `mod version` 并再导出需要给壳用的符号 |
| `crates/bw/src/isoweek.rs` | `unix_in_week(ts, week)` |
| `crates/bw/src/app/ops.rs` | 运作活①标题、workflow 人话名 |
| `crates/bw/src/app/plan.rs` | 创建/删/发/改名/开始本版本去重 |
| `crates/bw/src/app/issue_store.rs` | `parse_plan` 只认 v0.x；不写周标签；改名换标 |
| `crates/bw/src/app/week_comment.rs` | `HEADING_GOAL = "版本目标"` |
| `crates/bw/src/app/health.rs` | 找本周运作活①的方式 |
| `crates/bw/src/app/bootstrap.rs` | 提示词灌 `version_context` |
| `crates/bw/src/app/issue.rs` | 开工时算 inventory 再渲染提示词 |
| `crates/bw/src/command.rs` | `RenamePlanVersion` + `PlanVersionRenamed` |
| `crates/bw/src/app/mod.rs` | 接线 Command |
| `crates/bw-engine/src/codehub.rs` | 改里程碑标题、改标签名 |
| `crates/bw-engine/src/remote.rs` | 两臂转发（GitHub/mock 诚实空过或只换 issue 标签） |
| `crates/app-shell/src/vm.rs` | `PlanVersionVm.released`、inventory 字段 |
| `crates/app-shell/src/bridge/vm_build.rs` | 版本列表过滤、week_started、inventory |
| `crates/app-shell/src/screens/plan/mod.rs` | 下拉、左上角笔/勾、发版入口 |
| `crates/app-shell/src/screens/plan/plan_dialogs.rs` | 创建提示、发版只读、排期只列 v0.x |
| `crates/app-shell/src/screens/overview/mod.rs` | 「开始本版本」、进度空态 |
| `crates/app-shell/src/screens/wall/mod.rs` | 「版本目标:」 |
| `standard/system-prompt/SYSTEM.md.tmpl` | `{{version_context}}` |
| `standard/VERSION` | 5.10 → 5.11 |
| `standard/skills/week-planning/*`、`references/week-plan-comment.md` | 人话与校验 |
| `CONTEXT.md` / `docs/architecture.md` / 指南 / 高保真 / `CHANGELOG.md` | 对齐 |

---

### Task 1: 版本号纯函数

**Files:**
- Create: `crates/bw/src/version.rs`
- Modify: `crates/bw/src/lib.rs`（`pub mod version;`）
- Modify: `crates/bw/src/isoweek.rs`（加 `unix_in_week`）

**Interfaces:**
- Consumes: 无
- Produces:
  - `pub fn is_v0x(s: &str) -> bool`
  - `pub fn bump_patch(s: &str) -> Option<String>`（`v0.2` → `Some("v0.3")`；非法 → `None`）
  - `pub fn max_v0x<'a>(names: impl IntoIterator<Item = &'a str>) -> Option<String>`（按主.次数字比，不是字符串比）
  - `pub struct VersionInventory { pub last_released: Option<String>, pub unreleased: Vec<String>, pub suggested_next: String }`
  - `pub fn inventory(plan_names: &[String], released_names: &[String]) -> VersionInventory`
  - `pub fn is_ops1_title(title: &str) -> bool`（光杆或 `光杆 + 空格 + v0.x`）
  - `pub const OPS1_TITLE: &str = "更新指标 + 制定版本计划";`
  - `pub fn ops1_title_for(version: &str) -> String` → `"更新指标 + 制定版本计划 v0.3"`
  - `pub fn ops1_already_started(open_ops1: bool, tagged_ops1_created_this_week: bool) -> bool`
  - `isoweek::unix_in_week(ts: i64, week: &str) -> bool`（`ts<=0` → false）

- [ ] **Step 1: 在 `version.rs` 写函数和模块测**

```rust
pub fn is_v0x(s: &str) -> bool {
    let s = s.trim();
    let Some(rest) = s.strip_prefix('v') else { return false; };
    let Some((a, b)) = rest.split_once('.') else { return false; };
    !a.is_empty()
        && !b.is_empty()
        && a.chars().all(|c| c.is_ascii_digit())
        && b.chars().all(|c| c.is_ascii_digit())
}

pub fn bump_patch(s: &str) -> Option<String> {
    let s = s.trim();
    if !is_v0x(s) { return None; }
    let rest = s.strip_prefix('v')?;
    let (head, tail) = rest.split_once('.')?;
    let n: u32 = tail.parse().ok()?;
    Some(format!("v{head}.{}", n + 1))
}

pub fn inventory(plan_names: &[String], released_names: &[String]) -> VersionInventory {
    let released: Vec<String> = released_names.iter().filter(|s| is_v0x(s)).cloned().collect();
    let last_released = max_v0x(released.iter().map(String::as_str));
    let mut unreleased: Vec<String> = plan_names
        .iter()
        .filter(|s| is_v0x(s) && !released.iter().any(|r| r == *s))
        .cloned()
        .collect();
    unreleased.sort();
    unreleased.dedup();
    let suggested_next = max_v0x(
        last_released.iter().map(String::as_str).chain(unreleased.iter().map(String::as_str)),
    )
    .and_then(|m| bump_patch(&m))
    .unwrap_or_else(|| "v0.1".into());
    VersionInventory { last_released, unreleased, suggested_next }
}
```

模块测至少覆盖：`v0.1`/`v1.0` 真，`v0.1.0`/`W35`/`2026-W35`/`MVP收尾`/`bw:plan:v0.1` 假；上一发 `v0.1` + 未发 `v0.2` → 推荐 `v0.3`；都空 → `v0.1`；`is_ops1_title("更新指标 + 制定版本计划")` 真，带 ` v0.3` 真，带 ` 2026-W36` 假。

- [ ] **Step 2: `unix_in_week`**

```rust
pub fn unix_in_week(ts: i64, week: &str) -> bool {
    if ts <= 0 { return false; }
    let Ok(dt) = time::OffsetDateTime::from_unix_timestamp(ts) else { return false; };
    iso_week_of(dt.to_offset(local_offset()).date()) == week
}
```

- [ ] **Step 3: 跑测**

Run: `cargo test -p bw version:: -- --nocapture` 以及 `isoweek` 里若加了测。
Expected: PASS

- [ ] **Step 4: Commit** — 停，等人说。

---

### Task 2: 读回只认 v0.x，周标签不当排期

**Files:**
- Modify: `crates/bw/src/app/issue_store.rs`（`parse_plan` / `parse_week` / `one_schedule` / `assign_to_plan` 仍摘 `bw:week:`）
- Modify: `crates/app-shell/src/bridge/vm_build.rs`（`build_plan_versions`）
- Modify: `crates/app-shell/src/vm.rs`（`PlanVersionVm.released: bool`）

**Interfaces:**
- Consumes: `bw::version::is_v0x`
- Produces: 活的 `plan_version` 只在合法 `v0.x` 时非空；`week_of` 读回恒空（不再当排期）；版本下拉只有 v0.x

- [ ] **Step 1: 改解析**

```rust
fn parse_week(_labels: &[String]) -> String {
    String::new()
}

fn parse_plan(labels: &[String]) -> String {
    labels
        .iter()
        .find_map(|l| l.strip_prefix("bw:plan:"))
        .filter(|s| crate::version::is_v0x(s))
        .unwrap_or("")
        .to_string()
}
```

`one_schedule`：有合法 `bw:plan:v0.x` 才排期；`week_of` 参数即使非空也不再生成周排期（建运作活①会传空）。`create_issue` / `create_ops_issue` 调用处不要再传本周周号当 `week_of`（Task 3 一起改）。

`build_plan_versions`：`list_milestones` 结果和 issue 上的名，对不上 `is_v0x` 的丢掉。给每条填 `released`：`releases` 或 issue 的 `version`（`bw:released:`）里有同名。

已有 `issue_store` 模块测若断言 `plan_version == "MVP收尾"`：改成非法名应解析成空；另加一条 `v0.3` 仍能读出。

- [ ] **Step 2: `cargo test -p bw`**
Expected: 改过的测绿，没有新红。

- [ ] **Step 3: Commit** — 停。

---

### Task 3: 运作活①去重（标题 + 标签 + 本周创建）

**Files:**
- Modify: `crates/bw/src/app/ops.rs`（`OPS1_WORKFLOW`、`ops1_title`、`workflow_label` / `skill_slug`）
- Modify: `crates/bw/src/app/issue_store.rs`（`OPS1_TITLE_PREFIX`）
- Modify: `crates/bw/src/app/plan.rs`（`start_week_planning`）
- Modify: `crates/bw/src/app/health.rs`
- Modify: `crates/app-shell/src/bridge/vm_build.rs`（`week_started`）
- Modify: 所有 `ops1_title(&week)` 调用点（`vm_derive.rs` 演示字串、`prompt_smoke.rs`）

**Interfaces:**
- Consumes: `version::OPS1_TITLE`、`is_ops1_title`、`is_v0x`、`unix_in_week`
- Produces:
  - `OPS1_WORKFLOW = "更新指标与版本计划"`
  - `ops1_title()` 不再拼周号，返回 `OPS1_TITLE`
  - `fn is_ops1_issue(i: &Issue) -> bool`
  - `fn week_started(issues: &[Issue], current_week: &str) -> bool`

- [ ] **Step 1: 认运作活①**

```rust
pub fn is_ops1_issue(i: &Issue) -> bool {
    i.kind == IssueKind::Ops
        && (i.workflow == OPS1_WORKFLOW
            || crate::version::is_ops1_title(&i.title)
            || crate::version::is_v0x(&i.plan_version))
}

pub fn week_started(issues: &[Issue], current_week: &str) -> bool {
    let mut open = false;
    let mut tagged_this_week = false;
    for i in issues {
        if !is_ops1_issue(i) { continue; }
        if i.status != IssueStatus::Done {
            open = true;
        }
        if crate::version::is_v0x(&i.plan_version)
            && crate::isoweek::unix_in_week(i.created_at, current_week)
        {
            tagged_this_week = true;
        }
    }
    crate::version::ops1_already_started(open, tagged_this_week)
}
```

`start_week_planning`：用 `week_started` 挡住（开着 → `WeekPlanInProgress`；本周已打标含完成 → `WeekPlanAlreadyExists`）。新建标题=`OPS1_TITLE`，`week_of` 传空串。`create_ops_issue` 的 week 参数仍可留着给调用方，但这里传 `""`。

`issue_store` 标题前缀改成 `更新指标 + 制定版本计划`（光杆和带 ` v0.x` 都 `starts_with`）。workflow 推断跟新 `OPS1_WORKFLOW`。

健康灯找 ops①：本周 `is_ops1_issue` 且（未完成，或 `unix_in_week`）。`has_week_goal` 仍读它的评论，字段名可暂时不改。人话四句里「周目标」→「版本目标」（Task 6 可一并改）。时间窗（本周提交 / 读数）不动。

- [ ] **Step 2: `cargo test -p bw` 和 `cargo check -p app-shell`**
Expected: 旧标题常量编译失败处都改完，测绿。

- [ ] **Step 3: Commit** — 停。

---

### Task 4: 创建 / 删除 / 发版守 v0.x

**Files:**
- Modify: `crates/bw/src/app/plan.rs`（`create_plan_version` / `delete_plan_version` / `cut_release`）
- Modify: `crates/bw/src/command.rs`（注释改口）

**Interfaces:**
- Consumes: `is_v0x`、`inventory`（发版时：`version` 必须在未发集合里）
- Produces: 非法名 / 撞名 / 发一个不存在或已发的号 → `AppError::Refused` 人话

- [ ] **Step 1: `create_plan_version` 开头**

删掉 `looks_like_week` 拒收（周号本来就不是 v0.x）。改为：

```rust
if !crate::version::is_v0x(&name) {
    return Err(AppError::Refused("版本名必须是 v0.1 这种".into()));
}
```

撞名：现拉 issues + list_milestones + 已有 `bw:released:` / 远端 Release 名，用 `inventory`。`plan_names` 含里程碑和标签，`released_names` 含已发。`name` 落在任一集合 → `Refused("{name} 已经有了")`。

`delete_plan_version`：非法名拒收；已发拒收（「已发过，不能删」）。

`cut_release`：`!is_v0x(&version)` 拒收；`released` 已含该号拒收；`plan_names` 不含该号拒收（「先有计划版本 {version} 再发」）。壳保证传入正在看的号，内核仍守。

- [ ] **Step 2: `cargo check -p bw`**
Expected: 过。

- [ ] **Step 3: Commit** — 停。

---

### Task 5: 改名命令（里程碑 + 标签定义 + issue 上的标）

**Files:**
- Modify: `crates/bw-engine/src/codehub.rs`
- Modify: `crates/bw-engine/src/remote.rs`
- Modify: `crates/bw/src/command.rs`
- Modify: `crates/bw/src/app/mod.rs`
- Modify: `crates/bw/src/app/plan.rs`
- Modify: `crates/bw/src/app/issue_store.rs`

**Interfaces:**
- Consumes: Task 4 的撞名/已发守卫
- Produces:
  - `Command::RenamePlanVersion { project_id: ProjectId, from: String, to: String }`
  - `Event::PlanVersionRenamed { project_id, from, to, issues_moved: u32 }`
  - `Remote::rename_plan_milestone(path, from, to)`
  - `Remote::rename_plan_label(path, from_label, to_label)`（`bw:plan:旧` → `bw:plan:新`）

- [ ] **Step 1: codehub 两条**

GitLab：先 `list_milestones` 按 title=`from` 拿 id，再 `PUT /api/v4/projects/:id/milestones/:milestone_id` body `{"title": to}`。找不到当 `Err`。

标签：`PUT /api/v4/projects/:id/labels`（或该宿主现有改标签口）`name=bw:plan:{from}&new_name=bw:plan:{to}`。没有改名口就：确保新标签存在 → 每张 issue 换标（下一步）→ 删旧标签。失败人话往上抛。

GitHub / mock：`rename_plan_milestone` 返 `Ok(())`（不投）；`rename_plan_label` mock 里若有 label 表就改，没有就空过。issue 换标走已有 `update_issue` namespace-replace，mock 必须真换，否则壳读回还是旧号。

- [ ] **Step 2: `rename_plan_version` 用例**

```rust
pub(super) async fn rename_plan_version(
    &mut self,
    project_id: ProjectId,
    from: String,
    to: String,
) -> Result<Vec<Event>> {
    let from = from.trim().to_string();
    let to = to.trim().to_string();
    if !crate::version::is_v0x(&from) || !crate::version::is_v0x(&to) {
        return Err(AppError::Refused("版本名必须是 v0.1 这种".into()));
    }
    if from == to {
        return Ok(vec![]);
    }
    // 已发 from、或 to 撞名 → Refused（人话与 Task 4 同一句）
    // 1. rename_plan_label(bw:plan:from → bw:plan:to)
    // 2. 每张 plan_version==from 的活 assign_to_plan(..., &to)（换标+挂新里程碑名）
    // 3. rename_plan_milestone(from → to)
    // 任一步失败整条失败；不要先改一半再吞错。顺序：先标签定义，再 issue，再里程碑。
}
```

`assign_to_plan` 已经 namespace-replace `bw:plan:` 并摘 `bw:week:`，复用它做 issue 侧同步。

`app/mod.rs` match 接上；`command` 日志一行 `RenamePlanVersion from= to=`。

- [ ] **Step 3: `cargo check -p bw -p bw-engine`**
Expected: 过。

- [ ] **Step 4: Commit** — 停。

---

### Task 6: 版本目标文案 + 提示词灌上一发/未发

**Files:**
- Modify: `crates/bw/src/app/week_comment.rs`
- Modify: `standard/skills/week-planning/check-week-comment.py`
- Modify: `standard/system-prompt/references/week-plan-comment.md`
- Modify: `standard/skills/week-planning/SKILL.md`
- Modify: `standard/system-prompt/SYSTEM.md.tmpl`（文末加 `{{version_context}}`）
- Modify: `standard/VERSION` → `5.11`
- Modify: `crates/bw/src/standard/system_prompt.rs`（那句「周目标」）
- Modify: `crates/bw/src/app/bootstrap.rs`
- Modify: `crates/bw/src/app/issue.rs`（开工渲染）
- Modify: `crates/bw/src/app/plan.rs`（运作活① body 引导语）
- Modify: `crates/bw/src/derive/mod.rs`（健康四句）
- Modify: `standard/skills/asset-audit/SKILL.md`、`metrics-refresh/SKILL.md` 里点名周目标的句子

**Interfaces:**
- Consumes: `VersionInventory`、`HEADING_GOAL`
- Produces: 新评论必须 `## 版本目标`；读仍认 `周目标`/`本周目标`；运作活①提示词里能读到三行灌词

- [ ] **Step 1: 评论标题**

```rust
pub const HEADING_GOAL: &str = "版本目标";
const GOAL_ALIASES: &[&str] = &["版本目标", "周目标", "本周目标"];
```

`validate_comment` 仍要求三个二级标题，第一个是 `版本目标`。旧测改新标题；保留 `alias_本周目标_still_reads`。

`check-week-comment.py`：`HEAD_GOAL = "版本目标"`。

- [ ] **Step 2: 灌词**

`SYSTEM.md.tmpl` 在 `{{skill}}` 后加一行 `{{version_context}}`。

`agent_system_prompt` 增加参数 `version_context: &str`（空串=不加段）。运作活①开工时：

```text
本周版本（人确认之前不要打标）：
- 上一发：v0.1（没有就写「没有」）
- 未发：v0.2（没有就写「没有」）
- 推荐下一号：v0.3
确认后：标题改成「更新指标 + 制定版本计划 v0.x」，打 bw:plan:v0.x，里程碑同名。不要打 bw:week，不要起 W35。
```

`issue.rs` 三处 `agent_system_prompt`：先 `inventory(...)`，仅 `issue.workflow == OPS1_WORKFLOW` 时填这段，其余 `""`。

剧本第三步：先确认本周版本，再谈版本目标和纳入。纳入打 `bw:plan:v0.x` + `bw:category:*`。

- [ ] **Step 3: `cargo test -p bw week_comment` 和 `python standard/skills/week-planning/check-week-comment.py` 对一份新稿**
Expected: 新稿过、缺「版本目标」非零退出。

- [ ] **Step 4: Commit** — 停。

---

### Task 7: 计划屏 / 总览 / 项目墙（除就地改名）

**Files:**
- Modify: `crates/app-shell/src/vm.rs`（`last_released` / `unreleased` / `suggested_next`）
- Modify: `crates/app-shell/src/bridge/vm_build.rs`
- Modify: `crates/app-shell/src/screens/plan/mod.rs`（下拉不要周；发版用 `viewing_plan`）
- Modify: `crates/app-shell/src/screens/plan/plan_dialogs.rs`
- Modify: `crates/app-shell/src/screens/plan/list_view.rs`、`detail.rs`、`kanban.rs`（排期选项只剩 v0.x）
- Modify: `crates/app-shell/src/screens/overview/mod.rs`
- Modify: `crates/app-shell/src/screens/wall/mod.rs`
- Modify: `crates/app-shell/assets/hifi.css`（若空态 class 要跟）

**Interfaces:**
- Consumes: `VersionInventory`、`PlanVersionVm.released`
- Produces: 人对得上原型步 1/3/4

- [ ] **Step 1: VM**

`ProjectVm` 加 `last_released: String`、`unreleased: Vec<String>`、`suggested_next: String`。`vm_build` 用 `bw::version::inventory` 填。`week_started` 用 Task 3 的函数。总览进度：本周运作活①的 `plan_version`（合法才算），按挂了这个号的活计数；还没有就空态「还没有确认本周版本」。

- [ ] **Step 2: 计划屏下拉**

`view_opts` 只留 `全部 issue` + `version:{name}`。删掉 `week:` 项。看版本时标题就是 `viewing_plan`。

发版本：只在 `!view_all && !viewing_plan.is_empty()`。`ReleaseDraft.version = viewing_plan.clone()`，不要 `default_release_version`。

新建 issue：`viewing_plan` 非空打 plan；否则两个都空（待办池）。不要再写 `week_of`。

`CreateVersionDialog`：`name` 初值 `p.suggested_next`；提示一行「上一发 · 未发 · 推荐」；`is_v0x` 且不在已有/已发里才 `can_create`。占位「例如 v0.3」。删掉「和发版号不是一回事」那句。

`ReleaseDialog`：版本号 `<input readonly>`。没有上一发提示。

`ScheduleDialog`：只列 `p.plan_versions`，不列周。

- [ ] **Step 3: 总览 / 墙**

横幅：「开始本版本」；文案「还没开始「更新指标 + 制定版本计划」」。墙：`版本目标:还没定` / `版本目标:{短}`。计划屏空目标：`（这个版本还没写版本目标）`。

- [ ] **Step 4: `cargo check -p app-shell`**
Expected: 过。

- [ ] **Step 5: Commit** — 停。

---

### Task 8: 版本视图左上角笔 / 勾

**Files:**
- Modify: `crates/app-shell/src/screens/plan/mod.rs`（工具条 `.left`）
- Modify: `crates/app-shell/assets/hifi.css`（`.ver-wrap` / `.icon-btn` / `.icon-btn.ok`，对齐原型）
- Modify: `crates/app-shell/src/bridge/mod.rs`（若改名成功要改 `ui.viewing_plan`）

**Interfaces:**
- Consumes: `Command::RenamePlanVersion`、`PlanVersionVm.released`
- Produces: 原型步 5 的交互

- [ ] **Step 1: 就地编辑**

仅当 `!p.viewing_plan.is_empty()`。未发布（`plan_versions` 里该项 `released == false`）才画笔。

状态用两个 `use_signal`：`editing: bool`、`draft: String`。

- 展示：`span.ver-wrap` 里版本名 + 右上角 `✎`（`title: "改名"`）
- 点笔：`editing=true`，`draft=viewing_plan`，笔藏、绿勾出，input 聚焦
- 点勾：
  - `to` 非法或撞名（本地用 `is_v0x` + `last_released`/`plan_versions`/`unreleased` 预判，内核仍守）→ toast，`editing=false`，draft 丢弃，左上角仍是旧名，不发命令
  - 通过 → `Command::RenamePlanVersion { from: viewing_plan, to }`，`editing=false`
- Esc 或 `viewing_plan` 变了（切视图）：`editing=false`，不发命令

收到 `PlanVersionRenamed` 后：`ui.viewing_plan = to`（在 `bridge/mod.rs` 事件匹配里），下拉和左上角跟新号。失败 toast 用内核人话，左上角保持旧名。

已发：只显示号，无笔。

- [ ] **Step 2: `cargo check -p app-shell`**
Expected: 过。本机点：未发可改、撞名回退、已发无笔。

- [ ] **Step 3: Commit** — 停。

---

### Task 9: 词表、架构、指南、高保真、CHANGELOG

**Files:**
- Modify: `CONTEXT.md`（立「版本目标」；改「计划 / 版本」；「迭代」条不再写周目标）
- Modify: `docs/architecture.md` 模块 13 / 4 / 14 相关句
- Modify: `docs/guide/v4-产品指南.html`、`docs/hifi/index.html`、`docs/hifi/README.md` 里对人说的周目标 / 开始本周 / 周下拉（指标卡 `weekTarget`「本周目标 ≥3」不改）
- Modify: `CHANGELOG.md` 顶上记一行
- Modify: `AGENTS.md` 出包附近若仍写「周目标」当现行口令的，改掉（历史 CHANGELOG 旧条不回改）
- Modify: `changes/version-as-v0x/STATUS.md` → spec 已审、实现中
- Modify: `crates/bw/src/app/plan.rs` 文件头注释、`command.rs` 旧注释

**Interfaces:**
- Consumes: 规格用词
- Produces: 人看的正本与壳一致

- [ ] **Step 1: 改文档**（按规格「词表与剧本」清单，03 不动）
- [ ] **Step 2: 门禁**

```bash
cargo fmt --all --check
cargo clippy --workspace -- -D warnings
cargo check -p app-shell
cargo test --workspace
```

本机再跑仓里的 `scripts/guard-*.sh`（与 CI 一致的那组）。Windows 上 bash 脚本按本机现有方式跑。

Expected: 全绿。

- [ ] **Step 3: Commit** — 停。

---

## Spec coverage

| 规格条 | 任务 |
|---|---|
| `v0.x` 三处同一串 | 1, 4, 5 |
| 不写 `bw:week:*` | 2, 3 |
| 运作活①标题 + 标签去重 | 3 |
| 会话确认 + 灌上一发/未发/推荐 | 6 |
| 创建弹窗提示 | 7 |
| 发版锁死当前号、无提示 | 4, 7 |
| 笔/勾改名、撞名回退、三处同步 | 5, 8 |
| 已发无笔 | 8 |
| 旧非 v0.x 未分配 | 2 |
| 版本目标文案 | 6, 7, 9 |
| 健康时间窗 / 资产盘点 / 03 不动 | 3, 9（明确不改） |
| R1–R6 | 4+5+7+8+6+9 |

## 不做（计划里不要顺手做）

- 不改 `principles/03`
- 不迁旧周标签
- 不改资产盘点 `资产盘点 {week}` 和周五 tick
- 不把运作活①改成按版本号一人一张、与周无关
- 不改指标卡上的「本周目标 ≥3」
