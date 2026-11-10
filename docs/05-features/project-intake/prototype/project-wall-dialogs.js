;(() => {
  const W = window.WallProto
  const { state: s, esc } = W
  let returnFocus
  W.modal = (title, body) => {
    const dialog = W.$('dialog')
    returnFocus = document.activeElement
    dialog.innerHTML = `<header class="modal-head"><h2 id="dialog-title">${esc(title)}</h2>${W.button('close-dialog', 'x', '关闭对话框')}</header><div class="modal-body">${body}</div>`
    if (!dialog.open) {
      dialog.showModal()
    }
  }
  W.closeModal = () => {
    W.$('dialog').close()
    if (returnFocus?.isConnected) {
      returnFocus.focus()
    }
  }
  W.reviewInfo = () => {
    const p = W.project(s.config)
    const changes = W.fields.filter(([key]) => s.draft[key].trim() !== (p[key] || '').trim())
    W.modal(
      '确认项目信息',
      `${W.annotation('复用 BW 现有差异确认和提交流程；此处只模拟本次字段变更。')}<div class="wb-config-diff">${changes.map(([key, label]) => `<section><h3>${label}</h3><dl><div><dt>当前</dt><dd>${esc(p[key] || '—')}</dd></div><div><dt>修改</dt><dd>${esc(s.draft[key].trim() || '—')}</dd></div></dl></section>`).join('')}</div><p class="save-hint">${p.remote ? '通过现有 PR 流程共享，合入并更新后生效。' : '保存到本机，未共享。'}</p><p id="info-error" class="wb-config-error" role="alert" hidden></p><footer class="modal-foot"><button class="btn btn-secondary" data-action="close-dialog">继续编辑</button><button class="btn btn-primary" data-action="save-info">${p.remote ? '提交 PR' : '保存到本机'}</button></footer>`
    )
  }
})()
