import { useEffect, useState, type FormEvent } from 'react'
import { Activity, Download, Gauge, Info, MoonStar, RefreshCw, Upload, Waves } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { dataService } from '../data/local'
import {
  addDays, clock, clockSeconds, dateTime, eventLabel, localDate, stageLabel,
  type EventKind, type ImportPreview, type Night, type NightDetails, type Stage,
} from '../domain'
import { seedEnd } from '../radar/simulator'
import { useView } from './App'
import { LineChart, SleepTimeline, TrendPanel } from './Charts'
import {
  Badge, Dialog, download, Empty, errorText, Feedback, format, Heading, hours, Loading, Panel, useOperation,
} from './shared'

function GenerateDialog({ patientId, defaultDate, onClose, onGenerated }: {
  patientId: string; defaultDate: string; onClose: () => void; onGenerated: () => void
}) {
  const [date, setDate] = useState(defaultDate)
  const [count, setCount] = useState(1)
  const operation = useOperation()
  return <Dialog title="生成模拟夜晚" onClose={() => { if (!operation.busy) onClose() }}>
    <form className="form-stack" onSubmit={async event => {
      event.preventDefault()
      const result = await operation.run(() => dataService.generate(patientId, count, date), '模拟数据已生成。')
      if (result.ok) onGenerated()
    }}>
      <p className="form-note">从结束日期往前生成连续夜晚。每晚 8 小时，已有的模拟会话将跳过。</p>
      <label>最后一晚睡眠结束日期<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>生成范围<select value={count} onChange={event => setCount(Number(event.target.value))}>
        <option value={1}>1 晚</option><option value={7}>7 晚</option><option value={14}>14 晚（用于基线对比）</option>
      </select></label>
      <Feedback error={operation.error} />
      <button className="button primary" disabled={operation.busy}>{operation.busy ? '正在生成…' : '生成模拟数据'}</button>
    </form>
  </Dialog>
}

function ImportDialog({ patientId, latestDate, onClose, onImported }: {
  patientId: string; latestDate: string; onClose: () => void; onImported: (id: string) => void
}) {
  const [file, setFile] = useState<File>()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [preview, setPreview] = useState<ImportPreview>()
  const operation = useOperation()
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    if (preview) {
      const result = await operation.run(() => dataService.importNight(preview))
      if (result.ok) onImported(preview.session.id)
    } else {
      const result = await operation.run(() => dataService.prepareImport({
        file, patientId, sessionStart: start.trim() || undefined, sessionEnd: end.trim() || undefined,
      }))
      if (result.ok) setPreview(result.value)
    }
  }
  return <Dialog title="导入 2 秒 CSV" onClose={() => { if (!operation.busy) onClose() }}>
    <form className="form-stack" onSubmit={submit}>
      <p className="form-note">请选择属于 {patientId} 的 UTF-8 CSV，每份文件包含一晚。此工作台用于模拟数据演示。</p>
      <label>标准 CSV 文件<input type="file" accept=".csv,text/csv" required disabled={operation.busy} onChange={event => {
        setFile(event.target.files?.[0]); setPreview(undefined); operation.clear()
      }} /></label>
      <button type="button" className="button secondary small" disabled={operation.busy} onClick={() => void operation.run(async () => {
        const date = addDays(latestDate, 1)
        const data = await dataService.example(patientId, date)
        download(new Blob([data], { type: 'text/csv;charset=utf-8' }), '模拟数据-' + patientId + '-' + date + '.csv')
      })}><Download size={16} />下载 CSV 样例</button>
      <details className="accordion">
        <summary>会话起止时间（可选）</summary>
        <div className="form-stack">
          <p className="form-note">默认由首末采样推断。补充实际边界可检查首尾缺失。时间请写明时区。</p>
          <label>开始时间<input disabled={operation.busy} value={start} placeholder="2026-11-21T23:00:00+08:00" onChange={event => { setStart(event.target.value); setPreview(undefined) }} /></label>
          <label>结束时间<input disabled={operation.busy} value={end} placeholder="2026-11-22T07:00:00+08:00" onChange={event => { setEnd(event.target.value); setPreview(undefined) }} /></label>
        </div>
      </details>
      {preview && <div className="import-preview">
        <strong>导入预览</strong>
        <span>{dateTime(preview.session.start)} 至 {dateTime(preview.session.end)}（北京时间）</span>
        <span>预计 {preview.metrics.expected.toLocaleString()} 条 · 接收 {preview.samples.length.toLocaleString()} 条 · 缺失 {preview.metrics.missing.toLocaleString()} 条</span>
        <span>重复 {preview.session.duplicates} 条 · 有效监测 {format(preview.metrics.validMinutes)} 分钟</span>
      </div>}
      <Feedback error={operation.error} />
      <button className="button primary" disabled={!file || operation.busy}>
        {operation.busy ? '正在处理…' : preview ? '确认导入' : '校验并预览'}
      </button>
    </form>
  </Dialog>
}

