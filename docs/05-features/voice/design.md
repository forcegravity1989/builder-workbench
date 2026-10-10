# 语音实现设计 — 现状梳理与可插拔引擎

> 给实现与技术评审者在动代码前读取；§1 是 2026-10-09 对主干 `main` 听写代码的读码结论，§2 起是设计。用户与范围见 [intent](intent.md)，链状态见 [STATUS](STATUS.md)。实现取舍变化时更新；落地后把稳定模块心智回写 06-module，薄挂载登记进 [ref/upstream.md](../../../ref/upstream.md)。
>
> 状态：intent 已认、实现选型已裁（2026-10-10，§4）；第一版不含朗读；推理库升级一项按要导入的模型族再裁。spec 待立。在 [architecture](../../architecture.md) 里的定位：其 §1 构建交付（会话里对 agent 下指令），§2 ②执行、⑤壳，§3 Orca 执行核与 BW 叠层。

## §1 现状（读码结论，2026-10-09）

### 1.1 BW 与 Orca 的关系，语音在哪

主干 `main` 就是 Orca Electron 执行核 + BW 叠层（原 `bw-orca`，2026-09-30 扶正；旧 Rust 三 crate 归档 `archive/main-pre-orca`）。BW 叠层住在 `src/{main,renderer/src,shared,relay}/workbench/`，与 Orca 的接缝全部是薄挂载，登记在 ref/upstream.md 扩点表。

语音系统是 Orca 执行核自带的**听写（dictation）**，BW 未动过一行：`git diff caa465d1da..HEAD -- src/main/speech …` 为空。上游 Orca 自基线 `caa465d1da`（2026-09-15）到 2026-10-09 共 2234 次提交，触及听写的只有 2 处（释放 worker 监听器、清理定时器），没有引擎抽象、没有朗读。`sherpa-onnx` 钉 1.12.37。

### 1.2 语音栈结构

| 层 | 落点 | 职责 |
|---|---|---|
| 共享契约 | `src/shared/speech-types.ts`、`rpc-contract/speech-params.ts` | `SpeechModelManifest`（`provider: 'local' \| 'openai'`，`type` 五族 + `openai`）、`VoiceSettings`、`DictationState`；手机端 zod 参数 |
| 模型目录 | `src/main/speech/model-catalog.ts`、`model-download-catalog.ts` | 12 个模型写死：10 本地（parakeet v3/v2、zipformer 中英/英/中/韩、paraformer 中英、parakeet-ctc 日、whisper-tiny、SenseVoice）+ 2 OpenAI（gpt-4o-mini-transcribe、gpt-4o-transcribe）；本地模型按 HuggingFace 固定 revision + 逐文件 sha256 下载 |
| 模型管理 | `model-manager.ts`、`model-cache-path.ts`、`speech-model-download-*.ts` | 下载（断点续传、重试、校验）、缓存目录（`userData/speech-models`；Windows 非 ASCII 路径迁到 ProgramData）、状态 `not-downloaded / downloading / extracting / ready / error` |
| 会话服务 | `stt-service.ts`、`stt-session-{state,start,stop,timeouts}.ts` | 单会话、owner 互斥（`desktop:<sender>:<session>` / `mobile:<id>`）；本地走 worker 线程，OpenAI 走 `cloudSession`；worker 空闲 1 小时后拆 |
| 推理 worker | `stt-worker.ts`、`stt-worker-model-config.ts`、`stt-offline-audio-chunker.ts`、`stt-audio-resample.ts` | 直接 `require` 平台原生插件（`sherpa-onnx-darwin-arm64` 等），按模型族分支建 recognizer：流式 transducer / paraformer 走 online 端点检测；whisper / nemo-ctc / senseVoice / 离线 transducer 走 offline，音频满 30 秒就切块、切点取最后 5 秒内最安静的 100 ms；`numThreads` 写死 1（流式）或 2（离线），`provider: 'cpu'`；热词只在 transducer + `modified_beam_search` 生效 |
| 远端 | `openai-transcription-client.ts`、`openai-api-key-store.ts` | 攒整段 PCM → WAV → `POST https://api.openai.com/v1/audio/transcriptions`，停止时一次性出结果，10 分钟上限；密钥经 `SecretStore` 加密存 `~/.orca/openai-speech-token.enc`，加密不可用时退化为明文文件（权限 0600） |
| 装配 | `speech-runtime-service.ts`、`host/electron-speech-services.ts`、`startup/main-process-preflight.ts` | 工厂注入：`setSpeechServiceFactories({createModelManager, createSttService})`，桌面在 preflight 装 Electron 版 |
| IPC / RPC | `ipc/speech.ts`（桌面 `speech:*` 11 条）、`runtime/rpc/methods/speech.ts`（配对端 `speech.models.*`、`speech.dictation.*` 8 条）、`runtime-mobile-dictation-controller.ts`、`runtime-mobile-speech-catalog.ts` | 桌面与配对端共用同一个 `SttService` 与目录 |
| 预加载 | `preload/api/speech-{api,bridge}.ts` | `window.api.speech`：目录、状态、密钥、下载、`startDictation / feedAudio / stopDictation` 与 6 个事件监听（ready / partial / final / stopped / error / downloadProgress） |
| 渲染层 | `components/dictation/*`、`hooks/use-audio-capture.ts`、`store/slices/dictation.ts` | 手势（toggle 走主进程快捷键路由，hold 走 DOM）、`getUserMedia` + `ScriptProcessorNode(4096)` 采集、插入目标三类（xterm 终端粘贴、`input/textarea`、contentEditable 含原生 chat 编辑器）、指示器与音量表 |
| 设置 | `components/settings/Voice*.tsx`、`OpenAiTranscription*.tsx` | 开关、toggle/hold、麦克风、模型下拉（下载/删除）、OpenAI 密钥 |
| 打包 | `config/electron-builder.config.cjs` | 原生插件按平台一份进 `Resources/node_modules/sherpa-onnx-<platform>`，`!node_modules/sherpa-onnx*` 不进 asar |

