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

const HARNESS_FOLLOWUP = 'Briefly inform the user about the task result'

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

function sessionIdentity(file) {
  const resolved = path.resolve(file)
  const stem = path.basename(resolved, '.jsonl')
  const dir = path.basename(path.dirname(resolved))
  if (dir === 'subagents') {
    throw new Error('子 agent 记录不并入本会话')
  }
  return { id: dir === stem ? stem : stem, dir, stem }
}

// Cursor stores one jsonl row per turn: { role, message: { content } }.
// Human text sits inside <user_query>. Background-task follow-ups and bare
// timestamps are harness turns, not new human input.
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
    sourceId = createHash('sha256').update(path.resolve(file)).digest('hex').slice(0, 12)
    sources.push({ file, lines: 0 })
    lines = 0
    const identity = sessionIdentity(file)
    sourceSessions.set(file, identity)
    if (!session.id) {
      session = { id: identity.stem }
    }
  }
  startSource(source)
  const add = (role, text, representation, timestamp) => {
    if (!text || text.startsWith('gAAAAA')) {
      issues.push(`第 ${lines} 行消息正文缺失或不可读`)
      return
    }
    candidates.push({
      id: `${sourceId}:line-${lines}`,
      turnId: null,
      timestamp,
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
      const timestamp =
        contentText(row.message?.content)
          .match(/<timestamp>([\s\S]*?)<\/timestamp>/)?.[1]
          ?.trim() ?? null
      if (row.role === 'user') {
        const content = row.message?.content
        const raw = contentText(content)
        if (
          content == null ||
          (Array.isArray(content) && content.length === 0) ||
          !raw.trim()
        ) {
          issues.push(`第 ${lines} 行用户正文缺失，未当人工输入`)
          return
        }
        const query = raw.match(/<user_query>([\s\S]*?)<\/user_query>/)?.[1]?.trim() ?? ''
        const leftover = raw
          .replace(/<timestamp>[\s\S]*?<\/timestamp>/g, '')
          .replace(/<system_notification>[\s\S]*?<\/system_notification>/g, '')
          .replace(/<user_query>[\s\S]*?<\/user_query>/g, '')
          .trim()
        if (leftover) {
          issues.push(`第 ${lines} 行用户来源不明，未当人工输入`)
        }
        if (!query || query.startsWith(HARNESS_FOLLOWUP)) {
          return
        }
        add('user', query, 'cursor_user', timestamp)
        return
      }
      if (row.role === 'assistant') {
        const parts = Array.isArray(row.message?.content) ? row.message.content : []
        const ask = parts.find((part) => part.type === 'tool_use' && part.name === 'AskQuestion')
        const text = contentText(row.message?.content)
        if (ask) {
          const payload = JSON.stringify(ask.input ?? {})
          add('question', text ? `${text}\n${payload}` : payload, 'cursor_ask', timestamp)
        } else if (text.trim()) {
          add('assistant', text, 'cursor_assistant', timestamp)
        }
      }
    },
    finish() {
      const identities = [...sourceSessions.values()]
      const primary = identities[0]
      const sameSession = (identity) =>
        identity.stem === primary.stem ||
        identity.dir === primary.stem ||
        (primary.dir === primary.stem && identity.dir === primary.dir)
      if (identities.some((identity) => !sameSession(identity))) {
        throw new Error('多个原始来源必须属于同一会话，不能混用其他 session')
      }
      if (primary.dir === primary.stem) {
        session = { id: primary.stem }
      }
      const gaps = [...issues]
      if (!candidates.some((item) => item.role === 'user')) {
        gaps.push('没有可确认的用户消息')
      }
      return {
        schemaVersion: 1,
        session,
        source: sources[0],
        sources,
        sourceLabel: 'Cursor',
        issues: [...new Set(gaps)],
        messages: candidates
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
