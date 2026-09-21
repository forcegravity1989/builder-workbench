# 项目接入与项目约定 — STATUS

- **特性状态**：已交付且在用（真实壳主入口之一；v0.4 真实旅程首段）。
- **定义状态**：intent/spec 为回填定义草案（2026-09-20），人确认 = 批准该 PR。
- **链状态（[02 §6.2](../../01-principles/02-working-backwards.md) 六环）**：

| 环 | 状态 |
|---|---|
| 1 intent | 草案已回填（本目录） |
| 2 spec | 草案已回填（含验收点↔用例映射） |
| 3 实现设计 | architecture §1「接入」站 + `crates/app-shell/src/screens/onboard/mod.rs`、`crates/bw/src/app/project.rs`；06-module 无专篇（已知债） |
| 4 TDD | workspace 单测覆盖（特性归属清单按口径暂缓） |
| 5 验收点E2E | 4 条已注册（见 spec 映射表）；重复接入/权限失败待补 |
| 6 旅程E2E | desktop-onboarding（pr-onboarding profile）+ week-plan-journey 首段（pack profile） |

- **已知债**：06-module 无专篇；重复接入与失败验收点未注册用例。均随本特性带入重构或处理其 BUG 时按 02 §6.2 补。