### 1.3 一次听写的数据流

1. `Mod+E`：主进程 `main-window-shortcut-routing.ts` 校验 `voice.enabled && voice.sttModel` 后发 `ui:dictationKeyDown`；hold 模式由 `use-hold-dictation-gesture.ts` 在 DOM 识别。
2. `DictationController.startDictation`：记 `sessionId`，`captureInsertionTarget()` 抓 `document.activeElement`，状态 `starting`。
3. 采集：`openMicrophoneCaptureStream` → `getUserMedia({channelCount:1, echoCancellation, noiseSuppression, autoGainControl, deviceId?})`，worker 起来前本地缓冲 ≤ 30 s / 8 MB。
4. `speech:startDictation(modelId, hotwords=undefined, sessionId)`：macOS 先 TCC 麦克风授权；按 provider 起 worker 或 cloudSession；渲染层**从不传热词**。
5. 每 4096 帧（约 85–93 ms）Float32 PCM 按设备原生采样率（44.1 / 48 kHz）经 `Buffer` 过 IPC；本地路径在 worker 线程、云端路径在主进程各自用 `resampleToRate` 线性插值到 16 kHz。
6. worker 回 `partial`（只显示）/ `final`（`formatFinalTranscriptSegment` 补段间空格后 `insertText` 插入）；OpenAI 路径只有停止时一条 `final`。
7. 停止：`stopCapture` → `speech:stopDictation` → 等 `speech:stopped`（1 s 超时）→ `idle`；无 final 则提示「没听到」。

### 1.4 设置与存储

`VoiceSettings = { enabled, sttModel, modelsDir, language, dictationMode, terminalConfirmBeforeInsert, userModels, openAiApiKeyConfigured, microphoneDeviceId, microphoneDeviceLabel }`，在 `GlobalSettings.voice`，加载时与默认值浅合并。**死字段**：`userModels`（只有类型与默认值，无任何读写）、`terminalConfirmBeforeInsert`、`language`（渲染层与主进程都不读）。密钥不在设置里，单独文件。

### 1.5 可复用的扩点（上游已有，不用新造）

