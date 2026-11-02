# Orcad 原生构建依赖

> 给维护 BW 打包和同步 Orca 的开发者。此目录只镜像固定上游的原生依赖归档与来源，不保存应用、BW 业务或 Orca 模板 JavaScript。升级原生输入或上游版本时重新核对归档与来源；日常打包由现有 Windows 命令自动准备。

归档来自 Orca v1.4.245 的 [官方发布构建](https://github.com/stablyai/orca/actions/runs/41005607567)。`source.json` 保存真实 checkout SHA、归档 SHA256、构建 ID 与已核对的源文件指纹。保留原归档是因为 GitHub Actions 产物会到期；普通内部出包无需 GitHub Actions 权限或额外下载步骤。

`prepare-workbench-orcad-prebuilds.mjs` 验证源输入、ABI 与归档哈希，再沿原生 `merge-orcad-prebuilds.mjs` 准备所有平台的 node-pty 依赖。Windows security、process-tree 和服务端 CLI 只进入 `.build` 的对应模板输入。服务端 CLI 由原生启动流程生成 `orca-launcher.cfg` 指向实际 BW CLI；桌面 `resources/bin/orca.exe` 继续从 BW 源码单独构建。

随后 `build:orcad-template` 使用当前 BW 源码构建服务及共享依赖，保留完整模板校验；不复用上游模板 JavaScript，不恢复 Mobile。运行 `node config/scripts/prepare-workbench-orcad-prebuilds.mjs --check` 只验证归档与兼容性，不编译或启动原生二进制。