function ScorePanel({ night }: { night: Night }) {
  const { score, valid, expected, validMinutes } = night.metrics
  const dimensions = [
    { label: '睡眠时长', weight: '30%', value: score.duration },
    { label: '睡眠效率', weight: '35%', value: score.efficiency },
    { label: '睡眠连续性', weight: '25%', value: score.continuity },
    { label: '体动干扰', weight: '10%', value: score.movement },
  ]
  return <Panel title="研究性睡眠评分" detail="四项维度加权计算" action={<Badge tone="muted">v{score.version}</Badge>}>
    <div className="score-result"><span className="score-icon"><Gauge size={26} /></span><strong>{format(score.total, 0)}</strong><span>/ 100</span></div>
    <div className="score-breakdown">{dimensions.map(item => <div key={item.label}>
      <div><span>{item.label} <small>{item.weight}</small></span><strong>{format(item.value)}</strong></div>
      <progress value={item.value ?? 0} max={100} aria-label={item.label} />
    </div>)}</div>
    <div className="note"><Info size={16} /><span>{score.total === null
      ? '评分需要至少 80% 有效监测、180 分钟有效时长及完整指标。当前 ' + format(valid / expected * 100) + '%、' + format(validMinutes) + ' 分钟。'
      : '基于雷达分期估计，用于研究演示。睡眠结构与疑似暂停单独展示。'}</span></div>
  </Panel>
}

function QualityPanel({ night }: { night: Night }) {
  const { metrics } = night
  return <Panel title="数据质量" detail={night.source === 'csv' ? night.fileName : '固定种子模拟雷达 · 2 秒采样'}
    action={<Badge tone={metrics.valid / metrics.expected >= 0.8 ? 'green' : 'amber'}>{format(metrics.valid / metrics.expected * 100)}% 有效</Badge>}>
    <dl className="quality-grid">
      <div><dt>预期采样</dt><dd>{metrics.expected.toLocaleString()} 条</dd></div>
      <div><dt>有效时段采样</dt><dd>{metrics.valid.toLocaleString()} 条</dd></div>
      <div><dt>缺失采样</dt><dd>{metrics.missing.toLocaleString()} 条</dd></div>
      <div><dt>重复采样</dt><dd>{night.duplicates.toLocaleString()} 条</dd></div>
      <div><dt>有效监测</dt><dd>{format(metrics.validMinutes)} 分</dd></div>
      <div><dt>未知与缺失</dt><dd>{format(metrics.stageMinutes.unknown)} 分</dd></div>
    </dl>
    <p className="chart-footnote">有效监测按已知分期时段计算。生命体征分别按有效读数统计。</p>
    {metrics.gaps.length > 0 && <details className="accordion">
      <summary>{metrics.gaps.length} 个缺失时间区间</summary>
      <div className="gap-list">{metrics.gaps.map(gap => <div key={gap.start}>{localDate(gap.start)} {clockSeconds(gap.start)} 至 {localDate(gap.end)} {clockSeconds(gap.end)} · {(gap.end - gap.start) / 1000} 秒</div>)}</div>
    </details>}
  </Panel>
}

