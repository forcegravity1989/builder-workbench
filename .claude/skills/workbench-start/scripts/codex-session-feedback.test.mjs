import test from 'node:test'
import assert from 'node:assert/strict'
import { createExtractor, assertCurrentSnapshot } from './codex-session-feedback.mjs'
import { summarizeFeedback, renderComment } from './workflow-feedback-report.mjs'

const completed = (id, type, text) => ({
  type: 'event_msg',
  payload: {
    type: 'item_completed',
    item: { id, type, content: [{ type: 'Text', text }] }
  }
})

test('report rejects a stale human-input snapshot after review while ignoring tool-only progress', () => {
  const snapshot = {
    session: { id: 'one' },
    issues: [],
    messages: [{ id: 'u1', role: 'user', text: 'start' }]
  }
  assert.doesNotThrow(() =>
    assertCurrentSnapshot(snapshot, {
      ...snapshot,
      messages: [...snapshot.messages, { id: 'a1', role: 'assistant', text: 'progress' }]
    })
  )
  assert.throws(
    () =>
      assertCurrentSnapshot(snapshot, {
        ...snapshot,
        messages: [...snapshot.messages, { id: 'u2', role: 'user', text: '截图打不开，请修改' }]
      }),
    /重新 extract/
  )
  assert.throws(() => assertCurrentSnapshot(snapshot, { ...snapshot, issues: ['gap'] }), /覆盖变化/)
})

test('completion messages exclude injected instructions and mirrored response messages, retaining repeated sends', () => {
  const parser = createExtractor('session.jsonl')
  parser.consume({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn' } })
  parser.consume({
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      id: 'injected',
      content: [{ text: 'AGENTS instructions' }],
      internal_chat_message_metadata_passthrough: {
        content_item_metadata: [{ provenance: { type: 'harness' } }]
      }
    }
  })
  parser.consume({
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      id: 'mirror',
      content: [{ text: '启动真机' }],
      internal_chat_message_metadata_passthrough: {
        content_item_metadata: [{ provenance: { type: 'user' } }]
      }
    }
  })
  parser.consume(completed('u1', 'UserMessage', '启动真机'))
  parser.consume(completed('u2', 'UserMessage', '启动真机'))
  parser.consume({
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      id: 'u3',
      content: [{ text: '启动真机' }],
      internal_chat_message_metadata_passthrough: {
        content_item_metadata: [{ provenance: { type: 'user' } }]
      }
    }
  })
  assert.deepEqual(
    parser.finish().messages.map((message) => message.id),
    ['u1', 'u2', 'u3']
  )
  assert.deepEqual(parser.finish().issues, [])
})

const messages = [
  ['u1', 'user', '处理这个 Issue，沿用 workflow'],
  ['a1', 'assistant', '允许推送吗？'],
  ['u2', 'user', '允许，请单独启动真壳'],
  ['u3', 'user', '允许，请单独启动真壳'],
  ['a2', 'assistant', '已交付 PR'],
  ['u4', 'user', '原问题仍在，不能合入'],
  ['a3', 'assistant', '补修后重新交付']
].map(([id, role, text]) => ({ id, role, text, source: { line: id } }))

function annotations() {
  return {
    issueUrl: 'https://github.com/o/r/issues/1',
    prUrl: 'https://github.com/o/r/pull/2',
    firstDeliveryId: 'a2',
    coverage: { initialInput: true, preDelivery: true, review: true },
    userEvents: [
      { messageId: 'u1', tags: ['initial_extra_input'], summary: '指定 workflow' },
      {
        messageId: 'u2',
        tags: ['authorization', 'validation_guidance', 'correction'],
        summary: '授权并要求单独真壳'
      },
      { messageId: 'u3', tags: [], summary: '中断续接重复', duplicateOf: 'u2' },
      { messageId: 'u4', tags: ['rework_request', 'validation_guidance'], summary: 'PR 不能合入' }
    ],
    modelEvents: [{ messageId: 'a1', tags: ['permission'], summary: '推送许可' }],
    review: { verdict: 'changes_requested', evidenceIds: ['u4'] },
    reDeliveries: [],
    findings: []
  }
}

test('counts use explicit events, separate permissions and post-delivery participation, and deduplicate interventions', () => {
  const result = summarizeFeedback({ messages, issues: [] }, annotations())
  assert.deepEqual(result.metrics, {
    initialExtraInput: 1,
    askUserRounds: 0,
    hifiReviewRounds: 0,
    validationGuidanceBatches: 1,
    correctionBatches: 1,
    permissionRounds: 1,
    reworkOccurred: true,
    rejectionBatches: 1,
    completedReworkRounds: 0,
    preDeliveryInterventions: 1
  })
  const updated = annotations()
  updated.reDeliveries = [{ messageId: 'a3', requestId: 'u4' }]
  assert.equal(
    summarizeFeedback({ messages, issues: [] }, updated).metrics.completedReworkRounds,
    1
  )
  const acceptedThenReturned = [
    ...messages.slice(0, 5),
    { id: 'accepted', role: 'user', text: '首次交付可以合入' },
    ...messages.slice(5)
  ]
  updated.userEvents.push({ messageId: 'accepted', tags: ['other'], summary: '首次人审接受' })
  updated.review = { verdict: 'accepted', evidenceIds: ['accepted'] }
  assert.ok(
    renderComment(
      summarizeFeedback({ messages: acceptedThenReturned, issues: [] }, updated)
    ).includes('首次人审通过；后续退回 1 批')
  )
})

