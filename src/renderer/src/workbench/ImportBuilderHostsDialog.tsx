import { ErrorDetails, notifyWorkbenchError } from './error-feedback'
import { remoteServerPairingFailureMessage } from '@/lib/remote-server-pairing-error-copy'
import React, { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translateRemotePairingFailureDescription } from '@/lib/remote-pairing-copy'
import {
  BUILDER_HOSTS_TEMPLATE_FILENAME,
  builderHostsTemplate,
  parseBuilderHostsFile,
  planBuilderHostImports,
  type ParsedBuilderHost
} from './builder-hosts-import'

type HostImportResult =
  | { kind: 'pending' }
  | { kind: 'importing' }
  | { kind: 'added' }
  | { kind: 'updated' }
  | { kind: 'failed'; reason: string; detail?: string }

/**
 * G3「导入 Builder 主机」:批量壳,只调用 Orca 原生主机配对
 * (runtimeEnvironments.verifyAndAddFromPairingCode);不 clone 项目、
 * 不建 BW 平行主机台账。单台失败逐台如实报原因与下一步,不冒充整体成功。
 */
export function ImportBuilderHostsDialog({
  open,
  onClose,
  onImported
}: {
  open: boolean
  onClose: () => void
  /** 导入收尾后刷新整面墙(仓库目录 + 工作树 + 名片判据)。 */
  onImported: () => Promise<void>
}): React.JSX.Element | null {
  const setRuntimeEnvironments = useAppStore((s) => s.setRuntimeEnvironments)
  const readRuntimeHostStatusSnapshots = useAppStore((s) => s.readRuntimeHostStatusSnapshots)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [entries, setEntries] = useState<ParsedBuilderHost[] | null>(null)
  const [checkedNames, setCheckedNames] = useState<ReadonlySet<string>>(new Set())
  const [results, setResults] = useState<Record<string, HostImportResult>>({})
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const plan = useMemo(() => (entries ? planBuilderHostImports(entries) : null), [entries])

  if (!open) {
    return null
  }

  const importableCount = (plan ?? []).filter(
    (entry) => entry.action === 'import' && checkedNames.has(entry.name)
  ).length

  const close = (): void => {
    if (importing) {
      return
    }
    onClose()
  }

  const downloadTemplate = async (): Promise<void> => {
    const content = JSON.stringify(builderHostsTemplate(), null, 2)
    try {
      const saved = await window.api.fs.saveDownloadedFile({
        suggestedName: BUILDER_HOSTS_TEMPLATE_FILENAME,
        content,
        encoding: 'utf8'
      })
      if (saved.canceled) {
        return
      }
      toast.success(`模板已保存：${saved.destinationPath} —— 填好「主机名: 配对地址」后导入`)
    } catch (e) {
      notifyWorkbenchError('导入模板未保存', e, '重新选择保存位置后重试。')
    }
  }

  const pickFile = async (file: File | undefined): Promise<void> => {
    if (!file) {
      return
    }
    setFileName(file.name)
    setResults({})
    try {
      const parsed = parseBuilderHostsFile(await file.text())
      if (!parsed.ok) {
        setEntries(null)
        setCheckedNames(new Set())
        setFileError(parsed.error)
        return
      }
      setFileError(null)
      setEntries(parsed.hosts)
      const nextPlan = planBuilderHostImports(parsed.hosts)
      setCheckedNames(
        new Set(nextPlan.filter((entry) => entry.action === 'import').map((entry) => entry.name))
      )
    } catch (e) {
      setEntries(null)
      setCheckedNames(new Set())
      setFileError('文件读取失败，可重新选择文件。')
      notifyWorkbenchError('导入文件读取失败', e, '重新选择文件后重试。')
    }
  }

  const setResult = (name: string, result: HostImportResult): void => {
    setResults((prev) => ({ ...prev, [name]: result }))
  }

  const runImport = async (): Promise<void> => {
    if (!plan || importableCount === 0) {
      return
    }
    setImporting(true)
    let added = 0
    let updated = 0
    let failed = 0
    try {
      // 逐台配对:单台失败不中断其余主机,失败原因逐台如实呈现。
      for (const entry of plan) {
        if (entry.action !== 'import' || !checkedNames.has(entry.name)) {
          continue
        }
        setResult(entry.name, { kind: 'importing' })
        try {
          const result = await window.api.runtimeEnvironments.verifyAndAddFromPairingCode({
            name: entry.name,
            pairingCode: entry.address
          })
          if (result.ok) {
            if (result.updatedExisting) {
              updated += 1
            } else {
              added += 1
            }
            setResult(entry.name, { kind: result.updatedExisting ? 'updated' : 'added' })
            setCheckedNames((previous) => {
              const next = new Set(previous)
              next.delete(entry.name)
              return next
            })
          } else {
            failed += 1
            setResult(entry.name, {
              kind: 'failed',
              reason:
                result.kind === 'environment-save-failed'
                  ? remoteServerPairingFailureMessage(result)
                  : translateRemotePairingFailureDescription(result.kind, entry.displayEndpoint)
            })
          }
        } catch (e) {
          failed += 1
          setResult(entry.name, {
            kind: 'failed',
            reason: '检查主机连接或重新获取配对地址后重试。',
            detail: e instanceof Error ? (e.stack ?? e.message) : String(e)
          })
        }
      }
      // 配对结果落进 store:主机目录、连接状态,然后刷新各主机仓库目录与整面墙。
      const environments = await window.api.runtimeEnvironments.list()
      setRuntimeEnvironments(environments)
      await readRuntimeHostStatusSnapshots()
      await onImported()
      if (failed === 0) {
        toast.success(`已新增 ${added} 台、更新配对 ${updated} 台 Builder 主机，并刷新仓库目录`)
        onClose()
        return
      }
      toast.error(
        `导入完成：新增 ${added} 台、更新配对 ${updated} 台，失败 ${failed} 台——失败原因逐台列在对话框里，可修正配置后重导`
      )
    } catch (error) {
      notifyWorkbenchError('导入结果未能刷新', error, '已尝试配对，可刷新项目墙核对主机。')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      className="wb-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close()
        }
      }}
    >
      <section
        className="wb-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wb-import-hosts-title"
        data-workbench-import-hosts-dialog
      >
        <div className="wb-dialog-head">
          <h2 id="wb-import-hosts-title">导入 Builder 主机</h2>
          <button type="button" className="wb-btn wb-btn-ghost" aria-label="关闭" onClick={close}>
            ×
          </button>
        </div>
        <p className="wb-dialog-description">
          导入共享的 Orca 主机配对配置，批量添加 Builder 主机；不克隆项目，也不改动 Orca Projects
          的全量列表。导入后自动刷新各主机仓库目录，项目是否上墙仍按各项目里能否读到
          .bw/project.toml 判定。
        </p>

        <div className="wb-dialog-section">
          <span className="wb-dialog-label">配置文件</span>
          <div className="wb-import-file-row">
            <span className="wb-import-file-name" title={fileName ?? undefined}>
              {fileName ?? 'builder-workbench-hosts.json'}
            </span>
            <button
              type="button"
              className="wb-btn wb-btn-secondary"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              选择文件
            </button>
            <button
              type="button"
              className="wb-btn wb-btn-ghost"
              disabled={importing}
              onClick={() => void downloadTemplate()}
              data-workbench-import-template
            >
              下载模板
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                void pickFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>
          <p className="wb-dialog-hint">
            结构就是「主机名: 该主机 Orca 分享的配对地址」：每台 Builder
            主机把自己的配对地址发给你，按模板合成一个 json
            即可导入；名字自己取，导入后用于墙上来源标签。
          </p>
          {fileError ? (
            <p className="wb-import-error" role="alert">
              {fileError}
            </p>
          ) : null}
        </div>

        {plan && plan.length > 0 ? (
          <div className="wb-dialog-section">
            <span className="wb-dialog-label">将导入的主机</span>
            <div className="wb-import-hosts">
              {plan.map((entry) => {
                const result = results[entry.name]
                const disabled =
                  entry.action !== 'import' ||
                  importing ||
                  result?.kind === 'added' ||
                  result?.kind === 'updated'
                const stateLabel =
                  entry.action === 'invalid'
                    ? '地址无效'
                    : result?.kind === 'updated'
                      ? '已更新配对'
                      : result?.kind === 'added'
                        ? '已导入'
                        : result?.kind === 'importing'
                          ? '导入中…'
                          : result?.kind === 'failed'
                            ? '失败'
                            : '待导入'
                return (
                  <div key={entry.name}>
                    <label
                      className={`wb-import-host${entry.action === 'invalid' ? ' is-invalid' : ''}`}
                      data-workbench-import-host={entry.name}
                    >
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={entry.action === 'import' && checkedNames.has(entry.name)}
                        onChange={(event) => {
                          setCheckedNames((prev) => {
                            const next = new Set(prev)
                            if (event.target.checked) {
                              next.add(entry.name)
                            } else {
                              next.delete(entry.name)
                            }
                            return next
                          })
                        }}
                      />
                      <span className="wb-import-copy">
                        <strong>{entry.name}</strong>
                        <span>{entry.issue || entry.displayEndpoint || entry.address}</span>
                        {result?.kind === 'failed' ? (
                          <span className="wb-import-failure" role="alert">
                            配对失败。{result.reason}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`wb-tag ${
                          entry.action === 'invalid' || result?.kind === 'failed'
                            ? 'wb-tag-danger'
                            : result?.kind === 'updated' || result?.kind === 'added'
                              ? 'wb-tag-success'
                              : 'wb-tag-neutral'
                        }`}
                      >
                        {stateLabel}
                      </span>
                    </label>
                    {result?.kind === 'failed' && result.detail && (
                      <ErrorDetails className="wb-import-failure" detail={result.detail} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="wb-dialog-actions">
          <button
            type="button"
            className="wb-btn wb-btn-ghost"
            onClick={close}
            disabled={importing}
          >
            取消
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-primary"
            disabled={importing || importableCount === 0}
            onClick={() => void runImport()}
            data-workbench-import-confirm
          >
            {importing ? '导入中…' : `导入 ${importableCount} 台主机`}
          </button>
        </div>
      </section>
    </div>
  )
}
