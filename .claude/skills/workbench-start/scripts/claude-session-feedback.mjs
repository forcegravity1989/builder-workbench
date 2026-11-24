import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import path from 'node:path'
import {
  feedbackSchema,
  summarizeFeedback,
  renderComment,
  assertCurrentSnapshot
} from './workflow-feedback-report.mjs'

export { assertCurrentSnapshot }

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

// Claude Code stores each event as a flat jsonl row. Human input is a `user` row
// authored by the person (origin.kind 'human' / promptSource 'typed'); skill and
// system injection (isMeta), tool echoes (toolUseResult), subagent sidechains,
// task notifications and compaction summaries are not new human input.
export function createExtractor(source) {
  const candidates = []
  const issues = []
  const sources = []
  const sourceSessions = new Map()
  let session = {}
  let lines = 0
  let sourceId
  const startSource = (file) => {
    source = file
    sourceId = createHash('sha256').update(file).digest('hex').slice(0, 12)
    sources.push({ file, lines: 0 })
    lines = 0
  }
  startSource(source)
  const add = (row, role, text, representation) => {
    if (!text || text.startsWith('gAAAAA')) {
      issues.push(`第 ${lines} 行消息正文缺失或不可读`)
      return
    }
    candidates.push({
      id: row.uuid ?? `${sourceId}:line-${lines}`,
      turnId: row.promptId ?? null,
      timestamp: row.timestamp ?? null,
      role,
      phase: null,
      text,
      source: { file: source, line: lines, representation }
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
      if (row.sessionId) {
        if (session.id && session.id !== row.sessionId) {
          throw new Error('多个原始来源必须属于同一会话，不能混用其他 session')
        }
        if (!session.id) {
          session = { id: row.sessionId, cwd: row.cwd }
        }
        sourceSessions.set(source, row.sessionId)
      }
      if (row.isSidechain) {
        return
      }
      if (row.type === 'user') {
        const text = contentText(row.message?.content)
        if (row.isMeta || 'toolUseResult' in row || row.isCompactSummary) {
          return
        }
        if (
          row.origin?.kind === 'task-notification' ||
          row.promptSource === 'system' ||
          text.startsWith('<task-notification>') ||
          text.startsWith('<system-reminder>') ||
          text.startsWith('This session is being continued')
        ) {
          return
        }
        if (row.origin?.kind === 'human' || row.promptSource === 'typed') {
          add(row, 'user', text, 'claude_user')
        } else {
          issues.push(`第 ${lines} 行用户来源不明，未当人工输入`)
        }
        return
      }
      if (row.type === 'assistant') {
        const parts = Array.isArray(row.message?.content) ? row.message.content : []
        const ask = parts.find(
          (part) => part.type === 'tool_use' && part.name === 'AskUserQuestion'
        )
        const text = contentText(row.message?.content)
        if (ask) {
          const payload = JSON.stringify(ask.input ?? {})
          add(row, 'question', text ? `${text}\n${payload}` : payload, 'claude_ask')
        } else if (text.trim()) {
          add(row, 'assistant', text, 'claude_assistant')
        }
      }
    },
    finish() {
      if (sources.length > 1 && sources.some(({ file }) => !sourceSessions.get(file))) {
        throw new Error('合并来源缺 session 标识，不能确认属于同一会话')
      }
      const ordered = [...candidates].sort((a, b) =>
        a.timestamp && b.timestamp ? a.timestamp.localeCompare(b.timestamp) : 0
      )
      const gaps = [...issues]
      const byId = new Map()
      for (const item of ordered) {
        const previous = byId.get(item.id)
        if (previous) {
          if (previous.text !== item.text || previous.role !== item.role) {
            gaps.push(`同一消息 ${item.id} 的来源内容冲突，需核对原始记录`)
          }
          continue
        }
        byId.set(item.id, item)
      }
      const messages = [...byId.values()]
      if (!messages.some((item) => item.role === 'user')) {
        gaps.push('没有可确认的用户消息')
      }
      return {
        schemaVersion: 1,
        session,
        source: sources[0],
        sources,
        sourceLabel: 'Claude',
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