test('unknown coverage cannot become zero and pending reviews cannot become successful delivery', () => {
  const pending = annotations()
  pending.coverage = {}
  pending.review = { verdict: 'pending', evidenceIds: [] }
  const result = summarizeFeedback({ messages, issues: ['截断'] }, pending)
  assert.equal(result.metrics.askUserRounds, null)
  assert.equal(result.metrics.initialExtraInput, null)
  assert.equal(result.metrics.reworkOccurred, null)
  assert.throws(() => summarizeFeedback({ messages, issues: ['截断'] }, annotations()), /缺口/)
  pending.userEvents = []
  const unannotated = summarizeFeedback({ messages, issues: [] }, pending)
  assert.equal(unannotated.rawHumanMessages, 4)
  assert.equal(unannotated.annotatedHumanMessages, 0)
  assert.equal(unannotated.normalizedHumanEvents, null)
})

test('separate deliveries in one transcript use only the selected input, questions and review', () => {
  const transcript = { messages, issues: [] }
  const second = {
    ...annotations(),
    taskStartId: 'u4',
    taskEndId: 'a3',
    firstDeliveryId: 'a3',
    coverage: { initialInput: true, preDelivery: true },
    userEvents: [{ messageId: 'u4', tags: ['initial_extra_input'], summary: '第二项开工' }],
    modelEvents: [],
    review: { verdict: 'pending', evidenceIds: [] }
  }
  const report = summarizeFeedback(transcript, second)
  assert.equal(report.rawHumanMessages, 1)
  assert.equal(report.metrics.initialExtraInput, 1)
  assert.equal(report.metrics.permissionRounds, 0)
  assert.equal(report.metrics.reworkOccurred, null)
  assert.throws(() => summarizeFeedback(transcript, { ...second, taskStartId: null }), /同时指定/)
  assert.throws(
    () => summarizeFeedback(transcript, { ...second, taskStartId: 'a2' }),
    /开工的用户消息/
  )
  assert.throws(() => summarizeFeedback(transcript, { ...second, taskEndId: 'a2' }), /早于起点/)
  assert.throws(
    () => summarizeFeedback(transcript, { ...second, firstDeliveryId: 'a2' }),
    /首次交付/
  )
  assert.throws(
    () => summarizeFeedback(transcript, { ...second, modelEvents: annotations().modelEvents }),
    /无效消息/
  )
})

test('annotations cannot invent evidence, omit user inputs, or count the same rework batch twice', () => {
  const invalid = annotations()
  invalid.userEvents[0].messageId = 'not-present'
  assert.throws(() => summarizeFeedback({ messages, issues: [] }, invalid), /无效消息/)
  const omitted = annotations()
  omitted.userEvents.pop()
  assert.throws(() => summarizeFeedback({ messages, issues: [] }, omitted), /逐条核对/)
  assert.throws(
    () =>
      summarizeFeedback(
        { messages: [messages[1]], issues: [] },
        {
          ...annotations(),
          firstDeliveryId: null,
          userEvents: [],
          modelEvents: []
        }
      ),
    /完整覆盖须有本次开工/
  )
  const duplicate = annotations()
  duplicate.reDeliveries = [
    { messageId: 'a3', requestId: 'u4' },
    { messageId: 'a3', requestId: 'u4' }
  ]
  assert.throws(() => summarizeFeedback({ messages, issues: [] }, duplicate), /扩大返工/)
})

test('published summaries escape markup and keep the rework-not-redelivered result visible', () => {
  const input = annotations()
  input.userEvents[0].summary = '<script> | 换行\n摘要'
  assert.throws(
    () => summarizeFeedback({ messages, issues: [] }, { ...input, prOnly: 'true' }),
    /prOnly 须为布尔值/
  )
  const comment = renderComment(summarizeFeedback({ messages, issues: [] }, input))
  assert.ok(comment.includes('&lt;script&gt; \\| 换行 摘要'))
  assert.ok(comment.includes('尚未全部重交'))
  assert.ok(comment.includes('bw-workflow-feedback:'))
  assert.ok(comment.includes('<!-- bw-workflow-report:v1 -->'))
  assert.ok(!comment.includes('AGENTS instructions'))
  assert.ok(comment.startsWith('<!-- bw-workflow-feedback:'))
  const prOnly = renderComment(
    summarizeFeedback({ messages, issues: [] }, { ...input, prOnly: true })
  )
  assert.ok(prOnly.startsWith('<!-- bw-workflow-report:v1 -->\n<!-- bw-workflow-feedback:'))
  assert.ok(prOnly.includes('本报告用于 PR 复盘。'))
})
