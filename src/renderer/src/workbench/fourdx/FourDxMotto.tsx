// 高效执行四原则（4DX）品牌铭文：项目墙与版本验收头下的一行产品格言。
// 纯排版、无状态——它是方法论表述，不是健康信号，不参与铁律二的推导。
import type { JSX } from 'react'
import './fourdx.css'

const MOTTO = '高效执行四原则 · 聚焦最重要目标 · 关注引领性指标 · 建立醒目记分表 · 落实节奏问责制'

/** head=true 用于验收屏头部的全宽铭文条；默认为项目墙页头下的左对齐小字。 */
export function FourDxMotto({ head = false }: { head?: boolean }): JSX.Element {
  return (
    <p className={head ? 'fourdx-motto fourdx-motto-head' : 'fourdx-motto'} data-fourdx="motto">
      {MOTTO}
    </p>
  )
}
