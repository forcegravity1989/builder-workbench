import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { feedbackSchema, summarizeFeedback, renderComment } from './workflow-feedback-report.mjs'

function contentText(content) {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map((part) => {
      if (typeof part.text === 'string') {
        return part.text
      }
      if (part.type === 'image' || part.type === 'input_image') {
        return '[附件：图像]'
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

export function createExtractor(source) {
  const candidates = []
  const issues = []
  const sources = []
  const sourceSessions = new Map()
  let session = {}
  let turnId = null
  let lines = 0
  let sourceId
  const startSource = (file) => {
    source = file
    sourceId = createHash('sha256').update(file).digest('hex').slice(0, 12)
    sources.push({ file, lines: 0 })
    lines = 0
    turnId = null
  }
  startSource(source)
  const add = (item, role, rank, timestamp, provenance) => {
    const text = contentText(item.content ?? item.message ?? item.text)
    if (!text || text.startsWith('gAAAAA')) {
      issues.push(`第 ${lines} 行消息正文缺失或不可读`)
      return
    }
    candidates.push({
      id: item.id ?? `${sourceId}:line-${lines}`,
      turnId,
      timestamp,
      role,
      phase: item.phase ?? null,
      text,
      rank,
      source: { file: source, line: lines, representation: provenance }
    })
  }
  return {
    startSource,
    consume(row) {
      lines++
      sources.at(-1).lines = lines
      if (!row) {
        issues.push(`第 ${lines} 行 JSON 损坏`)
        return
      }
      const p = row.payload ?? {}
      if (row.type === 'session_meta') {
        if (session.id && session.id !== p.id) {
          throw new Error('多个原始来源必须属于同一会话，不能混用其他 session')
        }
        sourceSessions.set(source, p.id)
        session = { id: p.id, cwd: p.cwd, historyMode: p.history_mode }
        if (p.source && typeof p.source === 'object' && 'subagent' in p.source) {
          issues.push('这是子 agent 记录，不能当作人的独立开工任务')
        }
      }
      if (row.type === 'turn_context' || p.type === 'task_started') {
        turnId = p.turn_id ?? turnId
      }
      if (row.type === 'event_msg' && p.type === 'item_completed') {
        const item = p.item ?? {}
        if (['UserMessage', 'user_message'].includes(item.type)) {
          add(item, 'user', 3, row.timestamp, 'item_completed')
        }
        if (['AgentMessage', 'agent_message'].includes(item.type)) {
          add(
            item,
            Array.isArray(item.questions) && item.questions.length ? 'question' : 'assistant',
            3,
            row.timestamp,
            'item_completed'
          )
        }
        if (item.type === 'McpToolCall' && /request_user_input/.test(item.tool ?? '')) {
          add(
            { ...item, text: JSON.stringify(item.arguments ?? {}) },
            'question',
            3,
            row.timestamp,
            'item_completed'
          )
        }
      }
      if (row.type === 'event_msg' && ['user_message', 'agent_message'].includes(p.type)) {
        add(p, p.type === 'user_message' ? 'user' : 'assistant', 2, row.timestamp, 'legacy_event')
      }
      if (row.type !== 'response_item') {
        return
      }
      if (p.type === 'message' && ['user', 'assistant'].includes(p.role)) {
        const meta = p.internal_chat_message_metadata_passthrough
        const parts = Array.isArray(p.content) ? p.content : []
        const humanParts = meta?.content_item_metadata
          ? parts.filter(
              (_, index) => meta.content_item_metadata[index]?.provenance?.type === 'user'
            )
          : []
        if (p.role === 'assistant') {
          add(p, 'assistant', 1, row.timestamp, 'response_item')
        } else if (humanParts.length) {
          add({ ...p, content: humanParts }, 'user', 1, row.timestamp, 'user_provenance')
        } else if (!meta) {
          issues.push(`第 ${lines} 行用户来源不明，未当人工输入`)
        }
      }
      if (p.type === 'function_call' && /request_user_input/.test(p.name ?? '')) {
        add({ id: p.call_id, text: p.arguments }, 'question', 1, row.timestamp, 'function_call')
      }
    },
    finish() {
      if (sources.length > 1 && sources.some(({ file }) => !sourceSessions.get(file))) {
        throw new Error('合并来源缺 session 标识，不能确认属于同一会话')
      }
      const selected = []
      const ordered = [...candidates].sort((a, b) =>
        a.timestamp && b.timestamp ? a.timestamp.localeCompare(b.timestamp) : 0
      )
      const gaps = [...issues]
      for (const item of ordered) {
        // Native API and completion records are adjacent mirrors. Match each pair,
        // not an entire turn: another real input can exist only in the API stream.
        const match = selected.find(
          (previous) =>
            previous.id === item.id ||
            previous.mirrors?.some((mirror) => mirror.id === item.id) ||
            (previous.rank < item.rank &&
              previous.source.file === item.source.file &&
              previous.turnId === item.turnId &&
              previous.role === item.role &&
              previous.text === item.text &&
              ![previous.source, ...(previous.mirrors ?? [])].some(
                (entry) => entry.representation === item.source.representation
              ) &&
              Math.abs(previous.source.line - item.source.line) <= 2)
        )
        if (!match) {
          selected.push({ ...item })
          continue
        }
        if (
          (match.role === 'user') !== (item.role === 'user') ||
          (match.source.representation === item.source.representation && match.text !== item.text)
        ) {
          gaps.push(`同一消息 ${item.id} 的来源内容冲突，需核对原始记录`)
        }
        const role = [match.role, item.role].includes('question') ? 'question' : match.role
        const mirrors = [...(match.mirrors ?? []), { ...match.source, id: match.id }]
        if (item.rank > match.rank) {
          Object.assign(match, item)
        } else {
          mirrors[mirrors.length - 1] = { ...item.source, id: item.id }
        }
        match.role = role
        match.mirrors = mirrors.filter(
          (entry, index) =>
            mirrors.findIndex(
              (other) =>
                other.file === entry.file &&
                other.line === entry.line &&
                other.representation === entry.representation
            ) === index
        )
      }
      const messages = selected.map(({ rank: _rank, ...item }) => item)
      if (!messages.some((item) => item.role === 'user')) {
        gaps.push('没有可确认的用户消息')
      }
      return {
        schemaVersion: 1,
        session,
        source: sources[0],
        sources,
        issues: [...new Set(gaps)],
        messages
      }
    }
  }
}

export async function extractFile(input) {
  return extractFiles([input])
}

export async function extractFiles(inputs) {
  const files = [...new Set(inputs.map((input) => path.resolve(input)))]
  if (!files.length) {
    throw new Error('需要至少一个原始来源')
  }
  const extractor = createExtractor(files[0])
  for (const [index, file] of files.entries()) {
    if (index) {
      extractor.startSource(file)
    }
    const lines = createInterface({
      input: createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Infinity
    })
    for await (const line of lines) {
      try {
        extractor.consume(JSON.parse(line))
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          throw error
        }
        extractor.consume(null)
      }
    }
  }
  return extractor.finish()
}

export function assertCurrentSnapshot(snapshot, current, annotations = {}) {
  const evidenceIds = new Set([
    annotations.firstDeliveryId,
    ...(annotations.modelEvents ?? []).map((item) => item.messageId),
    ...(annotations.review?.evidenceIds ?? []),
    ...(annotations.reDeliveries ?? []).flatMap((item) => [item.messageId, item.requestId])
  ])
  const evidence = (value) =>
    value.messages
      .filter((item) => ['user', 'question'].includes(item.role) || evidenceIds.has(item.id))
      .map(({ id, role, text }) => [id, role, text])
  if (
    snapshot.session.id !== current.session.id ||
    JSON.stringify(evidence(snapshot)) !== JSON.stringify(evidence(current)) ||
    JSON.stringify(snapshot.issues) !== JSON.stringify(current.issues)
  ) {
    throw new Error(
      '原始会话已有新输入、提问、引用证据或覆盖变化；重新 extract、更新标注并重算，不能沿用旧表追加说明'
    )
  }
}

async function save(output, value, inputs) {
  if (!output) {
    throw new Error('必须指定输出文件')
  }
  if (inputs.some((input) => path.resolve(input) === path.resolve(output))) {
    throw new Error('输出不能覆盖输入')
  }
  await mkdir(path.dirname(path.resolve(output)), { recursive: true })
  await writeFile(output, value, 'utf8')
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'schema') {
    process.stdout.write(`${JSON.stringify(feedbackSchema, null, 2)}\n`)
    return
  }
  const options = { input: [] }
  for (let index = 0; index < args.length; index += 2) {
    if (
      !['--input', '--out', '--annotations', '--json'].includes(args[index]) ||
      !args[index + 1]
    ) {
      throw new Error(
        'extract 可重复 --input 原始文件；report 用一个 --input 提取文件并加 --annotations 文件；均需 --out，可选 --json'
      )
    }
    if (args[index] === '--input') {
      options.input.push(args[index + 1])
    } else {
      options[args[index].slice(2)] = args[index + 1]
    }
  }
  if (!options.input.length) {
    throw new Error('需要 --input；用 schema 查看标注格式')
  }
  if (command === 'extract') {
    const extracted = await extractFiles(options.input)
    await save(options.out, `${JSON.stringify(extracted, null, 2)}\n`, options.input)
    process.stdout.write(
      `提取 ${extracted.messages.filter((item) => item.role === 'user').length} 条用户消息；缺口 ${extracted.issues.length} 项\n`
    )
    return
  }
  if (command !== 'report') {
    throw new Error('子命令：extract、schema、report')
  }
  if (!options.annotations) {
    throw new Error('report 需要 --annotations；语义分类不得用关键词代替')
  }
  if (options.input.length !== 1) {
    throw new Error('report 只接受一个合并后的提取文件')
  }
  const transcript = JSON.parse(await readFile(options.input[0], 'utf8'))
  const sources = transcript.sources ?? [transcript.source]
  if (!sources.length || sources.some((source) => !source?.file)) {
    throw new Error('提取结果缺少原始来源；请重新 extract')
  }
  const annotations = JSON.parse(await readFile(options.annotations, 'utf8'))
  const sourceFiles = sources.map((source) => source.file)
  assertCurrentSnapshot(transcript, await extractFiles(sourceFiles), annotations)
  const report = summarizeFeedback(transcript, annotations)
  const inputs = [...options.input, options.annotations, ...sourceFiles]
  if (options.json && path.resolve(options.out ?? '') === path.resolve(options.json)) {
    throw new Error('评论与指标输出必须不同')
  }
  await save(options.out, renderComment(report), inputs)
  if (options.json) {
    await save(options.json, `${JSON.stringify(report, null, 2)}\n`, inputs)
  }
  process.stdout.write('已生成本地评论；请预览并核对授权后发布。\n')
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
