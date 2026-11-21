import { useState, type FormEvent } from 'react'
import { ArrowDownToLine, ClipboardList, FilePlus2, FileText, FolderOpen, Plus, UserRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { dataService } from '../data/local'
import { dateTime, localDate, type Document, type Encounter } from '../domain'
import { useView } from './App'
import { Awaiting, Badge, Dialog, download, Empty, Feedback, Heading, Panel, useOperation } from './shared'

function ClinicalDialog({ mode, encounter, patientId, onClose, onSaved }: {
  mode: 'patient' | 'encounter' | 'document'
  encounter?: Encounter
  patientId: string
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const labels = { patient: '新建演示患者', encounter: '添加就诊', document: '添加病历文书' }
  const operation = useOperation()
  const [source, setSource] = useState<'upload' | 'paste'>('upload')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const read = (key: string) => String(values.get(key) ?? '').trim()
    const result = await operation.run(async () => {
      if (mode === 'patient') {
        return dataService.addPatient({ name: read('name'), description: read('description'), background: read('background') })
      }
      if (mode === 'encounter') {
        return dataService.addEncounter({ patientId, title: read('title'), date: read('date'), note: read('note') })
      }
      let name = read('name')
      let text = String(values.get('text') ?? '')
      if (source === 'upload') {
        const file = values.get('file')
        if (!(file instanceof File) || !file.size || !file.name.toLowerCase().endsWith('.txt')) throw new Error('请选择 TXT 文件。')
        if (file.size > 1024 * 1024) throw new Error('TXT 文件大小不得超过 1 MB。')
        name = file.name
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
        catch { throw new Error('无法将 TXT 按 UTF-8 解码。') }
      }
      return dataService.addDocument({ encounterId: encounter!.id, name, text, source })
    })
    if (result.ok) onSaved(result.value.id)
  }
  return <Dialog title={labels[mode]} onClose={() => { if (!operation.busy) onClose() }}>
    <form className="form-stack" onSubmit={submit}>
      {mode === 'patient' && <>
        <label>患者姓名<input name="name" required maxLength={40} /></label>
        <label>随访摘要<input name="description" maxLength={100} placeholder="例如，睡眠监测随访" /></label>
        <label>背景资料<textarea name="background" rows={4} maxLength={10000} /></label>
      </>}
      {mode === 'encounter' && <>
        <label>就诊日期<input name="date" type="date" defaultValue={localDate(Date.now())} required /></label>
        <label>就诊类型<input name="title" required maxLength={80} placeholder="例如，门诊随访" /></label>
        <label>备注<textarea name="note" rows={3} maxLength={4000} /></label>
      </>}
      {mode === 'document' && <>
        <p className="form-note">{encounter?.id} · {encounter?.title}</p>
        <div className="segmented" aria-label="文书录入方式">
          <button type="button" aria-pressed={source === 'upload'} className={source === 'upload' ? 'selected' : ''} onClick={() => { setSource('upload'); operation.clear() }}>上传 TXT</button>
          <button type="button" aria-pressed={source === 'paste'} className={source === 'paste' ? 'selected' : ''} onClick={() => { setSource('paste'); operation.clear() }}>粘贴文本</button>
        </div>
        {source === 'upload' ? <label>UTF-8 TXT 文件<input name="file" type="file" accept=".txt,text/plain" required /></label> : <>
          <label>文书名称<input name="name" required maxLength={160} /></label>
          <label>病历原文<textarea name="text" rows={8} required placeholder="粘贴演示病历文本" /></label>
        </>}
      </>}
      <Feedback error={operation.error} />
      <button className="button primary" disabled={operation.busy}>{operation.busy ? '正在保存…' : '保存'}</button>
    </form>
  </Dialog>
}

const sourceLabel: Record<Document['source'], string> = { sample: '项目演示资料', upload: 'TXT 上传', paste: '粘贴录入' }
export function Patients() {
  const { snapshot, patient, choosePatient } = useView()
  const [params, setParams] = useSearchParams()
  const [modal, setModal] = useState<'patient' | 'encounter' | 'document' | null>(null)
  const [notice, setNotice] = useState('')
  const visits = snapshot.encounters.filter(item => item.patientId === patient.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  const visit = visits.find(item => item.id === params.get('visit')) ?? visits[0]
  const documents = snapshot.documents.filter(item => item.encounterId === visit?.id)
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.name.localeCompare(b.name))
  const doc = documents.find(item => item.id === params.get('doc')) ?? documents[0]
  return <>
    <Heading title="患者与病历" detail="按就诊时间浏览病历，保留每份文书的来源。"
      action={<button className="button primary" onClick={() => setModal('patient')}><Plus size={18} />新建演示患者</button>} />
    <Feedback success={notice} />
    <Panel title={patient.name + ' · ' + patient.id} detail={patient.description || '演示患者档案'}
      action={<button className="button secondary small" onClick={() => setModal('encounter')}><Plus size={16} />添加就诊</button>}>
      <div className="patient-directory" aria-label="演示患者">
        {snapshot.patients.map(item => <button key={item.id} className={'person-select' + (patient.id === item.id ? ' selected' : '')}
          aria-pressed={patient.id === item.id} onClick={() => choosePatient(item.id)}>
          <span className="avatar"><UserRound size={17} /></span><span><strong>{item.name}</strong><small>{item.id}</small></span>
        </button>)}
      </div>
      {patient.background && <details className="accordion"><summary>查看患者背景档案</summary><pre className="document-text compact-text">{patient.background}</pre></details>}
    </Panel>
    <div className="clinical-grid">
      <Panel title="就诊时间线" detail={visits.length + ' 次就诊 · 最近优先'} className="visit-panel">
        {visits.length ? <ol className="visit-list">{visits.map(item => {
          const count = snapshot.documents.filter(document => document.encounterId === item.id).length
          return <li key={item.id}><button className={visit?.id === item.id ? 'selected' : ''} aria-pressed={visit?.id === item.id}
            onClick={() => setParams({ visit: item.id })}>
            <time>{item.date}</time><strong>{item.title}</strong><small>{item.id} · {count} 份文书</small>
          </button></li>
        })}</ol> : <Empty title="暂无就诊" icon={ClipboardList} />}
      </Panel>
      <Panel title="病历原文" detail={visit ? visit.date + ' · ' + visit.title : '选择一条就诊记录'}
        action={visit && <button className="button secondary small" onClick={() => setModal('document')}><FilePlus2 size={16} />添加文书</button>}>
        {visit?.note && <p className="document-note">{visit.note}</p>}
        {documents.length > 0 && <div className="document-tabs" aria-label="文书列表">{documents.map(item =>
          <button key={item.id} className={doc?.id === item.id ? 'selected' : ''} aria-pressed={doc?.id === item.id}
            onClick={() => setParams({ visit: visit.id, doc: item.id })}><FileText size={15} />{item.name.replace(/^P\d+-V\d+-D\d+_/, '')}</button>)}</div>}
        {doc ? <>
          <div className="document-meta"><div><Badge tone="muted">{sourceLabel[doc.source]}</Badge><small>{dateTime(doc.addedAt)}</small></div>
            <button className="button secondary small" onClick={() => download(new Blob([doc.text], { type: 'text/plain;charset=utf-8' }), '模拟数据-' + doc.name)}>
              <ArrowDownToLine size={15} />下载 TXT
            </button>
          </div>
          <pre className="document-text">{doc.text}</pre>
        </> : <Empty title="暂无病历文书" message={visit ? '可上传 TXT 或粘贴文本。' : '添加就诊后即可录入病历。'} icon={FolderOpen} />}
      </Panel>
      <Panel title="结构化临床档案" detail="病历抽取、证据审核与档案版本" className="clinical-awaiting">
        <Awaiting message="分析服务接入后，可核对原文证据并发布整合档案。" />
      </Panel>
    </div>
    {modal && <ClinicalDialog mode={modal} encounter={visit} patientId={patient.id} onClose={() => setModal(null)} onSaved={id => {
      setModal(null)
      setNotice('已保存。')
      if (modal === 'patient') choosePatient(id)
      if (modal === 'encounter') setParams({ visit: id })
      if (modal === 'document' && visit) setParams({ visit: visit.id, doc: id })
    }} />}
  </>
}
