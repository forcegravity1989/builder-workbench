# 规范来源读取

> 提单助手在本机没有 BW 源码、或源码相对链接不可读时完整读取。只定位规范正本，不复制规范正文；Skill依赖版本变化时同步核对以下固定来源。

先使用入口准备好的完整 Skill 包及其重写后的依赖路径。有可访问的 BW 仓时可读取对应版本原文。两者都没有时，可用当前已授权的 GitHub 读取工具读取下表固定版本的 Markdown 原文，无需 clone BW；不要只读网页摘要。包内文件和固定来源均不可访问时，保留材料并报告具体缺项，不声称已经按未读规范提单。

本首版核对的规范基线为 `af335e3dd1920bcc427a38f3f67716fdc3619b7c`，固定来源属于 BW 自身仓库，与用户当前业务项目无关。

| 读取内容        | 固定原文来源                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 通用 Issue 规范 | [issue-state.md](https://github.com/forcegravity1989/builder-workbench/blob/af335e3dd1920bcc427a38f3f67716fdc3619b7c/standard/references/issue-state.md) |
| BW 特性归属     | [特性矩阵](https://github.com/forcegravity1989/builder-workbench/blob/af335e3dd1920bcc427a38f3f67716fdc3619b7c/docs/05-features/README.md)               |
| 工具选择方法    | [execution.md](https://github.com/forcegravity1989/builder-workbench/blob/af335e3dd1920bcc427a38f3f67716fdc3619b7c/standard/references/execution.md)     |

用 GitHub API 读取时，按上述仓、版本和路径读取内容 API 的原文；读取工具的身份与权限沿宿主现有配置，不为反馈修改凭据。只按本次动作加载必需正文，矩阵中的其他特性文档按实际问题需要读取。当前行为可能与规范基线有差异时，将版本差异列为待核对事实，不用旧规范覆盖新现场。
