---
name: workbench-release
description: Use when 在 Builder Workbench 仓请求生成 Windows Workbench 安装包，或将该安装包发布为 GitHub Release。普通开发、PR 交付和 Orca 官方 release-cut 不用。
---

# workbench-release：出包与发布 Windows Workbench

## 1. 核心目标

生成 Windows Workbench 安装包，或把本次安装包发布为 GitHub Release。出包不等于发布；没有用户明确授权时不创建远端 Release。

## 2. When to Use / When NOT to Use

- 用户说“出包”“打 Windows Workbench 包”时执行出包流程。
- 用户说“发版本”“发布 Release”时执行发布流程。
- 不用于 Orca 正式版的 `.github/workflows/release-cut.yml`，也不替代普通 commit、PR 或合入流程。

## 3. 前置依赖检查

在仓库根目录确认 `package.json` 和 `config/scripts/build-win-workbench.mjs` 存在。记录 `git status --short` 与 `git rev-parse HEAD`；发布前再确认 `gh auth status`、远端仓库和目标标签。

## 4. 标准执行流程

### 出包

1. 运行 `node config/scripts/build-win-workbench.mjs`。
2. 成功后核对 `dist/orca-windows-setup.exe`；同时记录存在的 `dist/orca-windows-setup.exe.blockmap` 和 `dist/latest.yml`。
3. 汇报产物路径、大小、HEAD 和未验证项。不要创建标签或 Release。

### 发版本

1. 必须获得用户对正式发布和标签的明确授权。未指定标签时，以 `package.json` 的版本形成 `v<version>`，展示该标签并确认后再写远端。
2. 确认安装包来自待发布 HEAD，且该提交已存在于远端；不确定时重新出包或停止说明。
3. 用 `gh release view <tag>` 检查重复。已存在则停止，不覆盖、不删除，除非用户另行明确要求。
4. 执行：

   ```bash
   gh release create <tag> dist/orca-windows-setup.exe dist/orca-windows-setup.exe.blockmap dist/latest.yml --target <HEAD> --title "Workbench <version>" --generate-notes
   ```

5. 用 `gh release view <tag> --json url,tagName,isDraft,isPrerelease,assets` 读回并汇报链接和资产。

## 5. 参考资源

- `config/scripts/build-win-workbench.mjs`：Windows Workbench 唯一出包入口。
- `config/electron-builder.config.cjs`：确认安装器和更新元数据的实际产物名。
- `src/renderer/src/workbench/SYNC.md`：Workbench 壳的打包环境与边界。

## 6. error_handling

| 现象 | 处理 |
|---|---|
| mjs 出包失败 | 保留首个真实错误，定位构建或依赖问题；不发布旧产物 |
| 任一发布资产缺失 | 停止发布，重新出包并核对 `dist/` |
| 标签或 Release 已存在 | 停止并报告现状，不自动覆盖 |
| HEAD 未在远端或 `gh` 未登录 | 停止发布，说明需要的 push 或登录动作 |

## 7. 示例

输入：“出包并发版本 v1.4.198。”动作：运行 mjs、核对三个资产与 HEAD、检查标签不存在、创建 GitHub Release、读回结果。输出：Release URL、标签、提交和资产列表。

## 8. 纪律表

| 必须 | 禁止 | 越界信号 | 你不做的事 |
|---|---|---|---|
| 区分出包与发布；发布后读回 | 未授权创建 Release；上传旧包 | 需要覆盖标签、删 Release、改官方 release-cut | 不合并 PR、不关闭 Issue、不替用户决定版本号 |
