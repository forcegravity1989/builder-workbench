export const workflowFields = [
  ['initial', '开工额外输入', 'Issue 和自动上下文之外，人额外提供的开工信息；单任务有记1，无记0。'],
  ['ask', 'AskUser', '首次完成交付前的业务澄清轮次；一批多个问题记一轮，权限请求另列。'],
  ['hifi', '高保真前审', '首次完成交付前，由模型发起的高保真评审轮次；必要设计协作不等同缺陷。'],
  ['validation', '人工验证指导', '首次完成交付前，人提醒或指导模型搭环境、跑场景、补验证的批次。'],
  ['correction', '人工中途纠偏', '首次完成交付前，人纠正已有理解、范围或执行约束的批次。'],
  [
    'rework',
    'PR 交付返工',
    '读取明确的首次人审结论与返工记录；待审、未记录和PR合入不能当作零返工。'
  ]
]

/** Read the published table; counts and semantic classification belong to workflow. */
export function readWorkflowComment(comment) {
  const body = comment?.body ?? ''
  const marker = /<!--\s*bw-workflow-feedback:(https?:\/\/[^\s>]+)\s*-->/.exec(body)
  if (!marker) {
    return { kind: 'unknown', reason: '未找到 workflow 指标评论标记' }
  }
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex((line) => /^\|\s*指标\s*\|\s*本(?:次|任务)记录\s*\|/.test(line))
  if (start === -1) {
    return { kind: 'unknown', reason: '指标表格式未识别' }
  }
  const rows = []
  for (const line of lines.slice(start + 1)) {
    if (!line.trim().startsWith('|')) {
      break
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((value) => value.trim())
    if (cells.length === 2 && !/^[-:]+$/.test(cells[0])) {
      rows.push(cells)
    }
  }
  return {
    kind: 'ready',
    issueUrl: marker[1],
    metrics: workflowFields.map(([key, label, hint]) => {
      const values = rows.filter(([name]) => name === label).map(([, value]) => value)
      return { key, label, hint, value: values.length === 1 && values[0] ? values[0] : '未知' }
    })
  }
}
