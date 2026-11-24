import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { createExtractor, extractFiles, assertCurrentSnapshot } from './cursor-session-feedback.mjs'
import { summarizeFeedback, renderComment } from './workflow-feedback-report.mjs'

const user = (query, extra = '') => ({
  role: 'user',
  message: {
    content: [
      {
        type: 'text',
        text: `<timestamp>Monday, Nov 23, 2026, 7:49 PM (UTC+8)</timestamp>\n${extra}<user_query>\n${query}\n</user_query>`
      }
    ]
  }
})
const assistant = (text) => ({
  role: 'assistant',
  message: { content: [{ type: 'text', text }] }
})
const ask = (input, text = '') => ({
  role: 'assistant',
  message: {
    content: [
      ...(text ? [{ type: 'text', text }] : []),
      { type: 'tool_use', name: 'AskQuestion', input }
    ]
  }
})

test('extractor keeps human queries and drops harness follow-ups, empty timestamps and tool-only turns', () => {
  const parser = createExtractor('session.jsonl')
  parser.consume(user('处理 Issue 768'))
  parser.consume(
    user('Briefly inform the user about the task result and perform any follow-up actions.')
  )
  parser.consume({
    role: 'user',
    message: {
      content: [
        { type: 'text', text: '<timestamp>Monday, Nov 23, 2026, 8:51 PM (UTC+8)</timestamp>\n' }
      ]
    }
  })
  parser.consume({
    role: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Shell', input: { command: 'git status' } }] }
  })
  parser.consume(user('处理 Issue 768'))
  const result = parser.finish()
  assert.deepEqual(
    result.messages.filter((message) => message.role === 'user').map((message) => message.text),
    ['处理 Issue 768', '处理 Issue 768']
  )
  assert.deepEqual(result.issues, [])
  assert.equal(result.sourceLabel, 'Cursor')
  assert.equal(result.session.id, 'session')
})

test('AskQuestion becomes a question and assistant text stays an assistant message', () => {
  const parser = createExtractor('session.jsonl')
  parser.consume(user('先确认'))
  parser.consume(ask({ questions: [{ prompt: '后台读回是否不阻塞？' }] }, '请确认'))
  parser.consume(assistant('PR 已开'))
  const result = parser.finish()
  assert.deepEqual(
    result.messages.map((message) => message.role),
    ['user', 'question', 'assistant']
  )
  assert.match(result.messages[1].text, /后台读回是否不阻塞/)
})

test('fragments in one session folder merge, and other sessions or subagents are rejected', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bw-cursor-feedback-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dir = path.join(root, 'session-uuid')
  const first = path.join(dir, 'session-uuid.jsonl')
  const second = path.join(dir, 'continued.jsonl')
  const out = path.join(root, 'extract.json')
  const writeRows = async (file, rows) => {
    await writeFile(file, rows.map((row) => JSON.stringify(row)).join('\n'))
  }
  const { mkdir } = await import('node:fs/promises')
  await mkdir(dir)
  await writeRows(first, [user('处理需求'), ask({ questions: [{ prompt: '确认吗？' }] })])
  await writeRows(second, [assistant('已完成交付')])
  execFileSync(process.execPath, [
    path.join(import.meta.dirname, 'cursor-session-feedback.mjs'),
    'extract',
    '--input',
    first,
    '--input',
    second,
    '--out',
    out
  ])
  const result = JSON.parse(await readFile(out, 'utf8'))
  assert.deepEqual(
    result.messages.map((item) => item.role),
    ['user', 'question', 'assistant']
  )
  assert.equal(result.session.id, 'session-uuid')
  assert.equal(result.sources.length, 2)
  const other = path.join(root, 'other-session', 'other-session.jsonl')
  await mkdir(path.dirname(other))
  await writeRows(other, [user('另一会话')])
  await assert.rejects(extractFiles([first, other]), /同一会话/)
  const child = path.join(dir, 'subagents', 'child.jsonl')
  await mkdir(path.dirname(child))
  await writeRows(child, [user('子 agent')])
  await assert.rejects(extractFiles([child]), /子 agent/)
})

test('text outside the user query is a gap and blocks full coverage', () => {
  const parser = createExtractor('session.jsonl')
  parser.consume(user('start', '旁边还有一段来源不明的文字\n'))
  parser.consume(null)
  const result = parser.finish()
  assert.ok(result.issues.some((issue) => /用户来源不明/.test(issue)))
  assert.ok(result.issues.some((issue) => /JSON 损坏/.test(issue)))
  assert.equal(result.messages.filter((message) => message.role === 'user').length, 1)
  assert.throws(
    () =>
      summarizeFeedback(result, {
        issueUrl: 'https://github.com/o/r/issues/1',
        prUrl: 'https://github.com/o/r/pull/2',
        coverage: { initialInput: true },
        userEvents: [{ messageId: result.messages[0].id, tags: [], summary: '开工' }]
      }),
    /缺口/
  )
})

test('Cursor pipeline reuses shared counting and labels the comment source as Cursor', () => {
  const parser = createExtractor('session.jsonl')
  parser.consume(user('处理这个 Issue，沿用 workflow'))
  parser.consume(assistant('已交付 PR'))
  parser.consume(user('原问题仍在，不能合入'))
  const transcript = parser.finish()
  const annotations = {
    issueUrl: 'https://github.com/o/r/issues/1',
    prUrl: 'https://github.com/o/r/pull/2',
    firstDeliveryId: transcript.messages[1].id,
    coverage: { initialInput: true, preDelivery: true, review: true },
    userEvents: [
      {
        messageId: transcript.messages[0].id,
        tags: ['initial_extra_input'],
        summary: '指定 workflow'
      },
      { messageId: transcript.messages[2].id, tags: ['rework_request'], summary: 'PR 不能合入' }
    ],
    modelEvents: [],
    review: { verdict: 'changes_requested', evidenceIds: [transcript.messages[2].id] },
    reDeliveries: [],
    findings: []
  }
  const report = summarizeFeedback(transcript, annotations)
  assert.equal(report.metrics.initialExtraInput, 1)
  assert.equal(report.metrics.reworkOccurred, true)
  assert.equal(report.sourceLabel, 'Cursor')
  const comment = renderComment(report)
  assert.match(comment, /来源：Cursor 原始会话提取/)
  assert.match(comment, /bw-workflow-feedback:/)
  assert.doesNotMatch(comment, /来源：Codex/)
  assert.doesNotThrow(() => assertCurrentSnapshot(transcript, parser.finish(), annotations))
})
