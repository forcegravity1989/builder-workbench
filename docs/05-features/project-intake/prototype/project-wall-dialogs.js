;(() => {
  const W = window.WallProto
  const { state: s, esc } = W
  let returnFocus
  W.modal = (title, body) => {
    W.closeInfoReview()
    const dialog = W.$('dialog')
    returnFocus = document.activeElement
    dialog.innerHTML = `<header class="modal-head"><h2 id="dialog-title">${esc(title)}</h2>${W.button('close-dialog', 'x', '关闭对话框')}</header><div class="modal-body">${body}</div>`
    if (!dialog.open) {
      dialog.showModal()
    }
  }
  W.closeModal = () => {
    W.closeInfoReview()
    W.$('dialog').close()
    if (returnFocus?.isConnected) {
      returnFocus.focus()
    }
  }
  W.closeInfoReview = () => {
    const review = W.$('info-confirm')
    if (review.matches(':popover-open')) {
      review.hidePopover()
    }
  }
  W.reviewInfo = () => {
    if (!W.dirty() || !s.draft.name.trim()) {
      W.$('field-name')?.focus()
      return false
    }
    const p = W.project(s.config)
    const changes = W.fields.filter(([key]) => s.draft[key].trim() !== (p[key] || '').trim())
    const review = W.$('info-confirm')
    returnFocus = document.activeElement
    review.innerHTML = `<strong>本次改动</strong><ul class="info-change-list">${changes.map(([key, label]) => `<li><span>${label}</span><del>${esc(p[key]?.trim() || '—')}</del><span>→ ${esc(s.draft[key].trim() || '—')}</span></li>`).join('')}</ul><p class="save-hint">${p.remote ? '提交评审，合入并更新后生效。' : '保存到项目所在主机。'}</p><footer class="review-actions"><button class="btn btn-ghost" data-action="close-dialog">继续编辑</button><button class="btn btn-primary" data-action="save-info">${p.remote ? '确认提交' : '确认保存'}</button></footer><small class="prototype-caption">原型注释：沿用里程碑的简短确认交互，调用现有项目信息提交流程。</small>`
    review.showPopover()
    return true
  }
})()