| 扩点 | 位置 | 能做什么 |
|---|---|---|
| 服务工厂注入 | `setSpeechServiceFactories` | 换掉 `ModelManager` / `SttService` 实现，桌面 IPC、配对端听写与删除流程跟着走；**换引擎不用改上游**。换目录不行：常量 `SPEECH_MODEL_CATALOG` 仍被 `ipc/speech.ts`（1 处）、`runtime-mobile-speech-catalog.ts`（3 处）、`speech-model-deletion.ts`（1 处）直接引用，这 5 处要改读 manager |
| `startDictation(modelId, hotwords[])` | `ipc/speech.ts` | 热词参数已存在，渲染层没传 |
| owner 互斥与事件 sink | `SttService` | 新引擎只要产 `ready / partial / final / stopped / error` 五种事件 |
| 插入目标 | `dictation-insertion-target.ts` | 终端 / 输入框 / contentEditable 三条路已通，朗读不需要碰 |
| 配对端 RPC 允许名单 | `runtime-rpc-mobile-method-allowlist.ts` | 新方法按名登记 |

### 1.6 缺口对照

| 目标 | 现状 | 缺口 |
|---|---|---|
| 导入新 ASR 模型 | 目录写死 12 个；只认 HuggingFace；`userModels` 死字段；worker 按族 if/else | 目录数据化 + 导入 + 镜像；新族需升 `sherpa-onnx`（1.13.8 的 Node 绑定多了 dolphin、fireRedAsr、moonshine、canary、zipformerCtc、wenetCtc、omnilingual 等离线族；**Qwen3-ASR 在 Node 绑定里仍没有配置键**，2026-10-09 读包核实） |
| TTS 模型 | 无 | 引擎、worker、播放、设置、入口全部新建；`sherpa-onnx-node` 1.13.8 有 `OfflineTts`（vits / matcha / kokoro / kitten / zipvoice / pocket），`generateAsync` 带流式 `onProgress` |
| 后处理模型与算法 | 无；SenseVoice 只有模型内置 ITN | 流水线新建；标点模型可用 `OfflinePunctuation`（ct-transformer）；VAD 可用 `Vad`（silero / ten） |
| CPU 推理可配 | 线程数写死 1～2，`provider` 写死 cpu，无抗混叠重采样 | 暴露 `numThreads` / `provider`；用 1.13.8 的 `LinearResampler` 或自写抗混叠 |
| 远端 API 可配 | 只有 OpenAI 一家一把密钥，URL 写死；Node `fetch` 不走系统代理 | 端点列表（地址 / 密钥 / 模型 / 用途）；`net.fetch` 走系统代理；「测一下」真连 |

### 1.7 今天实测与核过的事实

- `sherpa-onnx-node` 1.13.8（2026-09-10 发布）：`npm pack` 后读 `non-streaming-tts.js`、`punctuation.js`、`vad.js`、`resampler.js`、`types.js`。它只是薄封装，调用的是同版本平台包 `.node` 插件的扁平函数（`createOfflineTts` / `offlineTtsGenerateAsync`、`createVoiceActivityDetector`、`createOfflinePunctuation`、`createLinearResampler`、`createOfflineStream(handle, hotwords)` 等），本仓 worker 直接 `require` 平台包即可用这些函数；未实机运行。`OnlineRecognizerConfig` 有 `ruleFsts / ruleFars / hr(homophone replacer)`；`types.js` 的 `OfflineModelConfig` 没有 Qwen3-ASR 配置键。
- 本仓听写代码与上游基线逐文件一致。上游计数来自本会话 `git fetch --filter=blob:none https://github.com/stablyai/orca.git main` 后 `git log caa465d1da..FETCH_HEAD`（2234 次，触及听写 2 次：#23077、#24924）；仓内没有 upstream 跟踪引用，复核需自行 fetch。
- 2026-09-22 本机（Apple M2）调研（`~/projects/输入法/ASR后处理纠错调研.md`）：rustfst 加载 WeTextProcessing 中英 ITN FST 常驻 29 MB，26 字句 3.5 ms；sherpa 自带 `itn_zh_number.fst` 实测「一点三」→「1点3」、「我要一个苹果」→「我要1个苹果」，不够用；通用纠错模型误纠率 1.5B LLM 18%、4B 23%、BERT 类 0.46%～0.76%；SenseVoice 必须 `use_itn=True` 否则连标点一起丢。
- 未验证：Node 预编译插件是否带 CUDA / CoreML provider；`ct-punc-c` int8 实际体积与 CPU 延迟；1.13.8 `LinearResampler` 是否抗混叠（名字是线性）。

## §2 目标架构

### 2.1 原则

