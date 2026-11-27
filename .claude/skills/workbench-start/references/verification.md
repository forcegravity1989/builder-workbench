# 验证执行参考

> **读者与时机**：准备 BW 验证环境或发布截图的模型与开发者；AGENTS 直达的[开发规范](../../../../docs/development.md)与 workbench-start 均可指向本篇。**职责**：只维护通用工具入口、命令与失败处理，判据归开发规范，Windows/Codex 专属操作归 [codex.md](codex.md)。结构为环境准备 → 截图发布；脚本、启动入口或记录格式变化时同步调用处，不记录单次运行结果。

## 环境准备

主 checkout 的 `.bw/runtime/verification/environment.json` 可保存本机已确认的工具、限制和验证 profile，忽略不提交；它是机器观察记录，不是团队并发配置。未实际测得的限制保持未知，不能用一台外部机器的并发数约束内部宿主。PID、端口与连接现场核对，不把单机限制推广到所有宿主。首次、换机器或记录失效时运行：

```text
node .claude/skills/workbench-start/scripts/run-bw-verification.mjs prepare --root <当前工作树> --assistant codex
```

Claude 使用 `--assistant claude`。脚本定位记录并检查现有 profile/项目；缺依赖沿项目 setup，缺 profile/项目沿原生 dev 启动和纳入入口准备，再核对登记与真实界面。`prepare` 只准备并记录机器事实，不启动 Electron、不会创建 CDP 连接，也不等于可以验收。记录存在或启动成功不代表环境可用；未知账号/网络能力保持未知，确需用户独有条件才询问。Windows Codex 真壳操作再完整读取 [Codex 执行参考](codex.md) 的真壳验证部分。

## 真实 dev 验证最短路径

1. 先在任务 worktree 读取 `git rev-parse --show-toplevel`、当前分支和 HEAD，核对已有 dev 实例的源码根、profile、窗口和端口；匹配就复用，不匹配才启动新的实例。内部机器可按已确认资源并行运行两个或更多 dev；本机记录中的 `maxConcurrentHeavyJobs` 不能当成仓库规则。
2. 需要用户直接操作、截图或看前后效果时，在任务根目录运行可见的原生入口：

   ```powershell
   pnpm run dev:workbench
   ```

   它使用持久 `workbench-dev` profile。启动后等待窗口和 Vite 就绪，确认窗口加载的是本次 task worktree 的源码；只有“进程已启动”不能作为验证证据。

3. 需要自动化或让窗口不抢前台时，使用 [Codex 执行参考](codex.md) 的后台 CDP 入口。runner 会自动探测未占用端口（如需固定端口再显式设置 `REMOTE_DEBUGGING_PORT`），启动日志出现 `Remote debugging on http://127.0.0.1:<port>` 后，再用 CDP 读取页面、窗口和 renderer 地址，并核对源码 HEAD。后台实例仍沿用已确认的 profile；并行实例若发生 Electron 单实例或 profile 锁冲突，按宿主实际支持的独立 profile/端口运行，不为每个 Issue 随意新建空 profile。
4. 本次 Issue 的截图、日志、CDP 读数和复现步骤放在 `.bw/runtime/verification/<issue>/`；`environment.json` 只放机器级观察，不覆盖任务证据。关闭或重启实例前保留 PID、端口与结果，不能把历史 `uiEvidence` 当成本次验证。

## 截图发布与读回

准备 manifest，例如 `{"files":[{"file":"before-plan.jpg","name":"before.jpg"},{"file":"after-plan.jpg","name":"after.jpg"}]}`。`file` 相对 manifest 所在目录或为绝对路径；`name` 为证据树中的唯一图片名。

```text
node .claude/skills/workbench-start/scripts/publish-pr-evidence.mjs publish --root <当前工作树> --repo OWNER/REPO --branch shots/本任务分支 --manifest .bw/runtime/verification/图片清单.json --out .bw/runtime/verification/图片结果.json --push
# 在已获授权的 PR 写入验证评论后，检查 GitHub 实际渲染的图片地址。
node .claude/skills/workbench-start/scripts/publish-pr-evidence.mjs check --comment 'https://github.com/OWNER/REPO/pull/编号#issuecomment-评论ID' --out .bw/runtime/verification/评论图片检查.json
```

省略 `--push` 只准备本地证据提交。脚本不切分支、不改工作区或索引；仅收录清单图片，二进制 NUL 构树，生成钉 SHA 的 GitHub raw 地址。推送后读回图片格式和内容指纹，评论后再查渲染图片，失败时修原报告再交付。
