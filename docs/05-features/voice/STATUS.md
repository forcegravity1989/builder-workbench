# STATUS — 语音：听写与朗读

> **维护约定**：记录本特性六环现状。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)。环状态变化时随引发它的提交更新，不记流水。

**现状（2026-10-10）**：intent 已认、实现选型已裁（评审卡 <https://claude.ai/artifact/3utgbpR4X8qkbKp5DqeVtS> 回传，已回写 intent「已决」与 design §4）；第一版只做听写侧，朗读第二版；推理库升级一项未裁。没有一行实现；听写能力是 Orca 执行核自带（上游代码，BW 未改），不算本特性已交付。下一步：立 spec（带可点原型），并定术语库与人名库的正本。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ● | [intent.md](intent.md) 2026-10-10 人认（评审卡问 4 选「认，开 spec」），第一版范围定为听写侧。带入三问：新用户目标（语音对 agent 下指令、听回复），不服务已有特性 → 新特性 |
| 2 spec | ○ | 未立。验收点候选 V01–V10 在 [design.md](design.md) §3.1（V09 第二版），spec 立项时正式编号；可点原型未建（设置面可点样张在上面的评审卡里）；术语库与人名库的正本是立项前置 |
| 3 实现设计 | ◐ | [design.md](design.md)：§1 现状读码结论、§2 契约与按阶段的薄挂载清单、§3 里程碑、§4 已裁三项（承载 A、ITN A、协议 A），推理库升级未裁。未经技术评审 |
| 4 TDD | ○ | 无。计划只立后处理纯函数与协议校验单测（≤ 10 例，受 ratchet 约束） |
| 5 验收点 E2E | ○ | V01–V10 已定义，未注册、未执行 |
| 6 用户旅程 E2E | ○ | VJ01 / VJ02 已定义，未执行 |

## 验收点与旅程矩阵

口径：○ = 已定义未实现未执行。

| 验收点 | 状态 | 计划落点 | 证据 / 缺口 |
|---|---|---|---|
| V01 导入本机模型听写 | ○ | `main/workbench/speech/registry.ts` 导入 | 未实现 |
| V02 词典纠错与黑名单 | ○ | `postprocess/stages/lexicon.ts` + `lexicon.ts`（术语库 / 人名库编译） | 未实现；两个库的正本待定 |
| V03 数字转写 | ○ | `postprocess/stages/itn.ts` + `native/itn/` 小进程（2026-10-10 裁 A） | 未实现 |
| V04 句尾风格 | ○ | `postprocess/stages/punct-style.ts` | 未实现 |
| V05 端点测一下 | ○ | `main/workbench/speech/endpoints.ts` | 未实现 |
| V06 端点听写同流水线 | ○ | `engines/remote-stt.ts` | 未实现 |
| V07 重开读回与重测 | ○ | 设置新键 + 探测时间戳 | 未实现 |
| V08 线程数生效 | ○ | `engines/sherpa-stt.ts` | 未实现 |
| V09 朗读与打断 | 第二版 | `engines/sherpa-tts.ts` + `renderer/workbench/speech/read-aloud.ts` | 2026-10-10 裁出第一版 |
| V10 OpenAI 密钥迁端点 | ○ | `endpoints.ts` 首启迁移 | 未实现 |
| VJ01 项目词典→口述→重启一致 | ○ | 真壳 + 假麦克风 | 未实现 |
| VJ02 内网镜像→端点→两引擎 | ○ | 真壳 + 本机 mock 端点 | 未实现 |

**已知债**：Qwen3-ASR 在 `sherpa-onnx-node` 1.13.8 无配置键，本地不承诺；GPU provider 不做；会议录音文件转写只留接口口；`sherpa-onnx` 升级未裁（触发条件见 design §4）；术语库与人名库的正本与格式未定义。
