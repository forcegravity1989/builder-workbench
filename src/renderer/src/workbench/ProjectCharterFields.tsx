import { CHARTER_LABELS, type ProjectCharter } from './project-charter'
import { EDITABLE_CHARTER_FIELDS } from '../../../shared/workbench/project-charter-edit'

export function ProjectCharterFields({
  value,
  onEdit,
  disabled,
  idPrefix = 'config'
}: {
  value: ProjectCharter
  onEdit(field: (typeof EDITABLE_CHARTER_FIELDS)[number], value: string): void
  disabled?: boolean
  idPrefix?: string
}) {
  return (
    <div className="wb-config-fields">
      {EDITABLE_CHARTER_FIELDS.map((field) => (
        <label key={field} htmlFor={`${idPrefix}-${field}`}>
          <span>
            {CHARTER_LABELS[field]}
            {field === 'name' ? ' *' : ''}
          </span>
          {field === 'brief' || field === 'opportunity' ? (
            <textarea
              id={`${idPrefix}-${field}`}
              value={value[field] ?? ''}
              onChange={(event) => onEdit(field, event.target.value)}
              disabled={disabled}
            />
          ) : (
            <input
              id={`${idPrefix}-${field}`}
              value={value[field] ?? ''}
              onChange={(event) => onEdit(field, event.target.value)}
              required={field === 'name'}
              placeholder={field === 'groupId' ? '项目群号' : undefined}
              aria-invalid={field === 'name' && !value.name.trim()}
              disabled={disabled}
            />
          )}
        </label>
      ))}
    </div>
  )
}
