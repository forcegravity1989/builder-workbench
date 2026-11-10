const userTags = [
  'initial_extra_input',
  'validation_guidance',
  'correction',
  'rework_request',
  'authorization',
  'resume',
  'other'
]
const modelTags = ['ask_user', 'permission', 'hifi_review']

export const feedbackSchema = {
  issueUrl: 'https://github.com/OWNER/REPO/issues/NUMBER',
  prUrl: 'https://github.com/OWNER/REPO/pull/NUMBER',
  workflowVersion: '实际读取的版本，未知填 unknown',
  sessionTitle: '可选，桌面会话名称',
  firstDeliveryId: '模型首次明确交付供人验收的消息 ID；尚未交付填 null',
  coverage: { initialInput: false, preDelivery: false, review: false },
  userEvents: [
    {
      messageId: '逐条标注所有用户消息',
      tags: userTags,
      summary: '简述这条输入；tags 只选实际成立的标签',
      duplicateOf: '可选，明确重复事件的原用户消息 ID'
    }
  ],
  modelEvents: [
    { messageId: '模型提问或先审高保真的消息 ID', tags: modelTags, summary: '问题是什么' }
  ],
  review: {
    verdict: 'pending / accepted / changes_requested',
    evidenceIds: ['实际人审结论的用户消息 ID，可同时引用模型撤回结论']
  },
  reDeliveries: [
    { messageId: '返工后重新交付的模型消息 ID', requestId: '对应 rework_request 用户消息 ID' }
  ],
  findings: ['有原文依据的反哺建议，可留空']
}

function requireThat(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function webUrl(value) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol)
  } catch {
    return false
  }
}

export function summarizeFeedback(transcript, annotations) {
  const messages = transcript.messages
  requireThat(Array.isArray(messages) && messages.length > 0, '提取结果缺消息')
  requireThat(webUrl(annotations.issueUrl) && webUrl(annotations.prUrl), '需要实际 Issue 与 PR URL')
  const byId = new Map(messages.map((message, index) => [message.id, { ...message, index }]))
  requireThat(byId.size === messages.length, '提取消息 ID 重复')
  const users = annotations.userEvents ?? []
  const models = annotations.modelEvents ?? []
  const validate = (events, tags, roles) => {
    const seen = new Set()
    for (const event of events) {
      const message = byId.get(event.messageId)
      requireThat(message && roles.includes(message.role), `标注引用无效消息：${event.messageId}`)
      requireThat(!seen.has(event.messageId), `同一消息只能标注一次：${event.messageId}`)
      seen.add(event.messageId)
      requireThat(
        Array.isArray(event.tags) && event.tags.every((tag) => tags.includes(tag)),
        '标注包含未知标签'
      )
      requireThat(
        typeof event.summary === 'string' && event.summary.trim() && event.summary.length <= 240,
        '输入摘要须为 1–240 字符'
      )
    }
  }
  validate(users, userTags, ['user'])
  validate(models, modelTags, ['assistant', 'question'])
  const delivery = annotations.firstDeliveryId ? byId.get(annotations.firstDeliveryId) : null
  requireThat(
    !annotations.firstDeliveryId || delivery?.role === 'assistant',
    '首次交付必须引用模型消息'
  )
  const coverage = annotations.coverage ?? {}
  const issues = transcript.issues ?? []
  if (coverage.initialInput || coverage.preDelivery || coverage.review) {
    requireThat(issues.length === 0, '提取有缺口，不能声明完整覆盖；修复来源或保留未知')
    requireThat(
      users.length === messages.filter((message) => message.role === 'user').length,
      '完整覆盖需逐条核对所有用户输入'
    )
  }
  requireThat(!coverage.preDelivery || delivery, '交付前完整口径需要首次交付证据')
  const firstUser = messages.find((message) => message.role === 'user')
  const deduplicated = users.filter((event) => {
    if (!event.duplicateOf) {
      return true
    }
    const original = byId.get(event.duplicateOf)
    const current = byId.get(event.messageId)
    requireThat(
      original?.role === 'user' && original.index < current.index && original.text === current.text,
      '去重须引用此前相同原文的用户事件'
    )
    requireThat(
      users.some((item) => item.messageId === event.duplicateOf && !item.duplicateOf),
      '去重必须指向保留的原事件'
    )
    return false
  })
  for (const event of deduplicated) {
    if (event.tags.includes('initial_extra_input')) {
      requireThat(event.messageId === firstUser.id, '开工额外输入只计首次用户输入')
    }
    if (event.tags.includes('rework_request')) {
      requireThat(
        delivery && byId.get(event.messageId).index > delivery.index,
        '返工意见必须在首次交付后'
      )
    }
  }
  for (const event of models) {
    requireThat(
      !(event.tags.includes('ask_user') && event.tags.includes('permission')),
      '权限请求与业务 AskUser 分开标'
    )
  }
  const before = (event) => delivery && byId.get(event.messageId).index < delivery.index
  const count = (events, tag) =>
    events.filter((event) => before(event) && event.tags.includes(tag)).length
  const review = annotations.review ?? { verdict: 'pending', evidenceIds: [] }
  requireThat(['pending', 'accepted', 'changes_requested'].includes(review.verdict), '未知评审结论')
  if (review.verdict !== 'pending') {
    requireThat(
      delivery &&
        review.evidenceIds?.some(
          (id) => byId.get(id)?.role === 'user' && byId.get(id).index > delivery.index
        ),
      '首次评审需交付后实际用户结论证据'
    )
    requireThat(
      review.evidenceIds.every((id) => byId.has(id)),
      '评审引用不存在的消息'
    )
  }
  const redeliveries = annotations.reDeliveries ?? []
  const completedRequests = new Set()
  for (const item of redeliveries) {
    const request = deduplicated.find(
      (event) => event.messageId === item.requestId && event.tags.includes('rework_request')
    )
    requireThat(
      request &&
        byId.get(item.messageId)?.role === 'assistant' &&
        byId.get(item.messageId).index > byId.get(item.requestId).index,
      '返工重交需引用此前退回意见与之后模型交付'
    )
    requireThat(!completedRequests.has(item.requestId), '同批意见的多个交付不能扩大返工轮次')
    completedRequests.add(item.requestId)
  }
  const rejections = deduplicated.filter((event) => event.tags.includes('rework_request')).length
  requireThat(
    review.verdict !== 'changes_requested' || rejections > 0,
    '退回结论需标注实际返工意见'
  )
  const process = coverage.preDelivery === true
  return {
    schemaVersion: 1,
    issueUrl: annotations.issueUrl,
    prUrl: annotations.prUrl,
    session: transcript.session,
    sessionTitle: annotations.sessionTitle,
    workflowVersion: annotations.workflowVersion ?? 'unknown',
    coverage,
    issues,
    firstDeliveryId: annotations.firstDeliveryId,
    review,
    rawHumanMessages: messages.filter((message) => message.role === 'user').length,
    annotatedHumanMessages: users.length,
    normalizedHumanEvents:
      users.length === messages.filter((message) => message.role === 'user').length
        ? deduplicated.length
        : null,
    metrics: {
      initialExtraInput:
        coverage.initialInput === true
          ? Number(deduplicated.some((event) => event.tags.includes('initial_extra_input')))
          : null,
      askUserRounds: process ? count(models, 'ask_user') : null,
      hifiReviewRounds: process ? count(models, 'hifi_review') : null,
      validationGuidanceBatches: process ? count(deduplicated, 'validation_guidance') : null,
      correctionBatches: process ? count(deduplicated, 'correction') : null,
      permissionRounds: process ? count(models, 'permission') : null,
      reworkOccurred:
        coverage.review === true && review.verdict !== 'pending'
          ? review.verdict === 'changes_requested'
          : null,
      rejectionBatches: rejections,
      completedReworkRounds: completedRequests.size,
      preDeliveryInterventions: process
        ? deduplicated.filter(
            (event) =>
              before(event) &&
              event.tags.some((tag) => ['validation_guidance', 'correction'].includes(tag))
          ).length
        : null
    },
    userInputs: deduplicated.map((event) => ({
      ...event,
      stage: delivery ? (before(event) ? '首次交付前' : '交付后') : '进行中',
      source: byId.get(event.messageId).source
    })),
    modelEvents: models,
    reDeliveries: redeliveries,
    findings: annotations.findings ?? []
  }
}

