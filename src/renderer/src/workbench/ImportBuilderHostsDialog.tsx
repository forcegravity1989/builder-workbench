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
  | { kind: 'failed'; reason: string }

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
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const setRuntimeEnvironments = useAppStore((s) => s.setRuntimeEnvironments)
  const readRuntimeHostStatusSnapshots = useAppStore((s) => s.readRuntimeHostStatusSnapshots)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [entries, setEntries] = useState<ParsedBuilderHost[] | null>(null)
  const [checkedNames, setCheckedNames] = useState<ReadonlySet<string>>(new Set())
  const [results, setResults] = useState<Record<string, HostImportResult>>({})
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const pairedNames = useMemo(
    () => runtimeEnvironments.map((env) => env.name),
    [runtimeEnvironments]
  )
  // 已配对集合变化(比如导入成功一台后)时重算计划,同名主机自动转为跳过。
  const plan = useMemo(
    () => (entries ? planBuilderHostImports(entries, pairedNames) : null),
    [entries, pairedNames]
  )

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
      toast.error(`模板没保存成：${e instanceof Error ? e.message : String(e)}`)
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
      const nextPlan = planBuilderHostImports(parsed.hosts, pairedNames)
      setCheckedNames(
        new Set(nextPlan.filter((entry) => entry.action === 'import').map((entry) => entry.name))
      )
    } catch (e) {
      setEntries(null)
      setCheckedNames(new Set())
      setFileError(`文件读不了：${e instanceof Error ? e.message : String(e)}`)
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
            added += 1
            setResult(entry.name, { kind: 'added' })
          } else {
            failed += 1
            setResult(entry.name, {
              kind: 'failed',
              reason:
                result.kind === 'environment-save-failed'
                  ? result.message
                  : translateRemotePairingFailureDescription(result.kind, entry.displayEndpoint)
            })
          }
        } catch (e) {
          failed += 1
          setResult(entry.name, {
            kind: 'failed',
            reason: e instanceof Error ? e.message : String(e)
          })
        }
      }
      // 配对结果落进 store:主机目录、连接状态,然后刷新各主机仓库目录与整面墙。
      const environments = await window.api.runtimeEnvironments.list()
      setRuntimeEnvironments(environments)
      await readRuntimeHostStatusSnapshots()
      await onImported()
      if (failed === 0) {
        toast.success(`已导入 ${added} 台 Builder 主机并刷新仓库目录`)
        onClose()
        return
      }
      toast.error(
        `导入完成：成功 ${added} 台，失败 ${failed} 台——失败原因逐台列在对话框里，可修正配置后重导`
      )
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
          每台共享主机对应一个 Builder 项目，主机内的仓库和工作树归属于这个项目。
          导入后自动读取各主机共享的仓库目录；本机接入的项目单独保留。
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
            <span className="wb-dialog-label">文件包含 {plan.length} 个 Builder 项目</span>
            <div className="wb-import-hosts">
              {plan.map((entry) => {
                const result = results[entry.name]
                const disabled = entry.action !== 'import' || importing
                const stateLabel =
                  entry.action === 'invalid'
                    ? '地址无效'
                    : entry.action === 'skip-paired'
                      ? '已配对'
                      : result?.kind === 'added'
                        ? '已导入'
                        : result?.kind === 'importing'
                          ? '导入中…'
                          : result?.kind === 'failed'
                            ? '失败'
                            : '待导入'
                return (
                  <label
                    key={entry.name}
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
                      <span>
                        {entry.action === 'skip-paired'
                          ? '同名主机已配对——跳过，不产生重复主机'
                          : entry.issue || entry.displayEndpoint || entry.address}
                      </span>
                      {result?.kind === 'failed' ? (
                        <span className="wb-import-failure" role="alert">
                          配对没成：{result.reason}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`wb-tag ${
                        entry.action === 'invalid' || result?.kind === 'failed'
                          ? 'wb-tag-danger'
                          : entry.action === 'skip-paired' || result?.kind === 'added'
                            ? 'wb-tag-success'
                            : 'wb-tag-neutral'
                      }`}
                    >
                      {stateLabel}
                    </span>
                  </label>
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
