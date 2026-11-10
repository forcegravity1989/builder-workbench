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
          ? `${input(
              'add-path',
              '文件夹',
              `${parent}/my-project`,
              s.addHost === 'local'
            )}<button class="inline-link" data-action="scan-repos">查找目录中的多个代码仓</button>`
          : mode === 'clone'
            ? `<button class="btn btn-secondary" data-action="account-repos">从已登录账号选择仓库</button>${input(
                'add-url',
                'Git 地址',
                'https://github.com/example/my-project.git'
              )}${input('add-parent', '保存到', parent, s.addHost === 'local')}`
            : `${
                input('add-name', '项目名称', 'my-project') +
                input('add-parent', '保存到', parent, s.addHost === 'local')
              }<div class="field"><label for="add-kind">项目类型</label><select class="input" id="add-kind"><option value="git">Git 仓库</option><option value="folder">普通文件夹</option></select></div>`
      }<p class="form-hint">添加后即可工作，默认个人；项目信息以后按需补充。</p><div id="add-error" class="error-box" role="alert" hidden></div><footer class="modal-foot"><button class="btn btn-ghost" data-action="add">返回</button><button id="confirm-add" class="btn btn-primary" data-action="confirm-add">${
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
        `<div class="modal-foot"><button class="btn btn-ghost" data-action="refresh-hosts">刷新共享清单</button><button class="btn btn-ghost" data-action="import-hosts">导入主机清单</button><button class="btn btn-primary" data-action="pair-host">连接主机</button></div>`,
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
        '本机原生已登记项目自动上墙，未设置的按个人展示，不猜测或批量改写存量配置。其他客户端只看到所属主机主动标记为团队的入口；已打开工作区不收回。多主机副本沿原有身份归并。'
      ],
      [
        '看承诺，找到要跟进的项目',
        '有版本就展示本版承诺、约定验收日期和计划/开发/验收三项事实，点开查看依据。没有版本则保留轻量工作读数，不强迫个人项目进入版本管理。'
      ],
      [
        '需要时再补充信息',
        '所有视图打开同一个项目设置。个人／团队立即保存本机；名称、简介、对标、目标方向和主要 Builder 集中编辑，沿 project 分支经 PR 共享。未填写不妨碍工作。'
      ]
    ]
    W.modal(
      '旅程与信息取舍',
      `<span class="design-badge">方向已对齐 · 可点制品待批注</span>${steps
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
        [
          '三种视图',
          '项目墙默认打开；版本节奏与 Builder 交付共用事实及筛选。人员为明确主责，主机持有人不是自动负责人。'
        ],
        [
          '搜索与筛选',
          '个人／团队是所属主机的本地展示属性；本机／远程是副本位置。只过滤界面入口，不建立权限模型。'
        ],
        ['四原则', '项目墙与验收页只保留一行提示文字。仪表延后，不新增灯色或统计。']
      ]
        .map(([a, b]) => '<tr><th>' + a + '</th><td>' + b + '</td></tr>')
        .join(
          ''
        )}</tbody></table><h3>与已合入侧栏衔接</h3><p class="muted">基于 main daae7e18eb，已包含 #523、#597、#599。保留全局已固定、当前版本、其他工作区；无版本时叫工作区。Workspace Options 取消跨项目筛选，其余适用选项沿原生。项目名打开恢复原有工作，项目总览单独进入。</p>` +
        `<p class="muted">所有输入、添加、连接及 PR 都是内存模拟，刷新重置。原生 UI 的交接点有明确说明；可点原型并不证明 Electron、真实账户、双主机或磁盘保存已验证。</p>` +
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
      }<p class="form-hint">日期变更回到版本计划维护；此处只展示依据，不另设编辑表单。</p>` +
        `<div class="modal-foot"><button class="btn btn-ghost" data-action="handoff" data-id="版本计划">打开版本计划</button><button class="btn btn-secondary" data-action="handoff" data-id="版本验收">打开版本验收</button></div>`,
      'delivery'
    )
  }
  W.overview = (id) => {
    const p = W.project(id)
    W.modal(
      `${p.name} · 项目总览`,
      `<p>${esc(p.brief || '尚未填写简介')}</p><table class="review-table"><tbody>${[
        ['主要 Builder', p.builder || '未填写'],
        ['对标', p.benchmark || '未填写'],
        ['目标方向', p.opportunity || '未填写']
      ]
        .map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`)
        .join(
          ''
        )}</tbody></table><p class="form-hint">共享信息在同一个项目设置中维护。其余总览内容沿已有页面。</p><div class="modal-foot"><button class="btn btn-secondary" data-action="config" data-id="${id}">项目设置</button><button class="btn btn-primary" data-action="open" data-id="${id}">继续工作</button></div>`,
      'overview'
    )
  }
  W.workspaceOptions = () =>
    W.modal(
      'Workspace options',
      `<div class="field"><label for="workspace-sort">Sort by · 工作区排序</label><select id="workspace-sort" class="input"><option value="native" ${s.sort === 'native' ? 'selected' : ''}>最近活动（原生默认）</option><option value="name" ${s.sort === 'name' ? 'selected' : ''}>名称</option></select></div><div class="field"><label>Hosts · 主机</label><div class="source-row">${W.sourceTags(W.project(s.active))}</div></div><p class="form-hint">保留原生主机、排序、工作区状态等适用控件；BW 侧栏仅展示当前项目，全局已固定仍跨项目。</p><div class="modal-foot"><button class="btn btn-primary" data-action="apply-workspace-options">完成</button></div>`,
      'workspace-options'
    )
  W.accountRepos = () =>
    W.modal(
      '选择账号仓库',
      `<p class="form-hint">使用已登录的 GitHub／CodeHub 账号。当前列表是原型样本。</p><div class="action-list">${[
        ['GitHub', 'https://github.com/example/new-app.git'],
        ['CodeHub', 'https://codehub.example.com/team/service.git']
      ]
        .map(
          ([provider, url]) =>
            `<button class="add-option" data-action="select-account-repo" data-id="${url}">${icon('git')}<span>${provider}<small>${url}</small></span></button>`
        )
        .join(
          ''
        )}</div><p class="form-hint">未登录、无权限或读取失败时保留原因，仍可手填 Git 地址。</p><div class="modal-foot"><button class="btn btn-secondary" data-action="add-mode" data-id="clone">手填 Git 地址</button></div>`,
      'account-repos'
    )
  W.scanRepos = () =>
    W.modal(
      '选择目录中的代码仓',
      `<p class="form-hint">复用原生目录扫描与多选。${s.addToProject ? '所选仓库加入当前项目。' : '这里演示分别添加两个仓库，原生分组模式沿既有界面。'}</p><div class="scan-list"><label><input type="checkbox" name="scan-repo" value="frontend" checked /> frontend</label><label><input type="checkbox" name="scan-repo" value="backend" checked /> backend</label></div><div class="modal-foot"><button class="btn btn-secondary" data-action="add-mode" data-id="folder">返回</button><button class="btn btn-primary" data-action="confirm-scan">添加所选仓库</button></div>`,
      'scan'
    )
})()
