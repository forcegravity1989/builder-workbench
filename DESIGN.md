# DESIGN.md — 设计指向

> **30 秒导读**:这份文件不写设计正文,只指路——buddy 的设计在哪、各模块设计在哪、被管项目用的 workflow 自带文档去哪找。给接手任何模块的人看。改这份 = 改设计索引,过评审再合。

## 设计在哪

- **各特性模块的自足设计** → [`docs/modules/`](docs/modules/):每份说清这个模块是什么 / 代码在哪几层 / 数据落哪 / 依赖什么 / 产出与验证 / 没建什么。**不同人凭一份模块设计就能接手该模块**。模块清单见该目录 README。
- **规范与赋能模型**(buddy 给被管项目的三来源两路径 + 文档集 + 边界)→ [`docs/convention.md`](docs/convention.md)。
- **产品命题** → [`plan/07-product-proposition.md`](plan/07-product-proposition.md);**设计事实源台账** → [`plan/06-overall-alignment.md`](plan/06-overall-alignment.md)。
- **架构决策(难回头)** → [`docs/adr/`](docs/adr/),一条决策一篇。
- **视觉正本**(高保真原型,单文件浏览器可点)→ [`docs/v4-prototype/hifi/index.html`](docs/v4-prototype/hifi/index.html) + 逐屏简报 [`docs/v4-prototype/hifi/README.md`](docs/v4-prototype/hifi/README.md);桌面壳样式表从它整体搬过去。

## workflow 自带文档去哪找

被管项目按 issue-policy 给构建类活挂的 workflow(build 默认 `mattpocock-skills`、原型默认 `proto-design`,可换),其自带文档由该 workflow 自己承载——buddy 不重抄,只在 `docs/modules/系统提示词与渐进加载.md` 指明怎么注入。若该 workflow 有自己的设计/约定文档,以它为准;`DESIGN.md` 只做指向,不替它写。

## 没建什么(如实)

- 默认 workflow(mattpocock-skills / proto-design)的**打包**(buddy 把已严选的默认 workflow 进资产目录、开机即用)未实现——见 [`docs/modules/系统提示词与渐进加载.md`](docs/modules/系统提示词与渐进加载.md) 的"没建什么"。
- Open Design 适配模块(壳侧)、产物入仓约定、蒸馏、若干模块设计的细节——见各模块设计"没建什么"段,不在这里汇总第二份清单。
