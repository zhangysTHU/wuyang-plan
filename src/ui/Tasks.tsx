import { useState } from 'react'
import { Clock3, Database, Download, ListChecks, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dataService } from '../data/local'
import { dateTime, jobLabel, jobStatus, localDate, type Job } from '../domain'
import { useView } from './App'
import { Awaiting, Badge, download, Empty, Feedback, Heading, Panel, useOperation } from './shared'

export function Tasks() {
  const { snapshot, patient, choosePatient } = useView()
  const [nightId, setNightId] = useState('')
  const [onlyPatient, setOnlyPatient] = useState(false)
  const operation = useOperation()
  const nights = snapshot.nights.filter(item => item.patientId === patient.id).reverse()
  const jobs = snapshot.jobs.filter(job => !onlyPatient || job.patientId === patient.id)
  async function retry(job: Job) {
    return operation.run(async () => {
      if (job.kind === 'morning') await dataService.runMorning()
      if (job.kind === 'statistics' && job.patientId) await dataService.recalculate(job.patientId, job.nightId)
      if (job.kind === 'simulation' && job.patientId && job.inputs?.nights && job.inputs.endDate) {
        await dataService.generate(job.patientId, job.inputs.nights, job.inputs.endDate)
      }
    }, '已完成重试。')
  }
  return <>
    <Heading title="任务与设置" detail="查看本地任务、补跑统计并导出演示备份。"
      action={<button className="button secondary" disabled={operation.busy} onClick={() => void operation.run(async () => {
        download(await dataService.backup(), '无恙计划-模拟数据-' + localDate(Date.now()) + '.json')
      }, '备份已导出。')}><Download size={17} />导出备份</button>} />
    <Feedback error={operation.error} success={operation.success} />
    <div className="detail-grid equal">
      <Panel title="补跑逐夜统计" detail={patient.name + ' · ' + patient.id}>
        <form className="form-stack" onSubmit={event => {
          event.preventDefault()
          void operation.run(() => dataService.recalculate(patient.id, nightId || undefined), '统计任务已完成。')
        }}>
          <label>补跑范围<select value={nightId} onChange={event => setNightId(event.target.value)}>
            <option value="">当前患者的全部夜晚</option>
            {nights.map(night => <option value={night.id} key={night.id}>{night.date} · {night.source === 'csv' ? 'CSV 导入' : '模拟雷达'}</option>)}
          </select></label>
          <button className="button primary" disabled={operation.busy || !nights.length}><RefreshCw size={16} />运行统计</button>
        </form>
      </Panel>
      <Panel title="08:17 晨间统计" detail="北京时间 · 手动演示">
        <div className="setting-note"><span className="metric-icon mint"><Clock3 size={21} /></span>
          <p>汇总每位有监测记录的患者的最新一晚。未来由后端定时任务触发。</p></div>
        <button className="button secondary" disabled={operation.busy} onClick={() =>
          void operation.run(() => dataService.runMorning(), '晨间统计已完成。')}>模拟晨间统计</button>
      </Panel>
    </div>
    <Panel title="任务记录" detail={operation.busy ? '操作进行中…' : '按启动时间倒序'}
      action={<label className="check-field"><input type="checkbox" checked={onlyPatient} onChange={event => setOnlyPatient(event.target.checked)} />仅当前患者</label>}>
      {jobs.length ? <div className="task-list">
        {jobs.map(job => <article className="task-row" key={job.id}>
          <div><h3>{jobLabel[job.kind]} <Badge tone={job.status === 'failed' ? 'red' : job.status === 'running' ? 'amber' : 'green'}>{jobStatus[job.status]}</Badge></h3>
            <p>{dateTime(job.startedAt)}{job.patientId ? ' · ' + job.patientId : ' · 所有患者'}{job.nightId ? ' · ' + job.nightId : ''}</p>
            {job.message && <p className={job.status === 'failed' ? 'task-error' : ''}>{job.message}</p>}
          </div>
          {job.status === 'failed' && (job.kind === 'import'
            ? <Link className="button secondary small" to="/admin/monitoring?import=1"
              onClick={() => { if (job.patientId) choosePatient(job.patientId) }}>重新选择 CSV</Link>
            : <button className="button secondary small" disabled={operation.busy} onClick={() => void retry(job)}>重试</button>)}
        </article>)}
      </div> : <Empty title="暂无任务记录" message="运行统计或导入 CSV 后会显示任务状态。" icon={ListChecks} />}
    </Panel>
    <div className="detail-grid equal">
      <Panel title="数据存储" detail="本地演示环境"><div className="setting-note"><span className="metric-icon blue"><Database size={20} /></span>
        <p>已保存 {snapshot.patients.length} 位患者、{snapshot.documents.length} 份病历、{snapshot.nights.length} 晚监测。记录保存在当前浏览器。</p></div></Panel>
      <Panel title="分析服务"><Awaiting message="模型用量和 Skill 版本将在服务接入后显示。" /></Panel>
    </div>
  </>
}
