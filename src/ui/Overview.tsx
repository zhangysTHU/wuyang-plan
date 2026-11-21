import {
  Activity, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Clock3, HeartPulse, MoonStar, Waves,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { clock, dateTime, jobLabel, jobStatus, type Night } from '../domain'
import { useView } from './App'
import { TrendPanel } from './Charts'
import { Badge, Empty, format, Heading, hours, Panel } from './shared'

function NightArt() {
  return <svg className="hero-art" viewBox="0 0 450 190" fill="none" aria-hidden="true">
    <defs><linearGradient id="hero-wave"><stop stopColor="#6ecfb1" stopOpacity="0" /><stop offset=".6" stopColor="#8addc4" /><stop offset="1" stopColor="#8addc4" stopOpacity=".35" /></linearGradient></defs>
    <g stroke="#9fdcc9" opacity=".16">
      <circle cx="338" cy="92" r="37" /><circle cx="338" cy="92" r="64" /><circle cx="338" cy="92" r="92" />
      <circle cx="338" cy="92" r="119" /><path d="M338 0v190M222 92h228" strokeDasharray="3 5" />
    </g>
    <circle cx="338" cy="92" r="19" fill="#a6e4ca" opacity=".09" />
    <path d="M342 77c-9 5-12 17 1 24-8 4-19-2-19-11 0-9 8-15 18-13Z" fill="#c7f7de" opacity=".82" />
    <path d="M0 108c37-13 72-10 100-4s48 11 72 2l23-12 13 22 13-41 17 58 13-29c22-7 36-8 60-4" stroke="url(#hero-wave)" strokeWidth="1.8" />
    <path d="M390 65v12m-6-6h12m-102 61v8m-4-4h8" stroke="#8addc4" opacity=".7" strokeLinecap="round" />
    <circle cx="377" cy="124" r="3" fill="#85d2ad" /><circle cx="274" cy="53" r="2" fill="#8addc4" opacity=".7" />
  </svg>
}

export function Overview() {
  const { snapshot, patient, account } = useView()
  const admin = account.role === 'admin'
  const nights = snapshot.nights.filter(night => night.patientId === patient.id)
  const latest = nights.at(-1)
  const metrics = latest?.metrics
  const job = snapshot.jobs.find(item => item.kind === 'statistics' || item.kind === 'morning')
  const sleepUrl = admin ? '/admin/monitoring' : '/me/sleep'
  const records = nights.slice(-4).reverse()
  const cards = [
    { label: '估计睡眠时长', value: hours(metrics?.sleepMinutes ?? null), suffix: '', icon: MoonStar, className: 'mint', foot: '浅睡、深睡与快速眼动合计' },
    { label: '研究性睡眠评分', value: format(metrics?.score.total ?? null, 0), suffix: '/ 100', icon: Activity, className: 'lilac', foot: 'v0.1 · 研究估计' },
    { label: '平均夜间心率', value: format(metrics?.heart.mean ?? null), suffix: '次/分', icon: HeartPulse, className: 'rose', foot: (metrics?.heart.count.toLocaleString('zh-CN') ?? '0') + ' 条有效读数' },
    { label: '平均呼吸频率', value: format(metrics?.respiration.mean ?? null), suffix: '次/分', icon: Waves, className: 'blue', foot: (metrics?.respiration.count.toLocaleString('zh-CN') ?? '0') + ' 条有效读数' },
  ]
  const latestLink = latest ? sleepUrl + '?night=' + encodeURIComponent(latest.id) : sleepUrl

  function recordLabel(night: Night) { return night.source === 'csv' ? 'CSV 导入' : '模拟雷达' }
  return <>
    <Heading title={admin ? '项目总览' : '我的健康总览'}
      detail={admin ? '查看夜间监测结果与睡眠趋势。' : '查看近期睡眠与夜间生命体征。'}
      action={admin && <Link className="button secondary" to="/admin/patients"><ClipboardList size={17} />查看患者档案</Link>} />
    <section className="overview-hero">
      <NightArt />
      <div className="hero-content">
        <div className="hero-status"><span />{latest ? '最近一次夜间监测' : '等待夜间监测'}</div>
        <h2>{patient.name}<span>{patient.id}</span></h2>
        <p>{latest ? latest.date + ' · ' + clock(latest.start) + ' 至 ' + clock(latest.end) + '（按结束日）' : '当前患者暂无监测记录。'}</p>
        <Link className="hero-link" to={latestLink}>查看监测详情</Link>
      </div>
    </section>
    <section aria-label="最新夜晚指标" className="metrics-grid">
      {cards.map(({ label, value, suffix, icon: Icon, className, foot }) => <article className="metric-card" key={label}>
        <span className={'metric-icon ' + className}><Icon size={20} /></span>
        <p>{label}</p><div className="metric-value">{value} <small>{suffix}</small></div><small className="metric-note">{foot}</small>
      </article>)}
    </section>
    <div className="overview-grid">
      <TrendPanel nights={nights} overview />
      <Panel title={admin ? '监测动态' : '最近的监测'} detail={admin ? '录入状态与最近夜晚' : '按监测结束日期倒序'}>
        {admin && <div className="activity-info">
          <span className="activity-icon"><CalendarDays size={17} /></span><div><strong>{snapshot.patients.length} 位演示患者</strong>
            <small>{latest ? '最新更新 ' + dateTime(latest.updatedAt) : '暂无数据更新'}</small></div>
        </div>}
        {admin && <div className="activity-info">
          <span className="activity-icon"><CheckCircle2 size={17} /></span><div><strong>{job ? jobLabel[job.kind] : '最近统计任务'}</strong>
            <small>{job ? jobStatus[job.status] + ' · ' + dateTime(job.startedAt) : '暂无手动任务记录'}</small></div>
        </div>}
        {records.map(night => <Link className="record-row" key={night.id} to={sleepUrl + '?night=' + encodeURIComponent(night.id)}>
          <span className="activity-icon"><MoonStar size={16} /></span><span><strong>{night.date}</strong><small>{recordLabel(night)} · {hours(night.metrics.sleepMinutes)}</small></span>
          <ChevronRight size={15} className="row-indicator" />
        </Link>)}
        {!records.length && <Empty title="暂无监测记录" icon={Clock3} />}
      </Panel>
    </div>
    {!admin && <Panel title="最近发布的健康报告" action={<Link className="button secondary small" to="/me/reports">查看报告</Link>}>
      <Badge tone="muted">分析服务待接入</Badge>
    </Panel>}
  </>
}
