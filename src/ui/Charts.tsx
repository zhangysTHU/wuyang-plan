import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { BarChart3, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { addDays, clock, stageLabel, type Night, type NightDetails, type Stage } from '../domain'
import { trendMetrics, trends, trendWindows, type TrendMetric, type TrendWindow } from '../radar/statistics'
import { Badge, Empty, format, Panel, signed } from './shared'

interface ChartPoint { label: string; value: number | null; position?: number }
export function LineChart({ points, label, unit, tone = 'green', baseline = null, compact = false }: {
  points: ChartPoint[]; label: string; unit: string; tone?: 'green' | 'blue';
  baseline?: number | null; compact?: boolean
}) {
  const gradient = useId()
  const [hover, setHover] = useState<number | null>(null)
  const values = points.flatMap(point => point.value === null ? [] : [point.value])
  if (!values.length) return <Empty title="暂无有效数据" icon={BarChart3} />
  const width = 720
  const height = compact ? 142 : 224
  const padding = { left: 44, right: 18, top: 16, bottom: 24 }
  const plotted = baseline === null ? values : [...values, baseline]
  const span = Math.max((Math.max(...plotted) - Math.min(...plotted)) * 0.17, unit === '分' ? 2 : 0.1)
  const low = Math.max(0, Math.min(...plotted) - span)
  const high = Math.max(...plotted) + span
  const x = (index: number) => padding.left + (width - padding.left - padding.right) * (
    points[index].position ?? (points.length > 1 ? index / (points.length - 1) : 0.5))
  const y = (value: number) => padding.top + (height - padding.top - padding.bottom) * (high - value) / (high - low)
  const floor = height - padding.bottom
  const ticks = Array.from({ length: 4 }, (_, index) => low + (high - low) * index / 3)
  const segments: string[][] = []
  let current: string[] = []
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length) segments.push(current)
      current = []
    } else current.push(x(index) + ' ' + y(point.value))
  })
  if (current.length) segments.push(current)
  const labelCount = Math.min(points.length, compact ? 4 : 6)
  const labelIndexes = Array.from({ length: labelCount }, (_, index) =>
    labelCount <= 1 ? 0 : Math.round(index * (points.length - 1) / (labelCount - 1)))

  const active = hover === null ? undefined : points[Math.min(hover, points.length - 1)]
  const activeIndex = hover === null ? null : Math.min(hover, points.length - 1)
  function move(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const coordinate = (event.clientX - bounds.left) / bounds.width * width
    let nearest = 0
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(x(index) - coordinate) < Math.abs(x(nearest) - coordinate)) nearest = index
    }
    setHover(nearest)
  }
  function key(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'Escape') setHover(null)
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowLeft' ? -1 : 1
    setHover(index => Math.min(points.length - 1, Math.max(0, (index ?? 0) + step)))
  }
  return <div className={'chart chart-' + tone + (compact ? ' chart-compact' : '')}>
    <div className="chart-reading" aria-live="polite">
      {active ? <><strong>{active.label}</strong><span>{active.value === null ? '无有效数据' : format(active.value) + ' ' + unit}</span></> : <span>{unit}</span>}
    </div>
    <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={label + '折线图，方向键可逐点查看'}
      tabIndex={0} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} onKeyDown={key} onBlur={() => setHover(null)}>
      <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="currentColor" stopOpacity=".19" /><stop offset="100%" stopColor="currentColor" stopOpacity=".015" />
      </linearGradient></defs>
      {ticks.map((value, index) => <g key={index}>
        <line className="chart-grid" x1={padding.left} x2={width - padding.right} y1={y(value)} y2={y(value)} />
        <text className="chart-axis" x={padding.left - 10} y={y(value) + 4} textAnchor="end">{format(value)}</text>
      </g>)}
      {baseline !== null && <line className="baseline-line" x1={padding.left} x2={width - padding.right} y1={y(baseline)} y2={y(baseline)} />}
      {segments.map((segment, index) => {
        const left = segment[0].split(' ')[0]
        const right = segment.at(-1)!.split(' ')[0]
        const path = 'M' + segment.join(' L')
        return <g key={index}><path d={path + ' L' + right + ' ' + floor + ' L' + left + ' ' + floor + ' Z'} fill={'url(#' + gradient + ')'} />
          <path className="chart-path" d={path} /></g>
      })}
      {points.map((point, index) => (points.length <= 30 || point.value === null || (points[index - 1]?.value == null && points[index + 1]?.value == null)) &&
        <circle key={index} cx={x(index)} cy={point.value === null ? floor : y(point.value)} r={point.value === null ? 2 : 3.6}
          className={point.value === null ? 'chart-missing' : 'chart-marker'} />)}
      {active && activeIndex !== null && <g>
        <line className="chart-crosshair" x1={x(activeIndex)} x2={x(activeIndex)} y1={padding.top} y2={floor} />
        {active.value !== null && <circle className="chart-marker active" cx={x(activeIndex)} cy={y(active.value)} r="5" />}
      </g>}
      {labelIndexes.map(index => <text className="chart-axis" key={index} x={x(index)} y={height - 5} textAnchor="middle">{points[index].label}</text>)}
    </svg>
  </div>
}