- **薄挂载**：引擎、目录、后处理全部是 BW 模块（`src/{shared,main,renderer/src}/workbench/speech/`），经上游已有的工厂注入接管；上游文件只改登记与一行转发，每处登记进 ref/upstream.md 扩点表。
- **状态只从真实探测推导**：模型 `ready` 来自文件校验；端点「可用」来自「测一下」真连或最近一次真实转写；配置存在只显示「未测」。
- **不留双路径**：接管后 `openai-*` 两个文件退役删除，OpenAI 变成端点列表里的一条预置端点；`userModels`、`terminalConfirmBeforeInsert`、`language` 三个死字段随新设置结构一并清掉。
- **本地默认，远端明示**：默认推荐本地模型；选了远端端点的模型，指示器显示端点名。音频离机前不再确认（intent 已决 3：选端点即授权）。
- **一次改一族**：新模型族只增数据文件与 worker 的一个映射项，不改会话服务。

### 2.2 分层

```text
渲染层  DictationController(上游) ──热词钩子──▶ workbench/speech/hotwords.ts(词典 → 热词)
        workbench/speech/WorkbenchVoiceSections.tsx(线程数/端点/导入/词典/句尾风格) ──挂进──▶ VoicePane(上游，1 处挂载)
预加载  window.api.speech(上游，不改) + window.api.workbenchSpeech(新：端点/导入/词典/后处理配置)
主进程  workbench/speech/
          registry.ts        目录 = 内置 catalog.json ∪ 导入 manifest ∪ 端点派生模型
          engines/           SttEngine 接口（TtsEngine 第二版）
            sherpa-stt.ts    sherpa-stt-worker.ts：按 manifest 建配置，线程/provider 可配；钉 1.12.37
            remote-stt.ts    OpenAI 兼容 /audio/transcriptions（multipart；可选 stream）
          postprocess/       pipeline.ts + stages/{strip,lexicon,itn,punct-style,punct-model}.ts；itn 调 native/itn 小进程
          lexicon.ts         从术语库与人名库编译词典
          endpoints.ts       端点表 + 密钥（SecretStore，每端点一文件）+ 探测
          speech-service.ts  实现上游 SttService 同形接口，经 setSpeechServiceFactories 注入
          ipc.ts / rpc.ts    workbenchSpeech:* 与 workbench.speech.* 注册（薄挂载）
原生     native/itn/         rustfst + WeTextProcessing 中英 FST，stdin/stdout 行协议，随包
共享     workbench/speech/{manifest,engine,endpoint,postprocess,settings}.ts  契约与 zod
```

### 2.3 契约

```ts
// src/shared/workbench/speech/manifest.ts
type SpeechTask = 'stt' | 'tts'
type SpeechEngine = 'sherpa' | 'remote'
type SpeechManifest = {
  id: string; task: SpeechTask; engine: SpeechEngine
  label: string; languages: string[]            // 'zh','en','multi'
  source: 'builtin' | 'imported' | 'endpoint'
  // sherpa
  family?: 'transducer' | 'paraformer' | 'whisper' | 'senseVoice' | 'nemoCtc'   // 1.12.37 五族，第一版
         | 'zipformerCtc' | 'dolphin' | 'fireRedAsr' | 'moonshine'              // 需升 1.13.8，§4 问 4
         | 'vits' | 'matcha' | 'kokoro' | 'kitten'                              // TTS，第二版
  streaming?: boolean; sampleRate?: number; modelingUnit?: 'bpe' | 'cjkchar' | 'cjkchar+bpe'
  files?: { role: string; name: string; sizeBytes: number; sha256: string }[]
  mirrors?: { base: string; revision?: string }[]   // 为空 = 只能本机导入
  caps: { hotwords: boolean; punctuation: boolean; itn: boolean }
  // remote
  endpointId?: string; remoteModel?: string
}

// src/shared/workbench/speech/endpoint.ts
type SpeechEndpoint = {
  id: string; label: string; baseUrl: string          // 如 https://gw.internal/v1
  protocol: 'openai-audio'                            // 只此一种（2026-10-10 裁：不接 DashScope 原生）
  apiKeyRef: string                                   // 密钥文件名，正文不进设置
  stt?: { model: string; language?: string; stream?: boolean; promptHotwords?: boolean }
  tts?: { model: string; voice: string; format: 'pcm' | 'wav'; speed?: number }
  headers?: Record<string, string>; timeoutMs?: number
  probe?: { at: number; ok: boolean; detail: string } // 最近一次「测一下」，杀进程重开后重测
}

// src/shared/workbench/speech/engine.ts（主进程内部）
interface SttEngine {
  start(sink: (e: SttEvent) => void, opts: { hotwords?: string[]; language?: string }): Promise<void>
  feed(samples: Float32Array, sampleRate: number): void
  stop(): Promise<void>
  transcribeFile?(path: string): AsyncIterable<SttEvent>   // 留口给会议录音，v1 不实现
}
interface TtsEngine {                                  // 第二版实现；第一版只保留类型
  synthesize(text: string, opts: { voice?: string; speed?: number },
             onChunk: (pcm: Float32Array, sampleRate: number) => void): Promise<void>
  cancel(): void
}

// src/shared/workbench/speech/postprocess.ts
type PostprocessStage = 'strip' | 'lexicon' | 'itn' | 'punctStyle' | 'punctModel'
type PostprocessConfig = {
  stages: Record<PostprocessStage, boolean>
  punctStyle: { trailing: 'keep' | 'comma' | 'space' | 'none' }
  lexicon: { terms: boolean; people: boolean; replaceThreshold: 0.85; markThreshold: 0.65 }  // 术语库 / 人名库两路开关
}

// src/shared/workbench/speech/settings.ts  → GlobalSettings.workbenchSpeech（新键，薄挂载 3 处）
type WorkbenchSpeechSettings = {
  inference: { numThreads: number; provider: 'cpu' }
  endpoints: SpeechEndpoint[]
  imported: SpeechManifest[]
  mirrors: { base: string }[]                 // 覆盖内置目录的下载源
  tts?: { enabled: boolean; modelId: string; autoReadAgentReplies: boolean; speed: number }  // 第二版；第一版不写入
  postprocess: PostprocessConfig
}
```

