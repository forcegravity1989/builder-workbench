# Spec · `.bw/` 人机分目录 + 去冗留真

> **30 秒导读**:这是什么——本次变更的**规格件**:新布局、删除清单、注释纪律、迁移口径、验收。给谁看——过规格 gate 的人、实现批次的会话。现在作数吗——**在 gate**(2026-08-29);上游意图见同目录 `intent.md`,可点原型见 `prototype.html`。

## 设计拍板

### 1. 分层规则(一句话)

**机器逐字段解析的收进子目录,人与 agent 通读的 Markdown 留顶层**:

- `.bw/` 顶层 + `decisions/`、`design/` = 给人(和 agent)**读**的 Markdown;
- `.bw/config/` = 机器解析的配置,**人经 MR 改、机器只读**;
- `.bw/state/` = 机器写的台账与流水,**人只审不编**;
- `.bw/scripts/` = 可执行采集脚本(现状不动,只是归类点名)。

目录即回答「谁写的」:config 归人(经评审),state 归机器,顶层归共读。

### 2. 新布局(前后对照,全文见 prototype.html)

```
现在                            改后
.bw/                            .bw/
  PROJECT.md                      PROJECT.md            (不动)
  project.toml                    process-catalog.md    (不动,铺底落点)
  issue-policy.toml               releases.md           (不动)
  standard.toml                   decisions/  design/  plan/(不动)
  managed.toml                    config/
  metrics.toml                      project.toml
  metrics/readings.jsonl            issue-policy.toml
  scripts/                          metrics.toml
                                  state/
                                    managed.toml
                                    metrics-readings.jsonl
                                  scripts/              (不动)
```

### 3. 去冗清单(删什么 · 为什么 · 谁补位)

| 删 | 为什么 | 删后正本在哪 |
|---|---|---|
| `issue-policy.toml` 整个 `[[tool]]` 段 | 四字段零消费,探活/接法全在适配模块硬编码 | 适配模块代码(`tools.rs` / `probe_env` / `agent_for`) |
| `[review]` 段 | 零消费,能力未建 | 未建,如实不留空壳 |
| `ops1_trigger` / `ops2_trigger` | 仅显示用;行为硬编码(①人触发②看 schedule) | 配置屏文案写死「人触发/定时」,与行为一致 |
| `schema_version`(issue-policy) | 无校验 | 出现第二版格式时再引入并带校验 |
| `standard.toml` 整份 + `standard_file.rs` 解析器 + 模板 + 铺底清单 `meta` 条目 | 全仓零读方;对账正本是 managed.toml | `state/managed.toml`(每条目带版本与指纹) |
| `project.toml` 的 `standard_version` | 无代码维护的镜像,已失真 | 名片「规范 vX」从 `state/managed.toml` 现算条目最高版本;无文件显「—」(未决 1) |

### 4. 注释纪律(去冗的另一半)

- 机器盖章注释(各 `render()`/`write()` 硬编码文案)收敛到**每节至多一行字段语义**;「人手注释保存会被抹掉」的已知代价不变,提示保留。
- 历史决策碑文(「没有第六类别」「kind 与 category 别混」「不再有 drag_scope」)迁 `docs/architecture.md` 或对应 Rust 结构体 doc-comment,数据文件里删。
- **`metrics.toml` 顶部注释整段保留**——它是 skills 引用的填写格式正本,属于「真」。

### 5. 迁移口径

不写迁移代码、不双读旧路径。本仓自己的 `.bw/` 随实现批搬迁(同一批里 `state/managed.toml` 重记全部条目的新路径+新指纹,否则下次对账全判「人改过」)。其它旧布局项目:重新接入铺底;旧位置文件作为非 Workbench 资产如实并存,资产盘点剧本会盘出来,由人处置。

### 6. 版本

`standard/VERSION` 5.10 → **6.0**(布局级变更;未决 2)。

## 操作逻辑(主路径 / 分支 / 出错)

- **主路径**:接入铺底 → `PROJECT.md`(顶层)+ `config/issue-policy.toml` 落盘 → `state/managed.toml` 最后记指纹;名片编辑与远端 Intent UX 读写 `config/project.toml`;运作活①写 `config/metrics.toml`;采集追加 `state/metrics-readings.jsonl`;各屏现读现算,路径全走新常量。
- **分支(旧布局项目)**:`state/managed.toml` 不存在 = 视同未接管,boot 照常提议铺底;旧位置文件不迁不删,如实并存。
- **出错**:`config/` 文件含未知字段(含旧版残段)→ `deny_unknown_fields` 解析失败 → 壳的 `read_or_warn` 黄条如实报文件名与错误,不猜不兜;定时/映射按「没配」处理。

## FAQ 硬问题

- **为什么不留旧路径兼容?** AGENTS.md 纪律;且唯一在管项目是本仓,兼容层只服务不存在的用户。
- **为什么是三个子目录不是一个?** `config/` 与 `state/` 的写权归属相反(人经 MR vs 机器),混放就回到今天「谁写的靠注释解释」的原点。
- **为什么删 `[[tool]]`/`[review]` 而不是把它们实现?** 今天没有任何行为等着这些字段驱动;先删假的,真需要时按特性起手路径立项(留白如实标未建)。
- **手写注释还会被抹吗?** 会。界面保存仍整份重写,这是已认的代价;要留讲解就写进顶层 Markdown 或 docs。

## 明确不在本批

`.bw/plan/` 与 `releases.md` 的去留(只改引用路径,不动内容与机制);知识库屏除清单路径外不重构;不新增任何对账/校验能力;`scripts/` 机制不动。

## 要求与验收

- **R1 旧路径清零**:全仓(crates / standard / docs / e2e / examples)grep 不到旧路径字符串(`.bw/project.toml`、`.bw/issue-policy.toml`、`.bw/standard.toml`、`.bw/managed.toml`、`.bw/metrics.toml`、`.bw/metrics/readings.jsonl`);史料(CHANGELOG、changes/、adr、plan/ 归档)除外。
- **R2 死代码清零**:`ToolDecl`、`ReviewPolicy`、`standard_file` 及对应模板段全仓不复存在。
- **R3 门禁全过**:fmt / clippy / 壳编译 / 五守卫 / cargo test。
- **R4 E2E 读回**:对一个新接入项目铺底后 `cat .bw/config/issue-policy.toml`(瘦身后格式)、深链开总览读回名片与「规范 vX」、看板两列标题、到点 tick 建「资产盘点」活——全部与新路径正本一致。
- **R5 自狗食对账**:本仓 `.bw/` 搬迁后,对账全条目 UpToDate;`git status` 无旧位置残留。
