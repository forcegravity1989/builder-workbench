# 版本计划模板开发

> 这里是 BW 开发模板使用的源码与验证工具，不随 Skill 分发，也不复制到用户项目。出厂固定模板在 `standard/skills/week-planning/assets/version-plan.html`，运行脚本在同技能的 `scripts/planning.py`。

HTML 的 SE 结构和样式保存在出厂模板中；本目录的 `local-data.js`、`ui.js`、`local.css` 编入该模板，运行时不再加载这些源文件。构建不会读取项目版本内容。

在仓根运行：

```text
python -B scripts/version-planning/build_template.py
python -B scripts/version-planning/verify.py
python -B standard/skills/week-planning/scripts/planning.py --workspace <工作树> --version <已有版本> refresh
```

验证需要 Python lxml 和 Node，包含最终 HTML 脚本完整性、语法和文件协议检查。报告写入 `.bw/release/out/planning-checks/report.json`。服务使用原 planning.py 的 start/stop/status 管理；实际浏览器手填保存由用户验收；这些检查不替代浏览器实测。