`VoiceSettings` 上游字段里 `sttModel`、`enabled`、`dictationMode`、麦克风四项继续用；`openAiApiKeyConfigured` 退役。

### 2.4 引擎

**本地 sherpa（CPU）**。第一版钉 `sherpa-onnx` 1.12.37（§4 问 4 未裁：朗读推迟后升级的直接理由消失，等要导入的模型族确定再裁）。BW 自己的 `sherpa-stt-worker.ts` 沿用上游 `init / feed / stop / teardown` 协议，`init` 改为按 manifest 的 `family + files[role]` 建配置，不再按文件名猜，覆盖现版五族（transducer / paraformer / whisper / nemo-ctc / senseVoice）；`numThreads` 默认 `min(4, cpus-1)`、`provider` 从设置读；流式族保留端点检测参数；离线族保留 30 秒上限、静点切块。热词：transducer 族走上游已有的热词文件，其余族热词只进后处理词典。VAD、`LinearResampler`、标点模型、zipformerCtc / dolphin / fireRedAsr / moonshine 四个新族都在 1.13.8，升级裁定后再进；在那之前重采样沿用上游线性插值。

**远端 OpenAI 兼容**（2026-10-10 裁：只做这一种协议，不接 DashScope 原生）。STT：`POST {baseUrl}/audio/transcriptions`（multipart：`model`、`language`、`prompt`=热词串、`response_format=json`），`stream=true` 时读 SSE 增量出 `partial`；仍攒整段，10 分钟上限继承；请求走 Electron `net.fetch`，系统代理与企业 CA 生效。端点结构保留 `tts` 字段给第二版，第一版不读。密钥一端点一文件 `~/.orca/speech-endpoint-<id>.enc`，复用 `SecretStore`。预置端点 `openai`（`https://api.openai.com/v1`）承接原 OpenAI 两模型，旧密钥文件首启迁入一次后删除。

### 2.5 模型目录与导入

- 内置目录从 TS 常量改成 `resources/speech/catalog.json`（schema = `SpeechManifest`），构建时校验；镜像 `mirrors[]` 写 HuggingFace 与 ModelScope 两条，设置里可加内网镜像并置顶。
- 导入：设置 →「导入模型」选目录；目录里有 `manifest.json` 直接读，没有则按文件名识别族（encoder/decoder/joiner/tokens、model.onnx+tokens 等）生成草稿让人确认 `family / languages / streaming`，写入 `imported[]`，文件原地引用不复制。导入项状态按文件存在与大小校验推导。
- 端点派生模型：每条端点的 `stt.model` 生成一条 `source: 'endpoint'` 的 manifest（`tts.model` 第二版），出现在同一个模型下拉里，`ready` = 端点最近探测成功。
- 配对端目录接口继续返回上游的 `provider: 'local' | 'openai'` 形状：`sherpa` → `local`，`remote` → `openai`（旧客户端只认这两个值）。

