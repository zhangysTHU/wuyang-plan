import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Activity, CircleAlert, FileText, LoaderCircle, X, type LucideIcon } from 'lucide-react'

export const format = (value: number | null, digits = 1) =>
  value === null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value)
export const signed = (value: number | null, digits = 1) =>
  value === null ? '—' : (value > 0 ? '+' : '') + format(value, digits)
export const hours = (minutes: number | null) => {
  if (minutes === null) return '—'
  const rounded = Math.round(minutes)
  return Math.floor(rounded / 60) + ' 小时 ' + (rounded % 60) + ' 分'
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。'
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function Brand({ light = false }: { light?: boolean }) {
  return <div className={'brand' + (light ? ' brand-light' : '')}>
    <img src="/mark.svg" alt="" width={40} height={40} />
    <div><strong>无恙计划</strong><small>居家健康监测</small></div>
  </div>
}

export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'muted' | 'amber' | 'red' }) {
  return <span className={'badge badge-' + tone}>{children}</span>
}

export function Panel({ title, detail, action, children, className = '' }: {
  title: string; detail?: string; action?: ReactNode; children: ReactNode; className?: string
}) {
  return <section className={'panel ' + className}>
    <div className="panel-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>
    {children}
  </section>
}

export function Heading({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action && <div className="actions">{action}</div>}</div>
}

export function Empty({ title, message, icon: Icon = FileText, children }: {
  title: string; message?: string; icon?: LucideIcon; children?: ReactNode
}) {
  return <div className="empty"><span className="empty-icon"><Icon size={25} /></span><h3>{title}</h3>{message && <p>{message}</p>}{children}</div>
}

export function Awaiting({ message = '分析服务接入后，相关结果会显示在这里。' }: { message?: string }) {
  return <Empty title="分析服务待接入" message={message} />
}

export function Loading({ children = '正在读取演示数据…' }: { children?: ReactNode }) {
  return <div className="loading" role="status"><LoaderCircle className="spin" size={20} />{children}</div>
}

export function Feedback({ error, success }: { error?: string; success?: string }) {
  if (error) return <p className="feedback feedback-error" role="alert"><CircleAlert size={17} />{error}</p>
  if (success) return <p className="feedback feedback-success" role="status"><Activity size={17} />{success}</p>
  return null
}

export function useOperation() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  async function run<T>(action: () => Promise<T>, message = '') {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const value = await action()
      setSuccess(message)
      return { ok: true as const, value }
    } catch (cause) {
      setError(errorText(cause))
      return { ok: false as const }
    } finally {
      setBusy(false)
    }
  }
  const clear = () => { setError(''); setSuccess('') }
  return { busy, error, success, run, clear }
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const modal = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = modal.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={modal} className="dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="dialog-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={22} /></button></div>
    {children}
  </dialog>
}
