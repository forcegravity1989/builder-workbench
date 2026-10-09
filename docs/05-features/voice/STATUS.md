# STATUS — 语音：听写与朗读

> **维护约定**：记录本特性六环现状。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)。环状态变化时随引发它的提交更新，不记流水。

**现状（2026-10-09）**：只有读码结论与设计草案，没有一行实现。听写能力是 Orca 执行核自带（上游代码，BW 未改），不算本特性已交付。intent / design **待人 gate**。决策投影（可点样张 + 一屏一问，私有 artifact）：<https://claude.ai/artifact/3utgbpR4X8qkbKp5DqeVtS>；拍板结果回传到它的数据库，再回写 intent §待决与 design §4。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ◐ | 草案 [intent.md](intent.md)。带入三问：新用户目标（语音对 agent 下指令、听回复），不服务已有特性 → 新特性 |
| 2 spec | ○ | 未立。验收点候选 V01–V10 在 [design.md](design.md) §3.1，spec 立项时正式编号；可点原型未建（设置面可点样张在上面的决策投影里） |
| 3 实现设计 | ◐ | 草案 [design.md](design.md)：§1 现状读码结论、§2 契约与薄挂载清单、§3 里程碑。未经技术评审 |
| 4 TDD | ○ | 无。计划只立后处理纯函数与协议校验单测（≤ 10 例，受 ratchet 约束） |
| 5 验收点 E2E | ○ | V01–V10 已定义，未注册、未执行 |
| 6 用户旅程 E2E | ○ | VJ01 / VJ02 已定义，未执行 |

## 验收点与旅程矩阵

口径：○ = 已定义未实现未执行。

| 验收点 | 状态 | 计划落点 | 证据 / 缺口 |
|---|---|---|---|
| V01 导入本机模型听写 | ○ | `main/workbench/speech/registry.ts` 导入 | 未实现 |
| V02 词典纠错与黑名单 | ○ | `postprocess/stages/lexicon.ts` | 未实现 |
| V03 数字转写 | ○ | `postprocess/stages/itn.ts`（路线待裁决） | 未实现 |
| V04 句尾风格 | ○ | `postprocess/stages/punct-style.ts` | 未实现 |
| V05 端点测一下 | ○ | `main/workbench/speech/endpoints.ts` | 未实现 |
| V06 端点听写同流水线 | ○ | `engines/remote-stt.ts` | 未实现 |
| V07 重开读回与重测 | ○ | 设置新键 + 探测时间戳 | 未实现 |
| V08 线程数生效 | ○ | `engines/sherpa-stt.ts` | 未实现 |
| V09 朗读与打断 | ○ | `engines/sherpa-tts.ts` + `renderer/workbench/speech/read-aloud.ts` | 未实现 |
| V10 OpenAI 密钥迁端点 | ○ | `endpoints.ts` 首启迁移 | 未实现 |
| VJ01 项目词典→口述→重启一致 | ○ | 真壳 + 假麦克风 | 未实现 |
| VJ02 内网镜像→端点→两引擎 | ○ | 真壳 + 本机 mock 端点 | 未实现 |

**已知债**：Qwen3-ASR 在 `sherpa-onnx-node` 1.13.8 无配置键，本地不承诺；GPU provider 不做；会议录音文件转写只留接口口。