### 2.6 后处理流水线

顺序固定：`strip`（剥 SenseVoice 富标签、压空格）→ `lexicon`（拼音 / 音素模糊匹配 + 别名精确匹配 + 黑名单窗口）→ `itn`（数字、小数、百分比、电话、金额、日期）→ `punctStyle`（句尾句号按设置改逗号 / 空格 / 删，保留问号）→ 可选 `punctModel`（只对无标点的流式族，ct-transformer zh-en）。词典命中片段冻结，后续阶段不再改。`partial` 只过 `strip`，`final` 全过。本地与远端两种引擎产出都经同一条流水线。

- 词典来源（2026-10-10 裁）：术语库与人名库，人不手写词典文件。`lexicon.ts` 把两个库编译成流水线读的内部形式（每条 = 目标词 + 别名 + 黑名单，照 HaujetZhao/asr-hotword 的三段），库改一次就重编。两个库的正本与格式本仓还没有（intent 已决 2 的剩余待决），建议落点：术语库 = 被管项目词表（CONTEXT 类文件）里的词条 + 全局一份 `~/.orca/speech-terms.txt`；人名库 = 项目成员（远端协作者或 git 作者）+ 全局一份 `~/.orca/speech-people.txt`；spec 立项时定。拼音用 `pinyin-pro`（MIT，无依赖），模糊簇 zh/z、ch/c、sh/s、n/l、in/ing、en/eng、an/ang；最小 2 音节；双阈值 0.85 替换 / 0.65 只记日志；同一份编译结果同时喂 transducer 热词与远端 `prompt`。
- ITN（2026-10-10 裁定 A）：把 `~/projects/输入法/poc/itn-rustfst`（rustfst + WeTextProcessing 中英 FST，已验证：29 MB 常驻、3.5 ms/句）做成随包小进程 `native/itn/`，stdin/stdout 行协议，主进程按需拉起、闲置回收；`config/electron-builder.config.cjs` 按平台加 extraResources，三平台各构建一次。TypeScript 自写规则不做；sherpa `ruleFsts` 实测覆盖不够，排除。
- 不做：通用错字纠错模型（macro-correct 横评 BERT 类误纠 0.46%～0.76%、LLM 18%～23%）与 LLM 后编辑（ASR-EC 基准结论「prompting is not effective」），`PostprocessStage` 留枚举位不实现。
- 日志只记「改了什么词」计数，不记原文与音频。

### 2.7 朗读

第一版不做（2026-10-10 裁：第一版只做听写侧）。`TtsEngine`、`SpeechEndpoint.tts`、`WorkbenchSpeechSettings.tts` 只保留类型，不实现、不注册、不显示。第二版范围：本地 `OfflineTts`（需升 1.13.8）与远端 `/audio/speech`、渲染层播放与打断、回复行「朗读」按钮、「自动朗读 agent 回复」；立项时另评审。

### 2.8 设置面

Voice 面板下方挂 BW 段（`isWorkbenchShell()` 时渲染）：推理（线程数）、端点表（地址 / 密钥 / STT 模型 / 测一下 / 状态与时间）、模型（内置目录含镜像切换、导入、各项状态）、词典（术语库与人名库各自来源、条数、命中计数）、后处理（各阶段开关、句尾风格）。朗读段第二版。

### 2.9 薄挂载清单（实现时登记进 ref/upstream.md）

承载方式 2026-10-10 裁定：BW 叠层模块 + 上游薄挂载。行号是 2026-10-10 `main` 的实际行号。

