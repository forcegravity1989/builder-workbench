import { isWorkbenchProduct } from '../../startup/workbench-product'

/**
 * Why (#500): 版本置顶复用原生「已固定」栏目，BW 要求固定后原件仍留在原分组与版本区，
 * 即原生 duplicate-in-groups 策略。共享默认仍是 single-location，只在本产品缺省为 true；
 * 用户显式关闭（存了 false）在载入时原样保留。
 */
export function workbenchShowPinnedWorktreesInGroupsDefault(): boolean | undefined {
  return isWorkbenchProduct() ? true : undefined
}
