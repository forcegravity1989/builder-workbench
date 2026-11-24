import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { createExtractor, extractFiles, assertCurrentSnapshot } from './claude-session-feedback.mjs'
import { summarizeFeedback, renderComment } from './workflow-feedback-report.mjs'

const SESSION = 'session-uuid'
const human = (uuid, text, timestamp) => ({
  type: 'user',
  uuid,
  timestamp,
  sessionId: SESSION,
  userType: 'external',
  isSidechain: false,
  origin: { kind: 'human' },
  promptSource: 'typed',
  message: { role: 'user', content: text }
})
const assistant = (uuid, text, timestamp) => ({
  type: 'assistant',
  uuid,
  timestamp,
  sessionId: SESSION,
  isSidechain: false,
  message: { role: 'assistant', content: [{ type: 'text', text }] }
})
const ask = (uuid, timestamp, input) => ({
  type: 'assistant',
  uuid,
  timestamp,
  sessionId: SESSION,
  isSidechain: false,
  message: { role: 'assistant', content: [{ type: 'tool_use', name: 'AskUserQuestion', input }] }
})

test('extractor keeps genuine human input and repeated sends, excluding injection, tool echoes, sidechains, notifications and compaction', () => {
  const parser = createExtractor('session.jsonl')
  parser.consume({
    type: 'user',
    uuid: 'meta',
    sessionId: SESSION,
    isMeta: true,
    message: { role: 'user', content: [{ type: 'text', text: 'skill injection' }] }
  })
  parser.consume({
    type: 'user',
    uuid: 'tool',
    sessionId: SESSION,
    toolUseResult: {},
    message: { role: 'user', content: [{ type: 'tool_result', content: 'echo' }] }
  })
  parser.consume({
    type: 'user',
    uuid: 'side',
    sessionId: SESSION,
    isSidechain: true,
    origin: { kind: 'human' },
    promptSource: 'typed',
    message: { role: 'user', content: 'subagent input' }
  })
  parser.consume({
    type: 'user',
    uuid: 'notif',
    sessionId: SESSION,
    origin: { kind: 'task-notification' },
    promptSource: 'system',
    message: { role: 'user', content: '<task-notification>done</task-notification>' }
  })
  parser.consume({
    type: 'user',
    uuid: 'compact',
    sessionId: SESSION,
    isCompactSummary: true,
    message: {
      role: 'user',
      content: 'This session is being continued from a previous conversation'
    }
  })
  parser.consume({ type: 'attachment', uuid: 'att', sessionId: SESSION })
  parser.consume(human('u1', '启动真机', '2026-11-10T00:00:01.000Z'))
  parser.consume(human('u2', '启动真机', '2026-11-10T00:00:02.000Z'))
  const result = parser.finish()
  assert.deepEqual(
    result.messages.map((message) => message.id),
    ['u1', 'u2']
  )
  assert.deepEqual(result.issues, [])
  assert.equal(result.sourceLabel, 'Claude')
  assert.equal(result.session.id, SESSION)
})

test('AskUserQuestion becomes a question, assistant text an assistant message, and tool-only turns are skipped', () => {
  const parser = createExtractor('session.jsonl')
  parser.consume(human('u1', '处理需求', '2026-11-10T00:00:01.000Z'))
  parser.consume(
    ask('q1', '2026-11-10T00:00:02.000Z', { questions: [{ question: '采用已有方案吗？' }] })
  )
  parser.consume({
    type: 'assistant',
    uuid: 'toolonly',
    sessionId: SESSION,
    isSidechain: false,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]
    }
  })
  parser.consume(assistant('a1', '已完成交付', '2026-11-10T00:00:03.000Z'))
  const result = parser.finish()
  assert.deepEqual(
    result.messages.map((message) => message.id),
    ['u1', 'q1', 'a1']
  )
  assert.equal(result.messages[1].role, 'question')
  assert.ok(result.messages[1].text.includes('采用已有方案吗？'))
  assert.equal(result.messages[2].role, 'assistant')
})