function EventList({ night, detail }: { night: Night; detail: NightDetails }) {
  const [filter, setFilter] = useState<EventKind | 'all'>('all')
  const [page, setPage] = useState(0)
  const selected = detail.events.filter(item => filter === 'all' || filter === item.kind)
  return <Panel title="夜间事件" detail="翻身、轻微体动及设备估计的疑似暂停">
    <div className="event-header">
      <Badge tone="muted">翻身 {night.metrics.eventCounts.turn} 次</Badge>
      <Badge tone="muted">轻微体动 {night.metrics.eventCounts.minor_movement} 次</Badge>
      <Badge tone="amber">疑似暂停 {night.metrics.eventCounts.apnea_suspected} 段 · {night.metrics.apneaSeconds} 秒</Badge>
      <label className="inline-field"><span>筛选</span><select value={filter} onChange={event => { setFilter(event.target.value as typeof filter); setPage(0) }}>
        <option value="all">全部事件</option>{Object.entries(eventLabel).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
      </select></label>
    </div>
    {selected.length ? <>
      <table className="data-table"><thead><tr><th>事件</th><th>时间范围</th><th>时长</th></tr></thead>
        <tbody>{selected.slice(page * 10, (page + 1) * 10).map(item => <tr key={item.kind + item.start}>
          <td>{eventLabel[item.kind]}</td><td>{clockSeconds(item.start)}–{clockSeconds(item.end)}</td><td>{(item.end - item.start) / 1000} 秒</td>
        </tr>)}</tbody>
      </table>
      {selected.length > 10 && <div className="pagination">
        <button className="button secondary small" disabled={page === 0} onClick={() => setPage(value => value - 1)}>上一页</button>
        <span>{page + 1} / {Math.ceil(selected.length / 10)}</span>
        <button className="button secondary small" disabled={(page + 1) * 10 >= selected.length} onClick={() => setPage(value => value + 1)}>下一页</button>
      </div>}
    </> : <Empty title="暂无此类事件" icon={Activity} />}
  </Panel>
}

function NightView({ night }: { night: Night }) {
  const [detail, setDetail] = useState<NightDetails>()
  const [error, setError] = useState('')
  const { id, updatedAt, metrics } = night
  useEffect(() => {
    let current = true
    setError('')
    void dataService.nightDetails(id).then(value => { if (current) setDetail(value) })
      .catch(cause => { if (current) setError(errorText(cause)) })
    return () => { current = false }
  }, [id, updatedAt])
  const phases: Stage[] = ['light', 'deep', 'rem', 'awake', 'unknown']
  return <>
    <div className="detail-grid">
      <Panel title="睡眠结构" detail={dateTime(night.start) + ' 至 ' + dateTime(night.end)}>
        <div className="sleep-kpis">
          <div><span>估计睡眠时长</span><strong>{hours(metrics.sleepMinutes)}</strong></div>
          <div><span>估计睡眠效率</span><strong>{metrics.efficiency === null ? '—' : format(metrics.efficiency * 100) + '%'}</strong></div>
          <div><span>入睡潜伏期</span><strong>{format(metrics.latency)} <small>分钟</small></strong></div>
          <div><span>入睡后清醒</span><strong>{format(metrics.waso)} <small>分钟</small></strong></div>
        </div>
        {detail ? <SleepTimeline night={night} data={detail} /> : error ? <Feedback error={error} /> : <Loading>正在读取睡眠分期…</Loading>}
        <div className="stage-legend">{phases.map(stage => <div key={stage}>
          <i className={'stage-' + stage} /><span>{stageLabel[stage]}</span><strong>{format(metrics.stageMinutes[stage])} 分</strong>
          {stage !== 'awake' && stage !== 'unknown' && Boolean(metrics.sleepMinutes) &&
            <small>{format(metrics.stageMinutes[stage] / metrics.sleepMinutes! * 100)}%</small>}
        </div>)}</div>
        <p className="chart-footnote">阶段占比以估计睡眠总时长为分母。睡眠效率为估计睡眠时长 / 有效监测时长。本晚入睡后觉醒 {metrics.eventCounts.awake} 次。</p>
      </Panel>
      <ScorePanel night={night} />
    </div>
    <div className="detail-grid equal">
      <QualityPanel night={night} />
      <Panel title="夜间生命体征" detail="全量计算汇总，曲线按时间区间取均值">
        {detail ? <>
          <div className="vital-heading"><Activity size={17} /><strong>心率</strong><span>平均 {format(metrics.heart.mean)} 次/分 · {metrics.heart.count.toLocaleString()} 条</span></div>
          <LineChart label="心率" unit="次/分" compact points={detail.points.map(point => ({ label: clock(point.time), value: point.heart }))} />
          <div className="vital-heading"><Waves size={17} /><strong>呼吸频率</strong><span>平均 {format(metrics.respiration.mean)} 次/分 · {metrics.respiration.count.toLocaleString()} 条</span></div>
          <LineChart label="呼吸频率" unit="次/分" tone="blue" compact points={detail.points.map(point => ({ label: clock(point.time), value: point.respiration }))} />
          <details className="accordion"><summary>查看中位数与分位数</summary>
            <div className="table-scroll"><table className="data-table"><thead><tr><th>指标</th><th>中位数</th><th>P5</th><th>P25</th><th>P75</th><th>P95</th></tr></thead>
              <tbody>{([['心率', metrics.heart], ['呼吸率', metrics.respiration]] as const).map(([label, stats]) =>
                <tr key={label}><td>{label}</td><td>{format(stats.median)}</td>{stats.quantiles.map((value, index) => <td key={index}>{format(value)}</td>)}</tr>)}
              </tbody></table></div>
          </details>
        </> : error ? <Feedback error={error} /> : <Loading>正在读取生命体征…</Loading>}
      </Panel>
    </div>
    {detail && <EventList night={night} detail={detail} />}
  </>
}

export function Sleep() {
  const { snapshot, patient, account } = useView()
  const admin = account.role === 'admin'
  const [params, setParams] = useSearchParams()
  const [modal, setModal] = useState<'import' | 'generate' | null>(() => admin && params.has('import') ? 'import' : null)
  const [notice, setNotice] = useState('')
  const operation = useOperation()
  const nights = snapshot.nights.filter(item => item.patientId === patient.id)
  const latest = nights.at(-1)
  const requested = params.get('night')
  const selected = requested ? nights.find(night => night.id === requested) : latest
  const goNight = (id: string) => {
    setParams(id ? { night: id } : {})
    operation.clear()
  }
  const close = () => { setModal(null); if (params.has('import')) setParams({}, { replace: true }) }
  return <>
    <Heading title={admin ? '监测数据' : '睡眠监测'}
      detail={admin ? '生成或导入夜间监测，查看睡眠质量和长程变化。' : '按日期查看每晚睡眠结构与监测趋势。'}
      action={admin && <>
        <button className="button secondary" onClick={() => setModal('generate')}><MoonStar size={17} />生成模拟数据</button>
        <button className="button primary" onClick={() => setModal('import')}><Upload size={17} />导入 2 秒 CSV</button>
      </>} />
    <Feedback error={operation.error} success={operation.success || notice} />
    <div className="night-selector">
      <label className="inline-field"><span>监测夜晚</span>
        <select value={selected?.id ?? ''} onChange={event => goNight(event.target.value)}>
          {!selected && <option value="">请选择夜晚</option>}
          {[...nights].reverse().map(night => <option value={night.id} key={night.id}>{night.date} · {night.source === 'csv' ? 'CSV 导入' : '模拟雷达'}</option>)}
        </select>
      </label>
      <Badge tone="muted">{nights.length} 晚 · 模拟数据</Badge>
      {admin && selected && <button className="button secondary small push-right" disabled={operation.busy} onClick={() =>
        void operation.run(() => dataService.recalculate(patient.id, selected.id), '逐夜统计与评分已更新。')}>
        <RefreshCw size={16} />{operation.busy ? '正在统计…' : '重算统计与评分'}
      </button>}
    </div>
    {selected ? <NightView key={selected.id} night={selected} /> : <Panel title="单晚监测">
      {requested ? <Empty title="无法读取此监测记录" message="请从列表选择可访问的夜晚。">
        {latest && <button className="button secondary" onClick={() => goNight(latest.id)}>查看最近一晚</button>}
      </Empty> : <Empty title="暂无监测记录" message={admin ? '可以生成模拟夜晚或导入 CSV。' : '有监测数据后会在这里显示。'} icon={MoonStar} />}
    </Panel>}
    <TrendPanel nights={nights} subject={!admin} />
    {admin && modal === 'generate' && <GenerateDialog patientId={patient.id} defaultDate={latest?.date ?? seedEnd} onClose={close}
      onGenerated={() => { close(); goNight(''); setNotice('生成任务已完成。') }} />}
    {admin && modal === 'import' && <ImportDialog patientId={patient.id} latestDate={latest?.date ?? localDate(Date.now())} onClose={close}
      onImported={id => { setModal(null); goNight(id); setNotice('CSV 已导入并生成统计。') }} />}
  </>
}