| 阶段 | 上游文件 | 行 | 现在 → 改成 | 性质 |
|---|---|---|---|---|
| 1 | `src/main/startup/main-process-preflight.ts` | 250 | `setSpeechServiceFactories(electronSpeechServiceFactories)` → 壳开启时注入 `workbenchSpeechServiceFactories`，否则原样 | 改 1 行 |
| 1 | `src/main/ipc/speech.ts` | 17 | `return SPEECH_MODEL_CATALOG` → `getSpeechModelManager(store).getCatalog()` | 改 1 行 |
| 1 | `src/main/runtime/runtime-mobile-speech-catalog.ts` | 20 · 42 · 79 | `SPEECH_MODEL_CATALOG.map` / `getCatalogModel(id)` ×2 → 改读 manager 目录 | 改 3 行 |
| 1 | `src/main/speech/speech-model-deletion.ts` | 56 | `getCatalogModel(modelId)` → 改读 manager 目录 | 改 1 行 |
| 1 | `src/shared/global-settings-types.ts` | 491 旁 | 加 `workbenchSpeech?: WorkbenchSpeechSettings` | +1 字段 |
| 1 | `src/shared/constants.ts`、`src/main/persistence/loading-store/normalize-loaded-global-settings.ts` | 默认值 / 归一 | 新键默认值与读回归一 | 各 +1 处 |
| 1 | `src/main/ipc/register-core-handlers/register-core-handlers.ts` | 241 旁 | 加 `registerWorkbenchSpeechHandlers(store)` | +1 行 |
| 1 | `src/preload/index.ts` | 185 旁 | 加 `workbenchSpeech: workbenchSpeechApi` | +1 行 |
| 1 | `src/main/runtime/rpc/methods/index.ts` | 65 旁 | 加 `...WORKBENCH_SPEECH_METHODS` | +1 行 |
| 2 | `src/main/ipc/speech.ts` | 24–36 | 删 `speech:getOpenAiApiKeyStatus / saveOpenAiApiKey / clearOpenAiApiKey` 三条处理器 | 删 13 行 |
| 2 | `src/preload/api/speech-bridge.ts` | 密钥三方法 | 删 | 删约 9 行 |
| 2 | `src/renderer/src/components/settings/VoicePane.tsx` | 150–209 · 231–250 | 删 OpenAI 密钥保存 / 清除与两段 JSX；252 前挂 `<WorkbenchVoiceSections/>` | 删约 80 行 + 挂 1 处 |
| 2 | 退役 | 整文件 | `openai-transcription-client.ts`、`openai-api-key-store.ts`、`OpenAiTranscriptionKeyDialog.tsx`、`OpenAiTranscriptionSettingsRow.tsx`、`voice-pane-search.ts` 的 OpenAI 条目，连同测试 | 删 5 文件 |
| 3 | `src/renderer/src/components/dictation/DictationController.tsx` | 187 | 第二参 `undefined` → `await resolveDictationHotwords()`（壳外返回 undefined） | 改 1 行 |
| 3 | `config/electron-builder.config.cjs` | extraResources | `native/itn/` 产物按平台随包 | +1 段 |
| 4 | `package.json` | 194 · 315–317 | 不动（钉 1.12.37）；升级另裁 | — |
| — | 上游 `stt-worker.ts`、`stt-service.ts` | — | 壳开启时不加载，不删，留给上游合并 | 不动 |

第二版再挂：`native-chat/NativeChatMessageRow.tsx` 回复行「朗读」按钮。

### 2.10 存储与隐私

- 配置进 `GlobalSettings.workbenchSpeech`；密钥只在 `~/.orca/speech-endpoint-*.enc`；词典是明文文件，项目词典走仓评审。
- 不落盘音频；远端请求前的 WAV 只在内存。诊断日志记端点名、模型 id、耗时、阶段改词数，不记文本与密钥。
- 探测结果带时间戳存设置里，重开后标「上次 <时间> 可用」并后台重测；不把旧结论当现状。

## §3 验证与实现代价

### 3.1 验收点候选（spec 立项后正式编号）

| 编号 | 判据 |
|---|---|
| V01 | 无外网机器导入本机目录里的 SenseVoice，模型状态 `ready`，听写一句中文上屏 |
| V02 | 词典里有「Qwen」，口述「用千问跑一遍」上屏为「用 Qwen 跑一遍」；黑名单词在窗口内时不替换 |
| V03 | 口述「同比增长百分之六点三」上屏「同比增长6.3%」；「我要一个苹果」原样 |
| V04 | 句尾风格设「逗号」，离线模型的句号上屏为逗号，问号保留 |
| V05 | 配一条指向本机 mock 的 OpenAI 兼容端点，「测一下」真连；地址错时状态给出 HTTP 原因 |
| V06 | 选端点派生模型听写，同一句经同一条流水线上屏；指示器显示端点名 |
| V07 | 杀进程重开：端点、导入模型、词典路径原样读回，探测状态显示「上次时间」且重测 |
| V08 | 线程数改 4，worker 以 4 线程建 recognizer（日志可核） |
| V09 | （第二版）朗读：选本地 TTS 模型，点一条 agent 回复的「朗读」出声，再点打断 |
| V10 | 旧 OpenAI 密钥文件首启迁成端点 `openai`，旧文件删除，原两模型仍可选 |
| VJ01 | 旅程：接入项目 → 写项目词典 → 会话屏口述带术语和数字的指令 → 回车发给 agent → 重启后再说一次结果一致 |
| VJ02 | 旅程：进内网机器 → 加镜像 → 下载一个小模型 → 加端点并测通 → 两种引擎各听写一次 |

