;(() => {
  const W = window.WallProto
  const { esc, icon, button, state: s } = W
  W.modal = (title, content, mode = '') => {
    W.cancelAdd?.()
    const dialog = W.$('dialog')
    s.dialog = mode
    dialog.innerHTML = `<header class="modal-head"><h2 id="dialog-title">${esc(title)}</h2>${button(
      'close-dialog',
      'x',
      '关闭对话框'
    )}</header><div class="modal-body">${content}</div>`
    if (!dialog.open) {
      dialog.showModal()
    }
  }
  W.closeModal = () => {
    W.cancelAdd?.()
    W.$('dialog').close()
    s.dialog = ''
  }
  W.addChoice = () => {
    W.modal(
      '添加项目',
      `<label for="add-host">项目所在主机</label><select id="add-host" class="input">${Object.entries(
        W.hosts
      )
        .map(
          ([id, h]) =>
            `<option value="${id}" ${s.addHost === id ? 'selected' : ''} ${
              !h.online ? 'disabled' : ''
            }>${h.name}${!h.online ? ' · 离线' : ''}</option>`
        )
        .join('')}</select><div class="action-list">${[
        ['folder', 'folder', '打开已有文件夹', 'Git 仓库或普通文件夹'],
        ['clone', 'globe', '克隆代码仓', '从 Git 地址添加项目'],
        ['create', 'plus', '新建项目', '从空文件夹开始']
      ]
        .map(
          ([mode, glyph, name, description]) =>
            `<button class="add-option" data-action="add-mode" data-id="${mode}" ${
              mode === 'create' && s.addHost === 'ssh' ? 'disabled' : ''
            }>${icon(glyph)}<span><strong>${name}</strong><small>${
              description
            }</small></span>${icon('arrow', 'arrow')}</button>`
        )
        .join(
          ''
        )}</div><div class="modal-foot"><button class="btn btn-ghost" data-action="hosts">连接其他主机</button></div>`,
      'add'
    )
  }
  W.addForm = (mode) => {
    s.addMode = mode
    const parent = s.addHost === 'local' ? 'E:/projects' : '/home/projects'
    const input = (id, label, value, browse = false) =>
      `<div class="field"><label for="${id}">${
        label
      }</label><div class="path-input"><input class="input" id="${id}" value="${esc(value)}" />${
        browse
          ? `<button class="btn btn-secondary" data-action="browse" data-id="${id}">浏览…</button>`
          : ''
      }</div></div>`
    W.modal(
      { folder: '打开已有文件夹', clone: '克隆代码仓', create: '新建项目' }[mode],
      `<div class="source-row" style="padding:0">${W.sourceTags({ hosts: [s.addHost] })}</div>${
        mode === 'folder'
          ? input('add-path', '文件夹', `${parent}/my-project`, true)
          : mode === 'clone'
            ? input('add-url', 'Git 地址', 'https://github.com/example/my-project.git') +
              input('add-parent', '保存到', parent, true)
            : `${
                input('add-name', '项目名称', 'my-project') +
                input('add-parent', '保存到', parent, true)
              }<div class="field"><label for="add-kind">项目类型</label><select class="input" id="add-kind"><option value="git">Git 仓库</option><option value="folder">普通文件夹</option></select></div>`
      }<div id="add-error" class="error-box" role="alert" hidden></div><footer class="modal-foot"><button class="btn btn-ghost" data-action="add">返回</button><button id="confirm-add" class="btn btn-primary" data-action="confirm-add">${
        { folder: '添加项目', clone: '克隆并打开', create: '创建并打开' }[mode]
      }</button></footer>`,
      'add-form'
    )
  }
  W.browse = (field) => {
    s.browseTarget = field
    s.addSnapshot = {}
    document.querySelectorAll('#dialog input, #dialog select').forEach((el) => {
      s.addSnapshot[el.id] = el.value
    })
    const parent = s.addHost === 'local' ? 'E:/projects' : '/home/projects'
    W.modal(
      '选择文件夹',
      `<div class="action-list">${(field === 'add-parent'
        ? [parent, `${parent}/sandbox`]
        : [`${parent}/my-project`, `${parent}/shunfenger`, 'E:/notes']
      )
        .map(
          (path) =>
            `<button class="add-option" data-action="choose-path" data-id="${esc(path)}">${icon(
              'folder'
            )}<span class="mono">${esc(path)}</span></button>`
        )
        .join(
          ''
        )}</div><div class="modal-foot"><button class="btn btn-ghost" data-action="cancel-browse">取消</button></div>`,
      'browse'
    )
  }
  W.hostDialog = () => {
    W.modal(
      '主机管理',
      `<div class="repo-detail">${Object.entries(W.hosts)
        .map(
          ([id, h]) =>
            '<div class="inline-notice">' +
            icon('monitor') +
            '<span>' +
            h.name +
            '</span><span class="grow"></span><span class="muted">' +
            (id === 'local' ? '本机' : h.online ? '在线' : '离线') +
            '</span>' +
            (!h.online
              ? '<button class="btn btn-secondary" data-action="reconnect" data-id="' +
                id +
                '">重新连接</button>'
              : '') +
            '</div>'
        )
        .join(
          ''
        )}</div><div class="field"><label for="pairing-code">主机配对地址</label><input id="pairing-code" class="input" placeholder="粘贴主机分享的配对地址" /></div><div id="pair-error" class="error-box" role="alert" hidden></div>` +
        `<div class="modal-foot"><button class="btn btn-ghost" data-action="import-hosts">导入主机清单</button><button class="btn btn-primary" data-action="pair-host">连接主机</button></div>`,
      'hosts'
    )
  }
  W.offlineDialog = (p) =>
    W.modal(
      '项目所在主机离线',
      `<p>${esc(p.name)} 目前只有「${esc(
        W.hosts[p.hosts[0]].name
      )}」上的副本。</p><p class="muted">项目仍保留在项目墙，恢复连接后可继续打开。</p><div class="modal-foot"><button class="btn btn-ghost" data-action="close-dialog">返回项目墙</button><button class="btn btn-primary" data-action="hosts">管理连接</button></div>`,
      'offline'
    )
  W.reviewInfo = () => {
    const p = W.project(s.config)
    const changes = W.fields.filter(([key]) => s.draft[key].trim() !== (p[key] || '').trim())
    const rows = changes
      .map(
        ([key, label]) =>
          `<tr><td>${label}</td><td class="muted">${esc(p[key] || '未填写')}</td><td>${esc(
            s.draft[key].trim() || '清空'
          )}</td></tr>`
      )
      .join('')
    W.modal(
      '确认项目信息',
      `<table class="review-table"><thead><tr><th>字段</th><th>当前</th><th>修改后</th></tr></thead><tbody>${
        rows
      }</tbody></table>` +
        `<p class="form-hint">${
          p.remote ? '通过 PR 共享；合入并更新后生效。' : '保存到项目所在主机。'
        }</p><div id="info-error" class="error-box" role="alert" hidden></div>` +
        `<div class="modal-foot"><button class="btn btn-ghost" data-action="close-dialog">继续编辑</button><button class="btn btn-primary" data-action="save-info">${
          p.remote ? '提交 PR' : '保存信息'
        }</button></div>`,
      'review-info'
    )
  }
  W.journey = () => {
    const steps = [
      [
        '添加一次，即可工作',
        '从项目墙的加号进入同一添加器，选择本机或主机，再打开文件夹、克隆或新建。成功直接进入工作区，不再填写名片。'
      ],
      [
        '全部项目在同一面墙上',
        '原生已登记的个人仓库、普通文件夹和已配对主机项目自动出现。按原有身份归并，多主机副本仍是一张卡。'
      ],
      [
        '看承诺，找到要跟进的项目',
        '有版本就展示本版承诺、约定验收日期和计划/开发/验收三项事实，点开查看依据。没有版本则保留轻量工作读数，不强迫个人项目进入版本管理。'
      ],
      [
        '需要时再补充信息',
        '设置里编辑名称、简介、对标和目标方向；先对比再保存。有远端仍经 PR 共享，未填写不妨碍使用。'
      ]
    ]
    W.modal(
      '旅程与信息取舍',
      `<span class="design-badge">候选设计 · 等待评审</span>${steps
        .map(
          ([name, detail], i) =>
            '<div class="journey-step"><span class="step-number">' +
            (i + 1) +
            '</span><div><strong>' +
            name +
            '</strong><p>' +
            detail +
            '</p></div></div>'
        )
        .join('')}<h3>项目墙呈现什么</h3><table class="review-table"><tbody>${[
        ['名称与来源', '项目名称、本机/主机与连接事实；没有人员事实就不编负责人。'],
        ['本版承诺', '承诺内容、版本身份、约定验收日期。版本沿项目命名，不按自然周自动换号。'],
        [
          '计划 / 开发 / 验收',
          '分别显示计划 PR、同版实现 PR、同版同承诺的人工验收。握手和归档在详情分开核对，合入不等于验收通过。'
        ],
        [
          '没有版本的项目',
          '已有简介与运行会话、待审 PR；普通文件夹不展示 Git 专属项。没有名片也可直接工作。'
        ],
        [
          '详细读数与证据',
          '有版本卡片不再堆叠任务数、会话数和全仓 PR；这些读数连同证据移入交付详情。缺失、陈旧、跨版依据一律如实未知。'
        ],
        ['搜索与筛选', '本机与远程按副本位置筛选；不创建个人/团队权限分类。']
      ]
        .map(([a, b]) => '<tr><th>' + a + '</th><td>' + b + '</td></tr>')
        .join(
          ''
        )}</tbody></table><h3>与 PR #523 的衔接</h3><p class="muted">保留 64px 导航栏、全局已固定、版本及原生工作区。此次候选把全部项目切换收进项目墙，项目侧栏仅展示当前项目工作区；这是后续设计增量，不表示 #523 已合入或需要改动你正在验证的分支。</p>` +
        `<p class="muted">所有输入、添加、主机连接及 PR 状态仅在页面内模拟，刷新重置。原型确认后，再逐项讨论存储、默认落点和保存等界面未充分表达的业务规则，随后实施。</p>` +
        `<div class="modal-foot"><button class="btn btn-primary" data-action="close-dialog">开始体验</button></div>`,
      'journey'
    )
  }
  W.deliveryDetail = (id) => {
    const p = W.project(id),
      d = p.delivery
    s.deliveryId = id
    const facts = [
      ['版本', p.version],
      ['本版承诺', d.promise],
      ['约定验收', d.date],
      ['计划握手', d.handshake],
      ['计划归档', d.pr],
      ['同版开发', d.devPr],
      ['人工验收', d.verdict || '未读到本版同承诺的人工验收记录'],
      ['承诺任务', p.done == null || p.open == null ? '未知' : `完成 ${p.done} · 开放 ${p.open}`],
      ['运行中会话', p.sessions ?? '未知'],
      ['全仓待审 PR', p.prs ?? '未知']
    ]
    W.modal(
      `${p.name} · 交付依据`,
      `<table class="review-table"><tbody>${facts
        .map(([a, b]) => '<tr><th>' + a + '</th><td>' + esc(b) + '</td></tr>')
        .join('')}</tbody></table><p class="form-hint">${esc(d.note)}</p>${
        d.proposal
          ? '<div class="inline-notice">拟议验收日期：' +
            esc(d.proposal) +
            '，未改变约定日期或验收结论。</div>'
          : ''
      }<details><summary>拟议验收安排</summary><div class="field"><label for="proposed-date">拟议日期</label><input class="input" id="proposed-date" type="date" value="${esc(
        d.proposal || d.date
      )}" /></div><p class="form-hint">仅记录本次讨论草稿。正式日期仍以计划确认为准。</p><button class="btn btn-secondary" data-action="propose-date">保存讨论草稿</button></details>` +
        `<div class="modal-foot"><button class="btn btn-ghost" data-action="handoff" data-id="版本计划">打开版本计划</button><button class="btn btn-secondary" data-action="handoff" data-id="版本验收">打开版本验收</button></div>`,
      'delivery'
    )
  }
})()
