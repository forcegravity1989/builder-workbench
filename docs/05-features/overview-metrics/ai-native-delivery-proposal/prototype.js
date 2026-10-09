;(() => {
  'use strict'
  const $ = (selector, scope = document) => scope.querySelector(selector)
  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    )
  const paths = {
    overview:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    plan: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4"/>',
    acceptance:
      '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    metrics: '<path d="M3 3v18h18M7 15l4-5 4 3 5-7"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"/>'
  }
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
      paths[name] || paths.file
    }</svg>`
  const tag = (label, kind = 'neutral') => `<span class="tag tag-${kind}">${label}</span>`
  const button = (label, action, kind = 'secondary', extra = '') =>
    `<button class="btn btn-${kind}" data-action="${action}" ${extra}>${label}</button>`
  const link = (label, action, extra = '') =>
    `<button class="text-button" data-action="${action}" ${extra}>${label}</button>`
  const scopes = [
    ['导入一份客户表', '支持 CSV、预览数据，不要求运营修改原文件。'],
    ['识别并修正字段映射', '能看懂字段去向，修正未匹配的「手机号码」。'],
    ['定位错误并重新导入', '保留已填内容，指出行号、原因和修改方式。']
  ]
  const originalTrials = [
    {
      name: '运营 A',
      initial: '周',
      result: '完成导入并修错',
      detail: '独立完成 · 首次使用',
      duration: '8′20″',
      ok: true
    },
    {
      name: '运营 B',
      initial: '陈',
      result: '完成导入并修错',
      detail: '独立完成 · 首次使用',
      duration: '9′00″',
      ok: true
    },
    {
      name: '运营 C',
      initial: '许',
      result: '停在字段映射',
      detail: '「手机号码」没有匹配提示，需要 Builder 帮助',
      duration: '未完成',
      ok: false
    }
  ]
  const repairedTrials = [
    {
      name: '运营 A',
      initial: '周',
      result: '独立完成复测',
      detail: '同一任务 · 无 Builder 帮助',
      duration: '7′10″',
      ok: true
    },
    {
      name: '运营 B',
      initial: '陈',
      result: '独立完成复测',
      detail: '同一任务 · 无 Builder 帮助',
      duration: '7′20″',
      ok: true
    },
    {
      name: '运营 C',
      initial: '许',
      result: '独立修正映射并完成',
      detail: '看懂字段提示 · 未再次卡住',
      duration: '8′00″',
      ok: true
    }
  ]
  let state, toastTimer, returnFocus
  const modal = $('#modal')
  function initial(scenario = 'blocked') {
    return {
      scenario,
      view: 'overview',
      promise: '运营能独立导入客户资料，遇到错误也能自己修正。',
      audience: '3 位运营试用者',
      deadline: '2026-10-09',
      scopeConfirmed: scenario !== 'empty',
      deferred: false,
      evidenceAligned: true,
      decision: null,
      done: false
    }
  }
  state = initial()
  const isEmpty = () => state.scenario === 'empty'
  const isRepaired = () => state.scenario === 'repaired'
  const version = () => (isRepaired() ? 'v0.3 · rc.2' : 'v0.3 · rc.1')
  const completionAllowed = () =>
    isRepaired() && state.scopeConfirmed && state.evidenceAligned && !state.done
  function announce(message) {
    clearTimeout(toastTimer)
    const element = $('#toast')
    element.textContent = message
    element.hidden = false
    toastTimer = setTimeout(() => {
      element.hidden = true
    }, 4500)
  }
  function statusTag() {
    if (state.done) {
      return tag('人已确认完成', 'success')
    }
    if (!state.evidenceAligned) {
      return tag('范围已变 · 待补证据', 'warning')
    }
    if (state.decision) {
      return tag('未达成 · 继续修复', 'warning')
    }
    if (isEmpty()) {
      return tag(state.scopeConfirmed ? '等待运行与使用证据' : '范围待确认')
    }
    if (isRepaired()) {
      return tag('证据已更新 · 待人确认', 'accent')
    }
    return tag('需人决定', 'warning')
  }
  function heading(title, description) {
    return `<div class="page-heading"><div><div class="eyebrow"><span class="mono">v0.3</span><span>本次小版本</span></div><h1>${
      title
    }</h1><p>${description}</p></div><div class="heading-status">${statusTag()}</div></div>`
  }
  function sectionTitle(title, aside = '') {
    return `<div class="section-label"><h2>${title}</h2>${aside}</div>`
  }
  function scopeList() {
    return `<ul class="scope-items">${scopes
      .map((s) => `<li>${icon('check')}<span>${s[0]}</span></li>`)
      .join('')}</ul><div class="scope-out">本次不做：自动标签、多源同步、权限体系</div>`
  }
  function sessionMini() {
    return `<section class="section-divider">${sectionTitle(
      '执行在哪里'
    )}<div class="session-mini"><strong>导入映射修复</strong><p>${
      isEmpty()
        ? state.scopeConfirmed
          ? '范围已确认，把本次承诺带入原生工作区，准备运行与试用材料。'
          : '范围确认后，带着本次承诺进入原生工作区。'
        : isRepaired()
          ? '字段提示和重试路径已补齐，等待你判断本次结果。'
          : '映射提示的修复建议已准备，需要先明确本次怎么收口。'
    }</p><div class="inline-meta"><span class="mono">Orca</span><span>独立工作树</span><span>1 个会话</span></div>${button(
      `查看本次会话 ${icon('arrow')}`,
      'session'
    )}</div></section>`
  }
  function rightRail() {
    return `<aside class="side-column"><section>${sectionTitle(
      '本次只做这些',
      link('调整', 'plan')
    )}${scopeList()}</section>${sessionMini()}<section class="section-divider">${sectionTitle(
      '最近发生'
    )}<div class="activity-row"><time>${isRepaired() ? '16:20' : '15:40'}</time><span>${
      isRepaired()
        ? '同一组 3 位运营复测完成'
        : isEmpty()
          ? '本次范围草稿已准备'
          : '运营 C 卡在字段映射'
    }</span></div><div class="activity-row"><time>15:10</time><span>${
      isEmpty() ? '还没有运行或使用证据' : '试用版本已交给 3 位运营'
    }</span></div><div class="activity-row"><time>14:40</time><span>${
      isEmpty() ? '等待 Builder 确认小版本' : '导入与修错路径运行通过'
    }</span></div></section></aside>`
  }
  function evidenceStrip() {
    const values =
      isEmpty() || !state.evidenceAligned
        ? [
            ['runtime', '能运行', 'Unknown', '还没有对应版本的运行证据', 'todo'],
            ['distribution', '已交到手', 'Unknown', '还没有可用入口和分发记录', 'todo'],
            ['use', '被真正使用', 'Unknown', '还没有目标用户完成任务', 'todo']
          ]
        : [
            ['runtime', '能运行', '运行通过', '导入、映射、修错均已检查', 'done'],
            [
              'distribution',
              '已交到手',
              '3 位已收到',
              `试用入口可访问 · ${isRepaired() ? 'rc.2' : 'rc.1'}`,
              'done'
            ],
            [
              'use',
              '被真正使用',
              isRepaired() ? '3 / 3 独立完成' : '2 / 3 独立完成',
              isRepaired() ? '同一组试用者复测 · 待确认' : '1 位仍需 Builder 帮助',
              isRepaired() ? 'review' : 'blocked'
            ]
          ]
    return `<div class="evidence-strip">${values
      .map(
        (v, i) =>
          `<button class="evidence-step" data-action="evidence" data-kind="${
            v[0]
          }"><span class="step-top"><span class="step-no">0${i + 1}</span>${
            v[1]
          }<span class="status status-${
            v[4]
          }"><span class="status-dot"></span></span></span><strong>${v[2]}</strong><small>${
            v[3]
          }</small></button>`
      )
      .join('')}</div>`
  }
  function trials(rows) {
    return `<div class="trial-list">${rows
      .map(
        (r) =>
          `<div class="trial-row${r.ok ? '' : ' failed'}"><span class="avatar avatar-sm">${
            r.initial
          }</span><div><strong>${r.name} · ${r.result}</strong><p>${
            r.detail
          }</p></div><span class="mono">${r.duration}</span></div>`
      )
      .join('')}</div>`
  }
  function decisionBlock() {
    if (state.done) {
      return `<div class="decision-block done"><span class="note-label">你已确认</span><h3>v0.3 的小承诺已完成</h3><p>3 位运营完成了本次任务。接下来观察实际使用能否持续，再决定下一轮要做什么。</p>${link(
        '查看本次验收',
        'acceptance'
      )}</div>`
    }
    if (state.decision) {
      return `<div class="decision-block resolved"><span class="note-label">你作出的决定 · 林舟</span><h3>本次未达成，按你的下一步继续</h3><p>${esc(
        state.decision.next
      )}</p>${button(`查看本次会话 ${icon('arrow')}`, 'session', 'primary')}</div>`
    }
    if (!state.evidenceAligned) {
      return `<div class="decision-block"><span class="note-label">旧结果不能用于新承诺</span><h3>范围已变，需要对应的新证据</h3><p>已有材料只对应原来的 3 位运营导入任务。当前证据状态为 Unknown，不能据此确认新承诺完成。</p>${button(
        `查看本次验收 ${icon('arrow')}`,
        'acceptance',
        'primary'
      )}</div>`
    }
    if (isEmpty() && state.scopeConfirmed) {
      return `<div class="decision-block resolved"><span class="note-label">范围已确认，下一步进入执行</span><h3>准备对应版本的运行与试用证据</h3><p>带着这次小承诺进入原生工作区，准备可运行的版本，再交给目标用户完成任务。</p>${button(
        `查看本次会话 ${icon('arrow')}`,
        'session',
        'primary'
      )}</div>`
    }
    if (isEmpty()) {
      return `<div class="decision-block"><span class="note-label">先明确一件事</span><h3>这个版本要让谁完成什么？</h3><p>先确认本次范围和成功判据，再安排执行与试用。</p>${button(
        `确认本次范围 ${icon('arrow')}`,
        'edit-plan',
        'primary'
      )}</div>`
    }
    if (isRepaired()) {
      return `<div class="decision-block resolved"><span class="note-label">等待你的判断</span><h3>修复后，3 位运营都完成了任务</h3><p>同一组试用者的复测证据已经补齐。按需查看版本、来源和窗口，决定本次是否完成。</p>${button(
        `核对并作出验收决定 ${icon('arrow')}`,
        'acceptance',
        'primary'
      )}</div>`
    }
    return `<div class="decision-block"><span class="note-label">1 件事需要你决定</span><h3>映射步骤卡住，本次还不能收口</h3><p>运营 C 没有独立完成导入。建议先补清字段提示，再请同一组试用者复测；自动标签留到以后。</p>${button(
      `处理这次阻塞 ${icon('arrow')}`,
      'decide',
      'primary'
    )}</div>`
  }
  function overview() {
    return `${heading(
      '让运营独立完成导入和修错',
      '10 月想验证：运营能独立完成资料导入。'
    )}<div class="two-column"><div class="content-column"><section class="commitment"><div class="section-label"><h2>本次承诺</h2>${
      state.scopeConfirmed ? tag('范围已确认') : tag('范围草稿', 'warning')
    }</div><p class="commitment-main">${esc(
      state.promise
    )}</p><div class="inline-meta"><span>对象 <strong>${esc(
      state.audience
    )}</strong></span><span>期限 <strong>${esc(
      state.deadline.slice(5).replace('-', ' 月 ')
    )} 日</strong></span><span>负责人 <strong>林舟</strong></span></div></section>${evidenceStrip()}${decisionBlock()}<section class="section-divider">${sectionTitle(
      !state.evidenceAligned
        ? '原范围的试用记录'
        : isRepaired()
          ? '修复后的真实任务复测'
          : '这次试用，发生了什么',
      link('查看指标与口径', 'metrics')
    )}${
      isEmpty()
        ? '<div class="empty-state"><h3>尚未收集到使用结果</h3><p>没有数据时保持 Unknown。运行通过、代码合入或拿到链接，都不能替代用户独立完成任务。</p></div>'
        : `${
            !state.evidenceAligned
              ? '<p class="caption">以下仅对应原范围「3 位运营独立导入并修错」，不作为新承诺的验收依据。</p>'
              : ''
          }<div class="result-summary"><div class="signal-number">${
            isRepaired() ? '3' : '2'
          }<span> / 3</span></div><div><p>运营独立完成导入并修错</p><p class="muted">${
            isRepaired() ? '同一组试用者复测 · 仍是小样本' : '目标 3 / 3 · 首轮小样本，不能外推'
          }</p></div></div>${trials(
            isRepaired() ? repairedTrials : originalTrials
          )}<div class="result-foot"><span>${
            isRepaired() ? '复测窗口：10 月 9 日 16:00–16:20' : '采集窗口：10 月 9 日 15:10–15:40'
          }</span>${link('查看使用证据', 'evidence', 'data-kind="use"')}</div>`
    }</section></div>${rightRail()}</div>`
  }
  function plan() {
    return `${heading(
      '小到这次能交出去',
      '围绕一次用户任务收敛范围，新的建议先留在承诺之外。'
    )}<div class="two-column"><div class="content-column"><section>${sectionTitle(
      'v0.3 的范围',
      state.scopeConfirmed ? tag('人已确认') : tag('等待确认', 'warning')
    )}<p class="plan-objective">${esc(state.promise)}</p><div class="inline-meta"><span>${esc(
      state.audience
    )}</span><span>截至 <strong>${esc(
      state.deadline
    )}</strong></span><span>成功判据 <strong>3 / 3 独立完成</strong></span></div><div class="plan-actions">${button(
      '编辑本次范围',
      'edit-plan',
      state.scopeConfirmed ? 'secondary' : 'primary'
    )}<span class="muted">${
      !state.evidenceAligned ? '新范围需要对应的新证据' : '林舟负责范围取舍与最终验收'
    }</span></div></section><section>${sectionTitle('包含 3 件事')}${scopes
      .map(
        (s, i) =>
          `<div class="scope-row"><span class="mono">0${i + 1}</span><div><h3>${s[0]}</h3><p>${
            s[1]
          }</p></div>${tag('本次范围')}</div>`
      )
      .join('')}</section><section class="section-divider">${sectionTitle(
      '建议先留在承诺之外',
      tag('AI 建议')
    )}<div class="suggestion"><div><h3>导入后自动给客户打标签</h3><p>有助于后续整理，但不是「独立导入并修错」的前提。</p></div>${
      state.deferred ? tag('已移到以后做') : button('移到以后做', 'defer')
    }</div><p class="caption">${
      state.deferred
        ? '你已决定延期。本次仍然只包含上面的 3 件事。'
        : '建议不会自动进入本次范围，由你决定是否安排。'
    }</p></section><section class="section-divider">${sectionTitle(
      '以后再考虑'
    )}<p class="muted">多源同步 · 权限体系${
      state.deferred ? ' · 自动标签' : ''
    }</p></section></div><aside class="side-column"><section>${sectionTitle(
      '怎样算完成'
    )}<p>3 位运营使用同一试用版本，在没有 Builder 帮助的情况下完成导入，并修正一处错误。</p><p class="caption">运行证据、分发记录和用户任务结果分别核对。最终结论由你确认。</p></section>${sessionMini()}</aside></div>`
  }
  const evidenceTitles = { runtime: '运行证据', distribution: '分发证据', use: '真实使用证据' }
  function evidenceDescription(kind) {
    if (isEmpty()) {
      return '没有对应版本的证据，暂时无法判断。'
    }
    if (!state.evidenceAligned) {
      return '现有材料仅对应原来的 3 位运营导入任务。新承诺尚无匹配证据，保持 Unknown。'
    }
    if (kind === 'runtime') {
      return `导入、映射与错误重试已在 ${version()} 运行检查；覆盖 12 条既定检查。`
    }
    if (kind === 'distribution') {
      return '3 位运营收到同一个试用入口，访问检查通过。收到链接与实际完成任务分别记录。'
    }
    return isRepaired()
      ? '同一组 3 位运营在 rc.2 独立完成任务。首次 2 / 3 的记录保留，复测不代表持续价值已被证明。'
      : '2 位独立完成；运营 C 在字段映射处中断，需要 Builder 帮助，不计入成功。'
  }
  function acceptance() {
    const statuses =
      isEmpty() || !state.evidenceAligned
        ? [
            ['Unknown', 'neutral'],
            ['Unknown', 'neutral'],
            ['Unknown', 'neutral']
          ]
        : [
            ['证据已具备', 'success'],
            ['证据已具备', 'success'],
            isRepaired() ? ['复测 3 / 3', 'accent'] : ['未达成 2 / 3', 'warning']
          ]
    const criteria = [
      '运营可以运行完整的导入与修错路径',
      '3 位运营拿到可访问的同一试用版本',
      '3 位运营不依赖 Builder，独立完成任务'
    ]
    return (
      `${heading(
        '证据说明发生什么，你决定是否完成',
        '核对本次承诺，把未达成和下一步一起留下。'
      )}<div class="two-column"><div class="content-column">` +
      `<div class="section-label"><h2>本次验收 · v0.3</h2><span class="muted">证据按需查看 · 结果由你决定</span></div>${[
        'runtime',
        'distribution',
        'use'
      ]
        .map(
          (kind, i) =>
            '<section class="accept-row"><div class="accept-row-head"><span class="accept-number">0' +
            (i + 1) +
            '</span><div class="accept-content"><h3>' +
            criteria[i] +
            '</h3><p>' +
            evidenceDescription(kind) +
            '</p><div class="inline-meta">' +
            link('查看' + evidenceTitles[kind], 'evidence', 'data-kind="' + kind + '"') +
            '</div></div>' +
            tag(statuses[i][0], statuses[i][1]) +
            '</div></section>'
        )
        .join('')}<div class="accept-footer">${
        state.done
          ? tag('林舟已确认完成', 'success')
          : button('确认本次完成', 'complete', 'primary', completionAllowed() ? '' : 'disabled')
      }${
        state.done ? button('查看总览', 'overview') : button('记录未达成与下一步', 'decide')
      }</div><p class="caption">${
        state.done
          ? '人的确认已同步到总览。真实使用结果只适用于本次任务与这 3 位试用者。'
          : !state.scopeConfirmed
            ? '先确认本次范围；范围草稿不能直接完成。'
            : !state.evidenceAligned
              ? '当前承诺与原证据不匹配，不能确认完成。请补齐新范围证据；本演示可重置回匹配场景。'
              : isEmpty()
                ? '证据不足：保留 Unknown，不能确认完成。'
                : !isRepaired()
                  ? '使用结果未达到 3 / 3，暂不能确认完成。可以记录下一步并继续修复。'
                  : '复测证据已满足本次示例判据，可按需查看。只有你确认后，版本才会记录为完成。'
      }</p>${
        state.decision
          ? '<div class="decision-summary"><strong>你的决定：未达成</strong><p>' +
            esc(state.decision.reason) +
            '</p><p>下一步：' +
            esc(state.decision.next) +
            '</p></div>'
          : ''
      }${
        isRepaired()
          ? '<section class="section-divider">' +
            sectionTitle('保留首次结果') +
            '<p class="muted">rc.1 · 15:10–15:40 · 2 / 3 独立完成。运营 C 卡在映射步骤，未计入成功。</p>' +
            link('查看首次失败记录', 'history') +
            '</section>'
          : ''
      }</div><aside class="side-column"><section>${sectionTitle('本次承诺')}<p>${esc(
        state.promise
      )}</p><p class="caption">对象：${esc(state.audience)}<br>期限：${esc(
        state.deadline
      )}<br>判断者：林舟</p></section><section class="section-divider">${sectionTitle(
        '证据不能替你决定'
      )}<p class="caption">代码合入证明代码变化。运行检查说明路径能跑。只有目标用户完成任务，才支持这次结果判断。</p></section>${sessionMini()}</aside></div>`
    )
  }
  function metrics() {
    return (
      `${heading(
        '看用户是否完成任务',
        '这些读数帮助决定下一步，不合成项目健康分。'
      )}<div class="two-column"><div class="content-column">${
        !state.evidenceAligned
          ? '<p class="caption">原范围历史读数：以下数据仅对应原来的 3 位运营导入任务，不用于当前新承诺。</p>'
          : ''
      }<div class="inline-meta"><strong>${version()}</strong><span>${
        isEmpty() ? '尚未采集' : isRepaired() ? '10 月 9 日 16:00–16:20' : '10 月 9 日 15:10–15:40'
      }</span>${tag(isEmpty() ? '计划邀请 3 位试用者' : '小样本 · 3 位试用者')}</div>` +
      `<div class="metrics-head"><div class="metric-cell"><label>独立完成导入并修错</label><strong>${
        isEmpty() ? 'Unknown' : isRepaired() ? '3 / 3' : '2 / 3'
      }</strong><small>本次目标 3 / 3 · 不等同商业价值</small></div><div class="metric-cell"><label>成功任务用时中位数</label><strong>${
        isEmpty() ? 'Unknown' : isRepaired() ? '7′20″' : '8′40″'
      }</strong><small>${
        isEmpty()
          ? '无成功任务记录 · 未计算'
          : isRepaired()
            ? '3 次成功任务 · 含重复使用影响'
            : '仅 2 次成功任务 · 失败未计入'
      }</small></div><div class="metric-cell"><label>需要 Builder 帮助</label><strong>${
        isEmpty() ? 'Unknown' : isRepaired() ? '0 / 3' : '1 / 3'
      }</strong><small>记录是否发生帮助，不作综合评分</small></div></div>` +
      `<section>${sectionTitle('同一个任务，前后分别记录')}${
        isEmpty()
          ? '<div class="empty-state"><h3>还没有可比较的使用结果</h3><p>从首次试用开始收集；不以演示曲线填补空白。</p></div>'
          : '<div class="bar-chart"><div class="chart-row"><span>首次 · rc.1</span><div class="chart-track"><span class="chart-value" style="width:66.666%"></span><span class="chart-failure" style="width:33.334%"></span></div><span class="mono">2 / 3</span></div>' +
            (isRepaired()
              ? '<div class="chart-row current"><span>复测 · rc.2</span><div class="chart-track"><span class="chart-value" style="width:100%"></span></div><span class="mono">3 / 3</span></div>'
              : '') +
            '</div><div class="legend"><span><i></i>独立完成</span><span><i class="fail"></i>未完成</span></div><p class="caption">同一组人、同一个任务的观察；样本太小且存在熟悉效应，不能推导总体成功率或因果收益。</p>'
      }</section><section class="section-divider">${sectionTitle(
        '逐次结果',
        link('查看采集依据', 'evidence', 'data-kind="use"')
      )}${
        isEmpty()
          ? '<p class="muted">Unknown · 还没有使用记录。</p>'
          : trials(isRepaired() ? repairedTrials : originalTrials)
      }</section><section class="section-divider">${sectionTitle(
        '还不知道的事'
      )}<div class="scope-row"><span class="mono">—</span><div><h3>持续使用与节省的人力</h3><p>需要后续实际使用记录；本轮试用尚不能回答。</p></div>${tag(
        'Unknown'
      )}</div><div class="scope-row"><span class="mono">—</span><div><h3>商业价值与投入产出</h3><p>没有商业数据，不从任务完成率外推。</p></div>${tag(
        'Unknown'
      )}</div></section></div><aside class="side-column"><section>${sectionTitle(
        '口径'
      )}<h3>什么算独立完成？</h3><p class="caption">上传给定客户表，修正一个字段映射，发现并修复一处错误后完成导入。过程中没有 Builder 代做或提示。</p><h3 style="margin-top:var(--space-6)">这次如何收集？</h3><p class="caption">示例任务事件与试用观察表交叉核对。记录版本、起止时间、结果和是否得到帮助。每位试用者在每个窗口只计一次。</p></section><section class="section-divider">${sectionTitle(
        '从结果到下一步'
      )}<p class="caption">${
        isRepaired()
          ? '先由人确认本次结果，再观察是否重复使用；不自动增加新功能。'
          : '失败集中在映射步骤，优先修正说明与反馈；此时新增自动标签不会消除当前阻塞。'
      }</p></section></aside></div>`
    )
  }
  function session() {
    return (
      `${heading(
        '在原生工作区继续执行',
        '带着本次承诺和阻塞进入会话，执行能力继续复用 Orca。'
      )}<div class="native-banner"><span class="inline-icon">${icon(
        'terminal'
      )}</span><div><strong>Orca 原生工作区快照</strong><span>交接示意 · 可查看已有材料；此处不提供聊天或真实调用</span></div></div>` +
      `<div class="two-column"><div class="content-column"><div class="workspace-snapshot"><div class="snapshot-toolbar"><span>导入映射修复</span><span class="mono">bw/import-mapping</span></div><div class="snapshot-body"><aside class="snapshot-files"><span><strong>工作树</strong></span><span>src/import/</span><span>mapping.tsx</span><span>retry.tsx</span><span>tests/import/</span><span>artifacts/</span></aside><div class="snapshot-main"><span class="note-label">带入本次会话的上下文</span><h3>${esc(
        state.promise
      )}</h3><p>${esc(
        state.decision?.next ||
          (isEmpty()
            ? '围绕已确认的本次范围，准备可运行的导入与修错路径，再安排试用。'
            : !state.evidenceAligned
              ? '范围已经改变，原有执行材料不适用。需要围绕新承诺重新准备证据。'
              : '保持现有导入流程。补清字段匹配提示和错误重试路径，再请同一组 3 位运营独立复测。')
      )}</p><div class="snapshot-message"><span class="note-label">执行摘要</span><p>${
        isEmpty()
          ? state.scopeConfirmed
            ? '范围已确认，尚未收集运行与使用证据。此处预览将带入原生会话的材料。'
            : '还未进入执行。先确认本次范围，再把已有上下文带入原生会话。'
          : isRepaired()
            ? '映射提示与重试路径已经更新；rc.2 运行检查和同组复测材料已准备，等待你验收。'
            : '已定位未匹配字段缺少解释的问题。修复范围和复测步骤已列出，尚不能宣称用户问题解决。'
      }</p><div class="snapshot-code">承诺：${esc(state.promise)}<br>对象：${esc(
        state.audience
      )}<br>范围：映射提示 / 错误反馈 / 重试<br>排除：自动标签 / 多源同步<br>返回：运行证据 + 同组任务结果</div></div><div class="snapshot-input">这是原生会话的只读快照。真正的消息、权限、工作树和运行都由 Orca 承接。</div></div></div></div><div class="plan-actions">${button(
        '查看执行证据',
        'evidence',
        'secondary',
        'data-kind="runtime"'
      )}${button(
        '返回本次验收',
        'acceptance'
      )}</div></div><aside class="side-column"><section>${sectionTitle(
        'BW 带入什么'
      )}<ul class="scope-items"><li>${icon(
        'check'
      )}<span>本次承诺和明确的范围</span></li><li>${icon(
        'check'
      )}<span>失败发生在谁的哪一步</span></li><li>${icon(
        'check'
      )}<span>下一步需要补齐的证据</span></li></ul></section><section class="section-divider">${sectionTitle(
        'Orca 继续负责'
      )}<p class="caption">会话与上下文、工作树、工具和权限、代码执行与评审。BW 不再复制一套聊天或任务执行器。</p></section></aside></div>`
    )
  }
  function render() {
    const restoreMainFocus = $('#main').contains(document.activeElement)
    const pages = [
      ['overview', '总览'],
      ['plan', '本次计划'],
      ['acceptance', '验收'],
      ['metrics', '指标']
    ]
    $('#navigation').innerHTML = pages
      .map(
        ([id, label]) =>
          `<button class="sidebar-item" data-action="${id}" ${
            state.view === id ? 'aria-current="page"' : ''
          }><span>${icon(id)}</span><span>${label}</span>${
            id === 'acceptance' && !state.done && !isEmpty() ? '<span class="count">1</span>' : ''
          }</button>`
      )
      .join('')
    $('#breadcrumb').textContent = (pages.find(([id]) => id === state.view) || [
      'session',
      '原生执行'
    ])[1]
    $('#main').innerHTML = { overview, plan, acceptance, metrics, session }[state.view]()
    document.querySelectorAll('[data-icon]').forEach((e) => {
      e.innerHTML = icon(e.dataset.icon)
    })
    $('#scenario').value = state.scenario
    if (restoreMainFocus) {
      $('#main').focus({ preventScroll: true })
    }
  }
  function navigate(view) {
    state.view = view
    render()
    window.scrollTo(0, 0)
    $('#main').focus({ preventScroll: true })
  }
  function showModal(title, subtitle, body, actions, drawer = false) {
    returnFocus = document.activeElement
    modal.classList.toggle('drawer', drawer)
    $('#modal-content').innerHTML = `<div class="modal-header"><div><h2 id="modal-title">${
      title
    }</h2><p>${
      subtitle
    }</p></div><button class="btn btn-ghost btn-icon" data-action="close" aria-label="关闭对话框">${icon(
      'close'
    )}</button></div><div class="modal-body">${body}</div>${
      actions ? `<div class="modal-actions">${actions}</div>` : ''
    }`
    if (!modal.open) {
      modal.showModal()
    }
    const input = $('input:not([type="checkbox"]), textarea, select', modal)
    ;(input || $('button', modal)).focus()
  }
  function closeModal() {
    modal.close()
    if (returnFocus && returnFocus.isConnected) {
      returnFocus.focus()
    } else {
      $('#main').focus({ preventScroll: true })
    }
  }
  function showEvidence(kind) {
    const present = !isEmpty()
    const source = {
      runtime: '运行记录 run-import-042 · 导入路径检查',
      distribution: '试用分发记录 trial-delivery-009',
      use: '任务事件 task-import-009 + 试用观察表'
    }[kind]
    const windowText =
      kind === 'runtime'
        ? isRepaired()
          ? '2026-10-09 15:50–15:58'
          : '2026-10-09 14:30–14:40'
        : kind === 'distribution'
          ? isRepaired()
            ? '2026-10-09 15:59–16:00'
            : '2026-10-09 15:00–15:10'
          : isRepaired()
            ? '2026-10-09 16:00–16:20'
            : '2026-10-09 15:10–15:40'
    let body =
      `<dl class="evidence-facts"><dt>对应版本</dt><dd class="mono">${version()}</dd><dt>来源</dt><dd>${
        present ? source : '尚无来源'
      }</dd><dt>采集窗口</dt><dd>${
        present ? windowText : 'Unknown · 未采集'
      }</dd><dt>覆盖对象</dt><dd>${
        kind === 'runtime' ? '导入、映射、修错的 12 条检查' : '运营 A、运营 B、运营 C'
      }</dd><dt>状态</dt><dd>${
        present && !state.evidenceAligned
          ? tag('旧范围材料 · 不适用', 'warning')
          : present
            ? tag(
                kind === 'use' && !isRepaired() ? '结果未达成' : '证据已具备',
                kind === 'use' && !isRepaired() ? 'warning' : 'neutral'
              )
            : tag('Unknown')
      }</dd></dl>` +
      `<div class="evidence-note"><h3>这份证据说明什么</h3><p>${evidenceDescription(
        kind
      )}</p></div>`
    if (kind === 'runtime' && present) {
      body += `<div class="evidence-note"><h3>运行摘要</h3><div class="snapshot-code">CSV 上传与预览　4 / 4<br>字段映射与提示　4 / 4<br>错误定位与重试　4 / 4<br>运行记录已关联 ${
        isRepaired() ? 'rc.2' : 'rc.1'
      }</div><p>这些检查说明运行路径可用，不说明运营一定能独立完成。</p></div>`
    }
    if (kind === 'distribution' && present) {
      body +=
        '<div class="evidence-note"><h3>交到手的记录</h3><p>运营 A、B、C 均已收到试用入口，访问检查通过。入口在 10 月 9 日的试用窗口内有效。</p><p>分发材料是示例；原型不会发送链接或启动产品。</p></div>'
    }
    if (kind === 'use' && present) {
      body +=
        trials(isRepaired() ? repairedTrials : originalTrials) +
        (isRepaired()
          ? '<div class="evidence-note"><h3>首次失败没有被覆盖</h3><p>rc.1，15:10–15:40：2 / 3 完成。运营 C 在映射步骤卡住。复测使用同一组人，存在熟悉效应。</p></div>'
          : '')
    }
    body += '<p class="caption">按需查看版本、来源和窗口。查看证据不等于确认本次完成。</p>'
    showModal(
      evidenceTitles[kind],
      'v0.3 的独立证据',
      body,
      button('返回', 'close', 'secondary'),
      true
    )
  }
  function editPlan() {
    showModal(
      '确认本次范围',
      '只调整这次承诺，不改变长期方向。',
      `<form id="scope-form"><div class="field"><label for="promise">本次要让用户完成什么</label><textarea id="promise" class="input" required maxlength="120">${esc(
        state.promise
      )}</textarea></div><div class="field"><label for="audience">这次交给谁</label><input id="audience" class="input" required maxlength="40" value="${esc(
        state.audience
      )}"></div><div class="field"><label for="deadline">本次期限</label><input id="deadline" class="input" type="date" required value="${esc(
        state.deadline
      )}"></div><div class="evidence-note" style="margin-top:var(--space-6)"><h3>范围与成功判据</h3>${scopeList()}<p>3 位运营无 Builder 帮助，完成导入并修正一处错误。本提案不扩展判据编辑器。</p></div><p class="caption">确认只确定本次承诺，新的 AI 建议仍需另行取舍。</p><div id="scope-error" class="form-error" role="alert"></div></form>`,
      button('取消', 'close', 'ghost') + button('确认本次范围', 'save-plan', 'primary')
    )
  }
  function decide() {
    showModal(
      '记录未达成与下一步',
      '你的决定会同步到总览和验收，不会自动关闭工作。',
      `<form id="decision-form"><div class="field"><label for="reason">为什么这次还没完成</label><textarea id="reason" class="input" required maxlength="220">${esc(
        state.decision?.reason ||
          (isEmpty()
            ? '还没有对应版本的运行、分发和使用证据，暂时无法判断。'
            : isRepaired()
              ? '复测结果已具备，仍需补充判断依据后再确认。'
              : '运营 C 卡在字段映射，2 / 3 完成，未达到 3 / 3 独立完成的判据。')
      )}</textarea></div><div class="field"><label for="next-step">下一步只做什么</label><textarea id="next-step" class="input" required maxlength="220">${esc(
        state.decision?.next ||
          (isEmpty()
            ? '先确认范围，再准备可运行的试用版本和用户任务观察。'
            : '补清「手机号码」映射提示，保留输入后重试；请同一组 3 位运营复测，不加入自动标签。')
      )}</textarea></div><p class="caption">负责人：林舟。保存这里只记录人的判断；继续执行仍进入原生会话。</p><div id="decision-error" class="form-error" role="alert"></div></form>`,
      button('取消', 'close', 'ghost') + button('记录未达成', 'save-decision', 'primary')
    )
  }
  function complete() {
    if (!completionAllowed()) {
      return announce('尚未满足本次完成条件，请先确认范围与证据是否匹配。')
    }
    showModal(
      '由你确认本次完成',
      'v0.3 · 3 位运营已独立完成本次任务',
      `<p><strong>${esc(
        state.promise
      )}</strong></p><dl class="evidence-facts"><dt>对应版本</dt><dd>v0.3 · rc.2</dd><dt>证据</dt><dd>运行、分发和复测记录对应本次承诺</dd><dt>使用结果</dt><dd>同一组 3 / 3 独立完成，首次 2 / 3 仍保留</dd></dl><p>点击确认后记录为你的结果判断。这只适用于本次任务，不代表持续价值或商业结果已经证实。</p>`,
      button('再看看', 'close', 'ghost') + button('确认完成并回到总览', 'save-complete', 'primary')
    )
  }
  function showDesign() {
    showModal(
      '设计提案 · 示例数据',
      '2026-10-09 · 待讨论，未批准、未实现',
      '<p>这份原型讨论：已有 Orca 的 Builder，如何把一次小版本从代码产出带到真实使用。</p><h3>建议体验顺序</h3><ol><li>总览理解方向、本次承诺和映射阻塞。</li><li>计划里把「自动标签」明确移到以后做。</li><li>记录未达成与下一步，查看原生工作区快照。</li><li>在辅助条切到「修复后」，按需查看证据，再由人确认完成。</li></ol><h3>提案边界</h3><p>项目、人物、日期、读数、记录和原生工作区都是虚构示例；没有后台、联网、真实聊天、远端写入或持久化。刷新会回到当前受阻的初始场景。</p><p>运行与会话继续复用 Orca。这里提出跨屏证据衔接与结果判断的呈现，并不证明现有 BW 已具备这些行为。</p><p>场景切换会载入新的示例状态并清除人的确认。只有显式点击最终确认才产生演示中的完成状态。</p>',
      button('开始体验', 'close', 'primary')
    )
  }
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]')
    if (!target || target.disabled) {
      return
    }
    const action = target.dataset.action
    if (['overview', 'plan', 'acceptance', 'metrics', 'session'].includes(action)) {
      return navigate(action)
    }
    if (action === 'close') {
      return closeModal()
    }
    if (action === 'reset') {
      closeModal()
      state = initial(state.scenario)
      render()
      announce('已恢复这个场景的初始示例，人的确认已清除。')
      return
    }
    if (action === 'design') {
      return showDesign()
    }
    if (action === 'evidence') {
      return showEvidence(target.dataset.kind)
    }
    if (action === 'edit-plan') {
      return editPlan()
    }
    if (action === 'save-plan') {
      const form = $('#scope-form')
      if (!form.reportValidity()) {
        return
      }
      const promise = $('#promise').value.trim(),
        audience = $('#audience').value.trim()
      if (!promise || !audience) {
        $('#scope-error').textContent = '请填写明确的承诺和试用对象。'
        return
      }
      const changed =
        promise !== state.promise ||
        audience !== state.audience ||
        $('#deadline').value !== state.deadline
      state.promise = promise
      state.audience = audience
      state.deadline = $('#deadline').value
      state.scopeConfirmed = true
      state.evidenceAligned =
        promise === initial().promise &&
        audience === initial().audience &&
        state.deadline === initial().deadline
      if (changed) {
        state.done = false
        state.decision = null
      }
      closeModal()
      render()
      announce(
        state.evidenceAligned
          ? state.done
            ? '范围未变化，保留你之前的完成确认。'
            : '本次范围已确认，最终结果仍由你决定。'
          : '范围已变，旧完成结论已失效；需要匹配的新证据。'
      )
      return
    }
    if (action === 'defer') {
      state.deferred = true
      render()
      announce('自动标签已移到以后做，本次仍只有 3 件事。')
      return
    }
    if (action === 'decide') {
      return decide()
    }
    if (action === 'save-decision') {
      if (!$('#decision-form').reportValidity()) {
        return
      }
      const reason = $('#reason').value.trim(),
        next = $('#next-step').value.trim()
      if (!reason || !next) {
        $('#decision-error').textContent = '请同时留下未达成原因和明确的下一步。'
        return
      }
      state.decision = { reason, next }
      state.done = false
      closeModal()
      render()
      announce('已记录你的决定，总览与验收已同步。')
      return
    }
    if (action === 'complete') {
      return complete()
    }
    if (action === 'save-complete') {
      if (!completionAllowed()) {
        return
      }
      state.done = true
      state.decision = null
      closeModal()
      navigate('overview')
      announce('本次完成已由你确认。首次失败与复测证据仍然保留。')
      return
    }
    if (action === 'history') {
      return showModal(
        '首次试用记录',
        '保留历史 · 不被复测覆盖',
        `<dl class="evidence-facts"><dt>版本</dt><dd>v0.3 · rc.1</dd><dt>窗口</dt><dd>2026-10-09 15:10–15:40</dd><dt>来源</dt><dd>任务事件 task-import-009 + 试用观察表</dd><dt>结果</dt><dd>2 / 3 独立完成，运营 C 卡在字段映射</dd></dl>${trials(
          originalTrials
        )}<p class="caption">修复后复测与本次记录并列保留，不能用新结果改写旧窗口。</p>`,
        button('返回', 'close', 'secondary'),
        true
      )
    }
  })
  $('#scenario').addEventListener('change', (event) => {
    state = initial(event.target.value)
    render()
    window.scrollTo(0, 0)
    announce('已切换示例场景；没有替你确认本次完成。')
  })
  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') {
      return
    }
    const focusable = [
      ...modal.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'
      )
    ].filter((element) => element.getClientRects().length > 0)
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  })
  modal.addEventListener('cancel', (event) => {
    event.preventDefault()
    closeModal()
  })
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      const r = modal.getBoundingClientRect()
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      ) {
        closeModal()
      }
    }
  })
  render()
})()
