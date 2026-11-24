// Injected by the share viewer at the end of /s/:id/content. Runs inside the opaque sandbox with
// the (untrusted) shared document; it only ever talks to its parent via postMessage and only
// reacts to messages whose source is window.parent. Keep it dependency-free and defensive: an
// error here must degrade element picking, never break the shared page itself.
;(function () {
  'use strict'

  var READY_TYPE = 'bw-anno-ready'
  var parent = window.parent
  if (parent === window) {
    return // Loaded as a top document (e.g. someone fetched /content directly); nothing to bridge.
  }

  var HIGHLIGHT_CLASS = 'bw-anno-highlight'
  var HOVER_CLASS = 'bw-anno-hover'
  var selecting = false
  var hovered = null
  var highlighted = null

  function post(message) {
    try {
      parent.postMessage(message, '*')
    } catch {
      // The parent went away (tab closed mid-selection); dropping the message is fine.
    }
  }

  function injectStyles() {
    if (document.getElementById('bw-anno-styles')) {
      return
    }
    var style = document.createElement('style')
    style.id = 'bw-anno-styles'
    style.textContent =
      `.${HIGHLIGHT_CLASS} { outline: 2px solid #f59e0b; outline-offset: 2px; box-shadow: 0 0 0 6px rgba(245,158,11,.25); }` +
      `.${HOVER_CLASS} { outline: 2px dashed #f59e0b; outline-offset: 2px; cursor: pointer !important; }`
    var mount = document.head || document.documentElement
    if (mount) {
      mount.appendChild(style)
    }
  }

  function clearHover() {
    if (hovered) {
      hovered.classList.remove(HOVER_CLASS)
      hovered = null
    }
  }

  function clearHighlight() {
    if (highlighted) {
      highlighted.classList.remove(HIGHLIGHT_CLASS)
      highlighted = null
    }
  }

  function selectorFor(el) {
    try {
      if (el.id) {
        return `#${CSS.escape(el.id)}`
      }
      var parts = []
      var cur = el
      while (cur && cur !== document.body && cur !== document.documentElement) {
        var parentElement = cur.parentElement
        if (!parentElement) {
          break
        }
        var sameTag = Array.prototype.filter.call(parentElement.children, function (child) {
          return child.tagName === cur.tagName
        })
        var tag = cur.tagName.toLowerCase()
        parts.unshift(
          sameTag.length === 1 ? tag : `${tag}:nth-of-type(${sameTag.indexOf(cur) + 1})`
        )
        cur = parentElement
      }
      return parts.length ? `body > ${parts.join(' > ')}` : 'body'
    } catch {
      return 'body'
    }
  }

  function textFor(el) {
    var text = (el.textContent || '').trim().replace(/\s+/g, ' ')
    if (!text && el.getAttribute) {
      // No visible text (icon button, image, svg, input): fall back to an accessible label, then
      // the tag name, so the summary stays meaningful when the selector later goes stale.
      var label =
        el.getAttribute('aria-label') ||
        el.getAttribute('alt') ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder') ||
        ''
      text = label.trim().replace(/\s+/g, ' ')
      if (!text && el.tagName) {
        text = el.tagName.toLowerCase()
      }
    }
    return text.slice(0, 200)
  }

  function onSelectionClick(event) {
    if (!selecting) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    var el = event.target
    clearHover()
    stopSelecting()
    post({
      type: 'bw-anno-select',
      selector: selectorFor(el),
      text: textFor(el),
      rect: {
        x: Math.round(el.getBoundingClientRect().left),
        y: Math.round(el.getBoundingClientRect().top),
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height)
      }
    })
  }

  function onSelectionOver(event) {
    if (!selecting) {
      return
    }
    event.preventDefault()
    clearHover()
    hovered = /** @type {Element} */ (event.target)
    if (hovered && hovered.classList) {
      hovered.classList.add(HOVER_CLASS)
    }
  }

  function onKeyDown(event) {
    if (selecting && event.key === 'Escape') {
      event.preventDefault()
      stopSelecting()
      post({ type: 'bw-anno-cancel' })
    }
  }

  function startSelecting() {
    selecting = true
    injectStyles()
    document.addEventListener('click', onSelectionClick, true)
    document.addEventListener('mouseover', onSelectionOver, true)
  }

  function stopSelecting() {
    selecting = false
    document.removeEventListener('click', onSelectionClick, true)
    document.removeEventListener('mouseover', onSelectionOver, true)
    clearHover()
  }

  function highlight(selector) {
    clearHighlight()
    var el = null
    try {
      el = selector ? document.querySelector(selector) : null
    } catch {
      el = null // Invalid selector (content changed shape); report as stale.
    }
    if (el) {
      injectStyles()
      el.classList.add(HIGHLIGHT_CLASS)
      highlighted = el
      try {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
      } catch {
        // scrollIntoView with options is not universal; the highlight alone still shows it.
      }
    }
    return Boolean(el)
  }

  window.addEventListener('message', function (event) {
    if (event.source !== parent) {
      return
    }
    var data = event.data
    if (!data || typeof data !== 'object') {
      return
    }
    switch (data.type) {
      case 'bw-anno-start-select':
        startSelecting()
        break
      case 'bw-anno-stop-select':
        stopSelecting()
        break
      case 'bw-anno-highlight': {
        var found = highlight(data.selector)
        post({ type: 'bw-anno-highlight-result', id: data.id, selector: data.selector, found: found })
        break
      }
      case 'bw-anno-probe': {
        // Existence check without highlighting or scrolling, so the viewer can mark stale
        // targets as soon as the list loads instead of waiting for a click.
        var entries = Array.isArray(data.selectors) ? data.selectors : []
        var results = entries.map(function (entry) {
          var exists = false
          try {
            exists = Boolean(entry && entry.selector && document.querySelector(entry.selector))
          } catch {
            exists = false
          }
          return { id: entry && entry.id, found: exists }
        })
        post({ type: 'bw-anno-probe-result', results: results })
        break
      }
      case 'bw-anno-clear':
        clearHighlight()
        break
      default:
        break
    }
  })

  document.addEventListener('keydown', onKeyDown, true)

  post({ type: READY_TYPE })
})()
