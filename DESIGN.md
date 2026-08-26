# DESIGN.md — 设计指向

> **30 秒导读**:这份文件不写设计正文,只指路——buddy 的设计在哪、产品指南在哪、决策在哪、视觉正本在哪。给接手任何模块的人看。改这份 = 改设计索引,过评审再合。

## 设计在哪

- **设计正本(三 crate 架构 + 工作流模型 + 16 模块核心设计)** → [`docs/architecture.md`](docs/architecture.md):一篇讲清 buddy 是什么(设计)、三个 crate 怎么互锁、工作流模型(三来源两路径/系统提示词/默认 workflow/数据流/四铁律)、16 个模块各自解决什么问题。人和 AI 都能在这份里快速检索到任一模块的核心设计。
- **架构决策(难回头一条一篇)** → [`docs/adr/`](docs/adr/)。
- **视觉正本**(高保真原型,单文件浏览器可点)→ [`docs/hifi/index.html`](docs/hifi/index.html) + 逐屏简报 [`docs/hifi/README.md`](docs/hifi/README.md);桌面壳样式表从它整体搬过去。
- **产品指南**(怎么用 buddy,给用户/同事)→ [`docs/guide/`](docs/guide/)。

## workflow 自带文档去哪找

被管项目按 issue-policy 给活挂的 workflow(build 默认 `mattpocock-skills`、原型默认 `proto-design`,可换),其自带文档由该 workflow 自己承载——buddy 不重抄,只在 `docs/architecture.md` 的「系统提示词与渐进加载」模块指明怎么注入。若该 workflow 有自己的设计/约定文档,以它为准;`DESIGN.md` 只做指向,不替它写。

## 没建什么(如实)

- `mattpocock-skills` 已打包、开机即用；`proto-design` 源还没 vendor 进来——见 `docs/architecture.md`「系统提示词与渐进加载」模块「没建什么」。
- Open Design 适配模块(壳侧)、产物入仓约定、蒸馏——见各模块「没建什么」,不在这里汇总第二份清单。B/C 读数写入端已接(账本 worktree `bw/ledger`)。