export function TrendPanel({ nights, overview = false, subject = false }: { nights: Night[]; overview?: boolean; subject?: boolean }) {
  const [window, setWindow] = useState<TrendWindow>(7)
  const [metric, setMetric] = useState<TrendMetric>('sleep')
  const [weeksBack, setWeeksBack] = useState(0)
  const latest = nights.at(-1)
  const end = latest ? addDays(latest.date, -7 * weeksBack) : ''
  const result = latest && trends(nights, end, window, metric)
  const { label, unit } = trendMetrics[metric]
  const change = result ? result.change : null
  const maxWeeks = latest && nights[0] ? Math.floor((Date.parse(latest.date) - Date.parse(nights[0].date)) / 604_800_000) : 0
  return <Panel title={overview ? '近 7 晚趋势' : '多夜趋势与基线'}
    detail={result ? result.start + ' 至 ' + result.end + ' · 北京时间' : '按监测结束的当地日期统计'}
    action={result && <Badge tone="muted">{result.validCount} / {window} 晚有效</Badge>}>
    {!overview && <div className="trend-actions">
      {!subject && <div className="segmented" aria-label="趋势范围">
        {trendWindows.map(count => <button key={count} className={window === count ? 'selected' : ''} aria-pressed={window === count} onClick={() => setWindow(count)}>{count} 晚</button>)}
      </div>}
      {subject && <div className="segmented" aria-label="趋势周次">
        <button aria-label="上一周" disabled={weeksBack >= maxWeeks} onClick={() => setWeeksBack(value => value + 1)}><ChevronLeft size={17} /></button>
        <span>{weeksBack === 0 ? '最近 7 晚' : weeksBack + ' 周前'}</span>
        <button aria-label="下一周" disabled={weeksBack === 0} onClick={() => setWeeksBack(value => value - 1)}><ChevronRight size={17} /></button>
      </div>}
    </div>}
    <div className="metric-tabs" aria-label="趋势指标">
      {([['sleep', '睡眠时长'], ['score', '睡眠评分'], ['heart', '夜间心率'], ['respiration', '呼吸频率']] as const).map(([id, name]) =>
        <button key={id} className={metric === id ? 'selected' : ''} aria-pressed={metric === id} onClick={() => setMetric(id)}>{name}</button>)}
    </div>
    {result ? <>
      <LineChart label={label} unit={unit} baseline={overview ? null : result.baseline}
        points={result.points.map(point => ({ label: point.date.slice(5).replace('-', '/'), value: point.value }))} />
      <div className="trend-summary">
        <span><strong>{format(result.mean)}</strong> {unit} · 平均</span>
        <span><strong>{format(result.median)}</strong> {unit} · 中位数</span>
        <span><strong>{signed(change)}</strong> {unit} · 首末变化</span>
      </div>
      {!overview && <div className="note"><Info size={16} /><span>{result.baseline === null
        ? '个人基线需本期之前至少 5 晚有效数据，该指标目前有 ' + result.baselineCount + ' 晚。'
        : '个人基线 ' + format(result.baseline) + ' ' + unit + '，取 ' + result.baselineStart + ' 至 ' + result.baselineEnd +
          ' 最近 5 晚中位数。本期相差 ' + signed(result.delta) + ' ' + unit + '。'}</span></div>}
      <p className="chart-footnote">空心灰点表示该日该指标无有效数据。当前指标有 {result.valueCount} 晚有效读数。</p>
    </> : <Empty title="暂无夜间趋势" message="有监测记录后，这里会显示趋势。" icon={BarChart3} />}
  </Panel>
}

const stageOrder: Stage[] = ['awake', 'rem', 'light', 'deep', 'unknown']
export function SleepTimeline({ night, data }: { night: Night; data: NightDetails }) {
  return <>
    <div className="sleep-timeline" role="img" aria-label="按时间绘制的睡眠分期图">
      <div className="sleep-rows">{stageOrder.map(stage => <span key={stage}>{stageLabel[stage]}</span>)}</div>
      <div className="sleep-bars">
        {stageOrder.map(stage => <div className="sleep-row" key={stage}>
          {data.stages.filter(span => span.stage === stage).map(span => <span key={span.start} className={'stage-block stage-' + span.stage}
            title={stageLabel[span.stage] + ' ' + clock(span.start) + '–' + clock(span.end)}
            style={{ left: (span.start - night.start) / (night.end - night.start) * 100 + '%',
              width: (span.end - span.start) / (night.end - night.start) * 100 + '%' }} />)}
        </div>)}
      </div>
    </div>
    <div className="sleep-axis">{Array.from({ length: 5 }, (_, index) =>
      <span key={index}>{clock(night.start + (night.end - night.start) * index / 4)}</span>)}</div>
  </>
}
