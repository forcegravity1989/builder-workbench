import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ProjectSourceTag({ tag }: { tag: { label: string; online: boolean | null } }) {
  const status = tag.online === null ? '连接状态未知' : tag.online ? '在线' : '离线'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="pcard-source" tabIndex={0} aria-label={`${tag.label}，${status}`}>
          <span
            className={`pcard-source-dot${tag.online === true ? ' is-online' : tag.online === false ? ' is-offline' : ''}`}
            aria-hidden="true"
          />
          {tag.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {tag.label} · {status}
      </TooltipContent>
    </Tooltip>
  )
}
