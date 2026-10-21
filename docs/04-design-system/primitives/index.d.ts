// Props of the Orca primitives in src/renderer/src/components/ui/ (documentation only).
// Each also accepts its underlying element's or Radix primitive's props and `className`.
import type * as React from 'react'

export type ButtonProps = {
  /** default: the single affirmative action · destructive: irreversible, never Cancel */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  /** default 36px · xs 24 · sm 32 · lg 40 · icon 36 · icon-xs 24 · icon-sm 32 · icon-lg 40 */
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'
  asChild?: boolean
} & React.ComponentProps<'button'>
export declare const Button: React.ForwardRefExoticComponent<ButtonProps>

export type BadgeProps = {
  variant?: 'default' | 'secondary' | 'dot' | 'destructive' | 'outline' | 'ghost' | 'link'
  asChild?: boolean
} & React.ComponentProps<'span'>
export declare function Badge(props: BadgeProps): React.JSX.Element

export type ShortcutKeyComboProps = {
  /** Platform-specific labels chosen by the caller: ['⌘','⇧','N'] on Mac, ['Ctrl','Shift','N'] elsewhere */
  keys: string[]
  className?: string
  separatorClassName?: string
  /** Re-tint caps on a non-default surface */
  keyCapClassName?: string
  /** Same key twice, no separator */
  doubleTap?: boolean
}
export declare function ShortcutKeyCombo(props: ShortcutKeyComboProps): React.JSX.Element

export type InputProps = React.ComponentProps<'input'>
export declare const Input: React.ForwardRefExoticComponent<InputProps>
export type TextareaProps = React.ComponentProps<'textarea'>
export declare const Textarea: React.ForwardRefExoticComponent<TextareaProps>
export type LabelProps = React.ComponentProps<'label'>
export declare function Label(props: LabelProps): React.JSX.Element

export type CheckboxProps = {
  checked?: boolean | 'indeterminate'
  onCheckedChange?: (checked: boolean | 'indeterminate') => void
} & Omit<React.ComponentProps<'button'>, 'onChange'>
export declare function Checkbox(props: CheckboxProps): React.JSX.Element

export type SwitchProps = {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  thumbClassName?: string
} & Omit<React.ComponentProps<'button'>, 'onChange'>
export declare function Switch(props: SwitchProps): React.JSX.Element
export type SwitchIndicatorProps = {
  checked: boolean
  size?: 'default' | 'compact'
  thumbClassName?: string
} & Omit<React.ComponentProps<'span'>, 'children'>
export declare function SwitchIndicator(props: SwitchIndicatorProps): React.JSX.Element

export type SelectProps = {
  value?: string
  onValueChange?: (value: string) => void
  children?: React.ReactNode
}
export declare function Select(props: SelectProps): React.JSX.Element
export type SelectTriggerProps = {
  size?: 'default' | 'sm'
} & React.ComponentProps<'button'>
export declare function SelectTrigger(props: SelectTriggerProps): React.JSX.Element
export type SelectContentProps = {
  position?: 'item-aligned' | 'popper'
  align?: 'start' | 'center' | 'end'
  portalContainer?: HTMLElement | null
} & React.ComponentProps<'div'>
export declare function SelectContent(props: SelectContentProps): React.JSX.Element
export type SelectItemProps = {
  value: string
} & React.ComponentProps<'div'>
export declare function SelectItem(props: SelectItemProps): React.JSX.Element

export type TabsProps = {
  value?: string
  onValueChange?: (value: string) => void
  orientation?: 'horizontal' | 'vertical'
} & React.ComponentProps<'div'>
export declare function Tabs(props: TabsProps): React.JSX.Element
export type TabsListProps = {
  variant?: 'default' | 'line'
} & React.ComponentProps<'div'>
export declare function TabsList(props: TabsListProps): React.JSX.Element
export type TabsTriggerProps = {
  value: string
} & React.ComponentProps<'button'>
export declare function TabsTrigger(props: TabsTriggerProps): React.JSX.Element

export type CommandDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
  description?: string
  shouldFilter?: boolean
  contentClassName?: string
  children?: React.ReactNode
}
export declare function CommandDialog(props: CommandDialogProps): React.JSX.Element
export type CommandInputProps = {
  wrapperClassName?: string
  iconClassName?: string
  /** Rendered after the field, inside the input frame (e.g. a filter control) */
  trailing?: React.ReactNode
} & React.ComponentProps<'input'>
export declare function CommandInput(props: CommandInputProps): React.JSX.Element

export type CardProps = React.ComponentProps<'div'>
export declare function Card(props: CardProps): React.JSX.Element

export type DialogContentProps = {
  overlayClassName?: string
  /** default true */
  showCloseButton?: boolean
} & React.ComponentProps<'div'>
export declare function DialogContent(props: DialogContentProps): React.JSX.Element

export type DropdownMenuItemProps = {
  inset?: boolean
  variant?: 'default' | 'destructive'
} & React.ComponentProps<'div'>
export declare function DropdownMenuItem(props: DropdownMenuItemProps): React.JSX.Element

export type TooltipContentProps = {
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Primitive default 0; the toolbar convention passes 4 */
  sideOffset?: number
  /** default true */
  showArrow?: boolean
} & React.ComponentProps<'div'>
export declare function TooltipContent(props: TooltipContentProps): React.JSX.Element
