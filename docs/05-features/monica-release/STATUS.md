# STATUS — Windows 出包与发布

> **维护约定**：给交付和验收者读取，只登记本特性的六环状态、可追溯证据和未验证边界。价值见 [intent.md](intent.md)，操作契约见 [spec.md](spec.md)。状态或证据变化时更新对应行，不保存开发流水、历史取舍或遗留台账。

## 当前结论

Monica 的固定发布动作已由 `.github/workflows/bw-release.yml` 承接，本机脚本保留为试用和兜底。现有发布证据支持三资产出包、授权后发布读回和单节版本描述规范；R04 的失败分支和 R06 的真实验收报告仍缺运行证据。安装包安装、更新链和报告收尾需要在对应环境独立验证。

这是研发保障资产，没有独立的 Builder 用户结果。当前不登记 W01–W05 用户旅程 E2E。RJ01 保留为历史链路标识，不能计入用户旅程覆盖。

## 六环登记

| 环 | 状态 | 当前依据与入口 |
| --- | --- | --- |
| 1 intent | ◐ | 用户结果、价值、范围和排除见 [intent.md](intent.md)。 |
| 2 spec | ◐ | 出包、发布、正文规范、报告归档和 R01–R06 见 [spec.md](spec.md)。 |
| 3 实现设计 | ◐ | [monica-release 技能](../../../.claude/skills/monica-release/SKILL.md)、`.github/workflows/bw-release.yml`、`build-win-workbench.mjs`、`release-win-workbench.mjs` 以及两份正文规范和模板。该入口是脚本与 workflow 资产，没有单独 `design.md`。 |
| 4 TDD / 协议看护 | ◐ | `config/scripts/release-win-workbench.test.mjs` 覆盖标签解析、资产核对、gh 参数、授权闸、阻断项聚合和版本账本门禁。出包脚本本身没有独立单测。 |
| 5 验收点 E2E | ◐ | R01–R06 是发布工具操作验收点。R01、R02、R03、R05 有真实发布证据，R04 失败分支和 R06 报告尚未实走。当前没有注册到 `tests/e2e` 的 Monica 业务 E2E。 |
| 6 用户旅程 E2E | — | 研发保障能力没有独立 Builder 用户旅程。历史 RJ01 只作 crosswalk 线索，不计入 W01–W05，也不注册为当前 E2E。 |

## 验收点证据

| 标识 | 状态 | 入口 | 当前证据或缺口 |
| --- | --- | --- | --- |
| R01 | ● | `build-win-workbench.mjs` | 真实发布证据确认三个资产齐全，出包阶段未创建标签或 Release。 |
| R02 | ● | 技能授权闸与只读预演 | 真实发布证据确认未获授权时远端不变化。 |
| R03 | ● | workflow 发布与 `gh release view` 读回 | 真实发布证据确认标签、目标提交和三个资产一致。 |
| R04 | ◐ | workflow 与发布脚本阻断项 | 标签已存在、资产缺失、未登录等失败分支没有独立运行记录。 |
| R05 | ● | 版本描述规范、模板和 workflow `notes` 输入 | 真实发布证据确认正文按「这版有什么变化」单节发布并读回核验。 |
| R06 | ◐ | 验收报告规范、模板和 `preparedArtifacts` 登记 | 仓内规范与模板存在，尚无一份真实版本收尾报告的读回证据。 |
| RJ01（历史） | ◐ | 出包、正文、授权发布、读回和报告归档链 | 既有证据走到发布读回，验收报告段未执行。该标识保留作历史 crosswalk。 |

## 未验证边界

- 安装包真实安装和升级链仍需在目标 Windows 环境验证。
- 版本账本校验已在 workflow 和本机脚本中接入，安装与升级验证仍需对应环境独立执行。
- 失败分支、验收报告真实收尾和报告登记读回尚未形成独立运行证据。
- 本地脚本与 GitHub runner 的一致性需要在 Actions 运行中复核。
