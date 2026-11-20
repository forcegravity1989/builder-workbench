# intent — 内部集成

> **维护约定**：给产品、设计、实现和验收者读取。本篇只维护用户结果、价值、范围、排除和旅程归属。当前行为见 [spec.md](spec.md)，证据边界见 [STATUS.md](STATUS.md)。原型 [prototype.html](prototype.html) 只表达设计输入，不作为生产证据。

## 用户结果

Builder 在 Monica 的设置 → 集成中可以确认任务、评审和诊断报告所依赖的本机 CLI 状态。缺少 CLI 或登录状态时，页面提供对应的安装或登录入口。完成配置后，状态从真实探测读回，重启后仍能独立确认当前状态。

## 价值与依据

集成页把项目工作所需的外部 CLI 收到一个入口，减少跨终端查状态和复制命令。来源为 [#323](https://github.com/forcegravity1989/builder-workbench/issues/323) 及其承接的安装引导问题，CloudBuild 入口来自 [#366](https://github.com/forcegravity1989/builder-workbench/issues/366)。多 Builder 的使用效果尚未量化。

## 范围

- 设置 → 集成显示 GitHub（`gh`）、CodeHub（`codehub-cli`）、WeLink（`welink-cli`）和 CloudBuild（`cb`）四张卡。
- 本机状态按未安装、未登录、已连接、检查中和不可用显示。未安装时提供安装入口，未登录时提供卡内登录终端，已连接时只提供重新检查。
- GitHub 安装沿用外链。CodeHub、WeLink 和 CloudBuild 使用规格中的安装命令。登录命令填入复用的卡内终端，由 Builder 按 CLI 提示完成设备码、扫码或其他交互。
- 设置页和 Monica 入门复用同一检测、安装和登录能力。远端运行时只读状态，不在远端显示本机安装和登录动作。WSL 工作树仍按本机范围处理。

## 排除

不新增通用命令执行器，不改变其他 provider 的原生能力，不管理 CLI 版本升级，不承接任务详情、评审通知、报告内容或版本验收行为。CodeHub 任务行为归 [codehub 特性](../codehub/intent.md)，报告与验收结果归对应特性维护。

## 旅程归属

本特性是 W03「构建交付」和 W04「验收成果」的集成前置能力。GitHub、CodeHub 的登录状态支撑 W03 的任务和评审入口，WeLink 的可用状态支撑 W04 的报告与诊断出口，CloudBuild 的状态支撑构建入口。集成本身没有独立的 Explore 用户结果，因此不创建新的 W03 或 W04 用户旅程 E2E。

IJ01「四 CLI 全缺 → 安装并登录 → 重新检查全绿 → 重启后仍绿」是旧特性旅程标识，只保留作 crosswalk 线索，不作为当前用户旅程登记。

## 成功判据

在本机设置中，四张卡均能从当前探测显示状态。安装和登录动作只在适用范围出现，命令结束后状态重新读回。远端状态不可得时显示不可用，不显示假绿灯。进程重启后状态仍来自新的探测结果。完整四 CLI 登录、安装、重新检查和重启证据仍以 [STATUS.md](STATUS.md) 的未验证边界为准。