function escape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replace(/[\r\n]+/g, ' ')
}

export function renderComment(report) {
  const m = report.metrics
  const value = (number) => (number === null ? '未知' : String(number))
  const rounds = `退回 ${m.rejectionBatches} 批；完成返工 ${m.completedReworkRounds} 轮${m.completedReworkRounds < m.rejectionBatches ? '，尚未全部重交' : ''}`
  const rework =
    m.reworkOccurred === null
      ? '待审 / 未知'
      : m.reworkOccurred
        ? `已${rounds}`
        : `首次人审通过${m.rejectionBatches ? `；后续${rounds}` : ''}`
  return `<!-- bw-workflow-feedback:${escape(report.issueUrl)} -->
## Workflow 会话反馈

会话：${escape(report.sessionTitle ?? report.session?.id ?? '未知')} · 方法：${escape(report.workflowVersion)}。单任务计数。

| 指标 | 本次记录 |
|---|---|
| 开工额外输入 | ${m.initialExtraInput === null ? '未知' : m.initialExtraInput ? '有，本任务记 1' : '无，记 0'} |
| AskUser | ${value(m.askUserRounds)} 轮 |
| 高保真前审 | ${value(m.hifiReviewRounds)} 轮 |
| 人工验证指导 | ${value(m.validationGuidanceBatches)} 批 |
| 人工中途纠偏 | ${value(m.correctionBatches)} 批 |
| PR 交付返工 | ${rework} |

权限请求另记 ${value(m.permissionRounds)} 轮。交付前验证指导与纠偏按消息去重后 ${value(m.preDeliveryInterventions)} 批，不相加。前五项仅统计首次交付前；未审和缺记录不算零返工。

**用户输入简述**（${report.rawHumanMessages} 条原始消息，已标注 ${report.annotatedHumanMessages} 条 → ${value(report.normalizedHumanEvents)} 个事件）：
${report.userInputs.length ? report.userInputs.map((event) => `- ${escape(event.stage)}：${escape(event.summary)}`).join('\n') : '- 尚无已核对的输入摘要。'}

**反哺去向：** ${report.findings.length ? report.findings.map(escape).join('；') : '暂无已核对建议。'}

来源：Codex 原始会话提取、模型逐条标注、脚本校验计数及实际人审证据。初始输入 / 交付前过程 / 人审覆盖：${report.coverage.initialInput === true ? '完整' : '未知'} / ${report.coverage.preDelivery === true ? '完整' : '未知'} / ${report.coverage.review === true ? '已核对' : '未知'}。原文与消息定位留在本地提取和标注产物中。${report.issues.length ? ` 缺口：${report.issues.map(escape).join('；')}` : ''}
`
}