test('multiple files merge by uuid within one session, deduplicate mirrors and reject mixed sessions', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bw-claude-feedback-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const first = path.join(dir, 'first.jsonl')
  const second = path.join(dir, 'second.jsonl')
  const out = path.join(dir, 'extract.json')
  const question = ask('q1', '2026-11-10T00:00:02.000Z', {
    questions: [{ question: '采用已有方案吗？' }]
  })
  const firstRows = [human('u1', '处理需求', '2026-11-10T00:00:01.000Z'), question]
  const secondRows = [
    question,
    human('u2', '处理需求', '2026-11-10T00:00:03.000Z'),
    assistant('a1', '已完成交付', '2026-11-10T00:00:04.000Z')
  ]
  const writeRows = (file, rows) =>
    writeFile(file, rows.map((row) => JSON.stringify(row)).join('\n'))
  await writeRows(first, firstRows)
  await writeRows(second, secondRows)
  execFileSync(process.execPath, [
    path.join(import.meta.dirname, 'claude-session-feedback.mjs'),
    'extract',
    '--input',
    first,
    '--input',
    second,
    '--input',
    first,
    '--out',
    out
  ])
  const result = JSON.parse(await readFile(out, 'utf8'))
  assert.deepEqual(
    result.messages.map((item) => item.id),
    ['u1', 'q1', 'u2', 'a1']
  )
  assert.equal(result.messages[1].role, 'question')
  assert.equal(result.sources.length, 2)
  assert.deepEqual(result.issues, [])
  assert.equal((await extractFiles([first])).source.file, first)
  await writeRows(second, [{ ...question, sessionId: 'other-session' }, ...secondRows.slice(1)])
  await assert.rejects(extractFiles([first, second]), /同一会话/)

  const parser = createExtractor('first.jsonl')
  for (const file of ['first.jsonl', 'second.jsonl']) {
    if (file !== 'first.jsonl') {
      parser.startSource(file)
    }
    parser.consume({
      type: 'user',
      sessionId: SESSION,
      origin: { kind: 'human' },
      promptSource: 'typed',
      timestamp: '2026-11-10T00:00:01.000Z',
      message: { role: 'user', content: '无 uuid 的真实输入' }
    })
  }
  assert.equal(new Set(parser.finish().messages.map((item) => item.id)).size, 2)
})

test('unknown user provenance and corrupt lines stay gaps that block full coverage', () => {
  const parser = createExtractor('session.jsonl')
  parser.consume(human('u1', 'start', '2026-11-10T00:00:01.000Z'))
  parser.consume({
    type: 'user',
    uuid: 'unk',
    sessionId: SESSION,
    message: { role: 'user', content: '来源不明' }
  })
  parser.consume(null)
  const result = parser.finish()
  assert.ok(result.issues.some((issue) => /用户来源不明/.test(issue)))
  assert.ok(result.issues.some((issue) => /JSON 损坏/.test(issue)))
  assert.throws(
    () =>
      summarizeFeedback(result, {
        issueUrl: 'https://github.com/o/r/issues/1',
        prUrl: 'https://github.com/o/r/pull/2',
        coverage: { initialInput: true },
        userEvents: [{ messageId: 'u1', tags: [], summary: '开工' }]
      }),
    /缺口/
  )
})

test('Claude pipeline reuses shared counting and labels the comment source as Claude', () => {
  const parser = createExtractor('session.jsonl')
  parser.consume(human('u1', '处理这个 Issue，沿用 workflow', '2026-11-10T00:00:01.000Z'))
  parser.consume(assistant('a1', '已交付 PR', '2026-11-10T00:00:02.000Z'))
  parser.consume(human('u2', '原问题仍在，不能合入', '2026-11-10T00:00:03.000Z'))
  const transcript = parser.finish()
  const annotations = {
    issueUrl: 'https://github.com/o/r/issues/1',
    prUrl: 'https://github.com/o/r/pull/2',
    firstDeliveryId: 'a1',
    coverage: { initialInput: true, preDelivery: true, review: true },
    userEvents: [
      { messageId: 'u1', tags: ['initial_extra_input'], summary: '指定 workflow' },
      { messageId: 'u2', tags: ['rework_request'], summary: 'PR 不能合入' }
    ],
    modelEvents: [],
    review: { verdict: 'changes_requested', evidenceIds: ['u2'] },
    reDeliveries: [],
    findings: []
  }
  const report = summarizeFeedback(transcript, annotations)
  assert.equal(report.metrics.initialExtraInput, 1)
  assert.equal(report.metrics.reworkOccurred, true)
  assert.equal(report.sourceLabel, 'Claude')
  const comment = renderComment(report)
  assert.ok(comment.includes('来源：Claude 原始会话提取'))
  assert.ok(comment.includes('bw-workflow-feedback:'))
  assert.ok(!comment.includes('来源：Codex'))

  assert.doesNotThrow(() => assertCurrentSnapshot(transcript, parser.finish(), annotations))
  const grown = createExtractor('session.jsonl')
  grown.consume(human('u1', '处理这个 Issue，沿用 workflow', '2026-11-10T00:00:01.000Z'))
  grown.consume(assistant('a1', '已交付 PR', '2026-11-10T00:00:02.000Z'))
  grown.consume(human('u2', '原问题仍在，不能合入', '2026-11-10T00:00:03.000Z'))
  grown.consume(human('u3', '截图打不开，请修改', '2026-11-10T00:00:04.000Z'))
  assert.throws(
    () => assertCurrentSnapshot(transcript, grown.finish(), annotations),
    /重新 extract/
  )
})