真壳 E2E 用 Chromium 假麦克风（`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`）喂固定语料，远端用本机 mock 服务，不依赖外网；单测只立后处理纯函数与 manifest / endpoint 协议校验（单特性 ≤ 10 例，受叠层例数 ratchet 约束须同批对冲）。

### 3.2 里程碑

| 阶段 | 内容 | 今天实测 / 依据 |
|---|---|---|
| 1 契约与接管 | 共享契约、`speech-service.ts` 经工厂注入接管现有 12 模型行为不变、目录数据化、设置新键、三处注册 | 注入点 `preflight.ts:250`、目录 5 处引用、worker init 协议已逐文件读 |
| 2 远端端点 | 端点表、密钥、`net.fetch`、测一下、OpenAI 迁成预置端点、退役旧文件 | OpenAI 客户端 137 行已读，接口形状可直接泛化 |
| 3 后处理与词典 | strip / lexicon / punctStyle + 词典编译（术语库、人名库）+ 热词钩子 + ITN 小进程 `native/itn/` | 调研数据与 rustfst 验证程序已核（29 MB 常驻、3.5 ms/句）；`pinyin-pro` 无依赖；两个库的来源待 spec 定 |
| 4 导入与镜像 | manifest 驱动 worker（现版五族）、导入流程、镜像；钉 1.12.37 | worker 五族分支与文件角色已读；`npm view` 核实 1.13.8 主包与 darwin-arm64 / darwin-x64 / linux-arm64 / linux-x64 / win-x64 五个平台包已发布，升级裁定后可用 |
| 第二版 | 朗读（tts-worker、播放、朗读按钮、自动朗读、远端 TTS）；`sherpa-onnx` 升级与新模型族 | `OfflineTts.generateAsync` + `onProgress` 已读；kokoro / matcha 模型文件清单待核 |

### 3.3 风险与未验证

- 若裁定升 `sherpa-onnx` 1.13.8，C API 变化可能影响 worker 的裸 `require` 调用，要在三平台各跑一次；第一版钉 1.12.37 没有这项风险。
- ITN 小进程是本仓第一个随包的 Rust 产物，三平台构建链（含 Windows）未搭，阶段 3 前要先打通一次。
- 远端 SSE 增量格式各服务不一，`stream` 默认关。
- Qwen3-ASR 目前只能走远端端点（如 DashScope OpenAI 兼容模式）或等 Node 绑定补配置键；本地不承诺。
- 配对端只做兼容，新引擎在手机上是否可选未验。
- Windows 非 ASCII 路径对导入模型同样适用，导入时要走同一套 ASCII 缓存判断。

## §4 已裁（2026-10-10，评审卡回传）

1. 承载方式：**A** BW 叠层模块 + 上游薄挂载（§2.9）。
2. 数字转写：**A** 复用已验证的 Rust FST 程序做随包小进程 `native/itn/`（§2.6）。
3. 远端协议：**A** 只做 OpenAI 兼容（§2.4）。
4. `sherpa-onnx` 升不升 1.13.8：**未裁**（批注「tts 先不管，所以 sherpa-onnx 升不升不清楚」）。本篇按钉 1.12.37 写；升级的触发条件 = 要导入 zipformerCtc / dolphin / fireRedAsr / moonshine 任一新族，或第二版朗读立项；到时单独裁。

产品侧已决（第一版只听写、词典来源术语库与人名库、选端点即授权、intent 认）在 [intent](intent.md)。决策投影：<https://claude.ai/artifact/3utgbpR4X8qkbKp5DqeVtS>（私有；答案在它的数据库 `gates/voice`，version 3）。
