function play(target: Element, frames: Keyframe[], duration = 260, delay = 0): Animation {
  return target.animate(frames, { duration, delay, easing: 'ease-out', fill: 'none' })
}

function move(target: Element, translate: string, delay = 0): Animation {
  return play(
    target,
    [{ translate: '0px' }, { translate, offset: 0.38 }, { translate: '0px' }],
    230,
    delay
  )
}

function turn(target: Element, degrees: number, pivot?: string): Animation {
  const rotation = Math.abs(degrees) === 360 ? [0, degrees] : [0, degrees, -degrees / 2, 0]
  return play(
    target,
    rotation.map((angle) => ({
      rotate: `${angle}deg`,
      transformOrigin: pivot ?? 'center',
      transformBox: pivot ? 'view-box' : 'fill-box',
      composite: 'add'
    })),
    rotation.length === 2 ? 340 : 300
  )
}

function pulse(target: Element, scale: string, delay = 0): Animation {
  return play(
    target,
    ['1', scale, '1'].map((value) => ({
      scale: value,
      transformOrigin: 'center',
      transformBox: 'fill-box',
      composite: 'add'
    })),
    240,
    delay
  )
}

function draw(stroke: Element): Animation {
  if (!(stroke instanceof SVGGeometryElement)) {
    return pulse(stroke, '1.12')
  }
  const length = stroke.getTotalLength()
  return play(
    stroke,
    [
      { strokeDasharray: `${length}`, strokeDashoffset: 0 },
      { strokeDasharray: `${length}`, strokeDashoffset: length, offset: 0.22 },
      { strokeDasharray: `${length}`, strokeDashoffset: 0 }
    ],
    310
  )
}

export function animateActionIcon(icon: Element): Animation[] {
  const name =
    Array.from(icon.classList)
      .findLast((className) => className.startsWith('lucide-'))
      ?.slice('lucide-'.length) ?? ''
  const parts = Array.from(icon.children)

  switch (name) {
    case 'refresh-cw':
    case 'rotate-cw':
      return [turn(icon, 360)]
    case 'refresh-ccw':
    case 'rotate-ccw':
    case 'undo':
    case 'undo-2':
      return [turn(icon, -360)]
    case 'settings':
    case 'life-buoy':
      return [turn(icon, 30)]
    case 'bell':
    case 'bell-ring':
    case 'circle-help':
    case 'circle-question-mark':
    case 'message-circle-question-mark':
      return [turn(icon, 13)]
    case 'copy':
    case 'copy-plus':
    case 'clipboard-copy':
    case 'files':
      return [move(parts[0] ?? icon, '1.5px 1px'), move(parts[1] ?? icon, '-1px -1px', 40)]
    case 'arrow-right':
    case 'chevron-right':
    case 'log-out':
    case 'panel-left-open':
      return [move(icon, '2px 0px')]
    case 'arrow-left':
    case 'chevron-left':
    case 'corner-down-left':
    case 'panel-left-close':
      return [move(icon, '-2px 0px')]
    case 'arrow-up':
    case 'arrow-up-to-line':
    case 'chevron-up':
      return [move(icon, '0px -2px')]
    case 'upload':
      return parts.slice(0, 2).map((part) => move(part, '0px -1.5px'))
    case 'arrow-down':
    case 'arrow-down-to-line':
    case 'chevron-down':
      return [move(icon, '0px 2px')]
    case 'download':
      return [parts[0], parts[2]]
        .filter((part) => part !== undefined)
        .map((part) => move(part, '0px 1.5px'))
    case 'arrow-up-right':
      return [move(icon, '1.5px -1.5px')]
    case 'external-link':
      return parts.slice(0, 2).map((part) => move(part, '1.5px -1.5px'))
    case 'file-input':
      return parts.slice(-2).map((part) => move(part, '1.5px 0px'))
    case 'layout-grid':
    case 'layout-dashboard':
    case 'panels-top-left':
    case 'grid-2x2':
      return parts.map((part, index) => pulse(part, '0.7', index * 32))
    case 'list':
    case 'list-filter':
    case 'list-todo':
    case 'menu':
    case 'settings-2':
    case 'sliders-horizontal':
      return parts.slice(0, 6).map((part, index) => move(part, '1.5px 0px', index * 24))
    case 'ellipsis':
    case 'ellipsis-vertical':
    case 'more-horizontal':
    case 'more-vertical':
      return parts.map((part, index) => move(part, '0px -1.4px', index * 36))
    case 'check':
    case 'check-check':
    case 'circle-check':
    case 'circle-check-big':
    case 'badge-check':
    case 'package-check':
    case 'plus':
    case 'x':
      return parts.map((part, index) =>
        part.matches('circle, rect') ? pulse(part, '0.92', index * 28) : draw(part)
      )
    case 'sparkles':
    case 'wand-sparkles':
    case 'zap':
      return parts.map((part, index) => pulse(part, '1.18', index * 40))
    case 'globe':
      return [pulse(parts[1] ?? icon, '0.3 1')]
    case 'users':
    case 'users-round':
      return parts
        .slice(0, 4)
        .map((part, index) => move(part, index % 2 === 0 ? '0.8px 0px' : '-0.8px 0px', index * 20))
    case 'book-open':
    case 'book-open-text':
      return [pulse(parts[1] ?? icon, '0.76 1')]
    case 'calendar-clock':
      return [turn(parts[0] ?? icon, 28, '16px 16px')]
    case 'clock':
      return [turn(parts[1] ?? icon, 28, '12px 12px')]
    case 'compass':
      return [turn(parts[1] ?? icon, 45, '12px 12px')]
    case 'search':
      return [move(icon, '-1.25px -1px'), pulse(parts[0] ?? icon, '1.16')]
    case 'trash':
    case 'trash-2':
      return [move(parts[0] ?? icon, '0px -1.5px')]
    case 'folder':
    case 'folder-open':
    case 'folder-plus':
      return [pulse(parts.at(-1) ?? icon, '1 0.82')]
    case 'plug':
    case 'plug-zap':
      return [move(icon, '0px -1.5px')]
    case 'share-2':
    case 'network':
    case 'git-branch':
    case 'git-pull-request':
    case 'git-merge':
      return parts.slice(0, 6).map((part, index) => pulse(part, '1.16', index * 22))
    default:
      return [pulse(icon, '0.84')]
  }
}
