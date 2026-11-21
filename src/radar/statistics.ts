import {
  addDays, type EventKind, type Night, type NightDetails, type NightEvent,
  type NightMetrics, type NightSession, type RadarSample, type RateStats, type SleepScore,
  type Span, type Stage, type StageSpan, stages,
} from '../domain'

export const interval = 2_000
const minute = 60_000
const clamp = (value: number) => Math.max(0, Math.min(100, value))

function quantile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null
  const index = (sorted.length - 1) * fraction
  const base = Math.floor(index)
  return sorted[base] + (sorted[Math.ceil(index)] - sorted[base]) * (index - base)
}

function rateStats(values: (number | null)[]): RateStats {
  const sorted = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  return {
    count: sorted.length,
    mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
    median: quantile(sorted, 0.5),
    quantiles: [0.05, 0.25, 0.75, 0.95].map(p => quantile(sorted, p)),
  }
}

export function scoreSleep(
  sleepMinutes: number | null, efficiency: number | null, awakeEvents: number,
  waso: number | null, turnRate: number | null, minorRate: number | null, eligible: boolean,
): SleepScore {
  const duration = sleepMinutes === null ? null : clamp(100 - Math.abs(sleepMinutes - 450) / 3)
  const efficiencyScore = efficiency === null ? null : clamp((efficiency - 0.70) / 0.25 * 100)
  const continuity = waso === null ? null : clamp(100 - 2 * awakeEvents - 0.5 * waso)
  const movement = turnRate === null || minorRate === null ? null : clamp(100 - 3 * turnRate - minorRate)
  const total = eligible && duration !== null && efficiencyScore !== null && continuity !== null && movement !== null
    ? Math.round(0.30 * duration + 0.35 * efficiencyScore + 0.25 * continuity + 0.10 * movement)
    : null
  return { version: '0.1', total, duration, efficiency: efficiencyScore, continuity, movement }
}

function addStage(spans: StageSpan[], stage: Stage, start: number, end: number) {
  if (start === end) return
  const last = spans.at(-1)
  if (last?.stage === stage && last.end === start) last.end = end
  else spans.push({ stage, start, end })
}

function spansFor(session: NightSession, samples: RadarSample[]) {
  const stageSpans: StageSpan[] = []
  const gaps: Span[] = []
  const events: NightEvent[] = []
  const byKind: Partial<Record<EventKind, NightEvent>> = {}
  let cursor = session.start
  for (const row of samples) {
    if (row.time > cursor) {
      gaps.push({ start: cursor, end: row.time })
      addStage(stageSpans, 'unknown', cursor, row.time)
    }
    const end = row.time + interval
    addStage(stageSpans, row.stage, row.time, end)
    const tags: EventKind[] = []
    if (row.stage === 'awake') tags.push('awake')
    if (row.apnea === 'apnea_suspected') tags.push('apnea_suspected')
    if (row.movement === 'turn' || row.movement === 'minor_movement') tags.push(row.movement)
    for (const kind of tags) {
      const last = byKind[kind]
      if (last?.end === row.time) {
        last.end = end
        last.count += 1
      } else {
        const next = { kind, start: row.time, end, count: 1 }
        byKind[kind] = next
        events.push(next)
      }
    }
    cursor = end
  }
  if (cursor < session.end) {
    gaps.push({ start: cursor, end: session.end })
    addStage(stageSpans, 'unknown', cursor, session.end)
  }
  return { stageSpans, gaps, events }
}

export function aggregate(session: NightSession, samples: RadarSample[]): NightMetrics {
  const { stageSpans, gaps, events } = spansFor(session, samples)
  const expected = (session.end - session.start) / interval
  const stageMinutes = Object.fromEntries(stages.map(stage => [stage, 0])) as Record<Stage, number>
  const totals = { awake: 0, light: 0, deep: 0, rem: 0, unknown: 0 }
  for (const span of stageSpans) totals[span.stage] += span.end - span.start
  for (const stage of stages) stageMinutes[stage] = totals[stage] / minute

  const sleep = stageSpans.filter(span => span.stage !== 'awake' && span.stage !== 'unknown')
  const first = sleep[0]?.start
  const last = sleep.at(-1)?.end
  const valid = expected - totals.unknown / interval
  const validMinutes = valid * interval / minute
  const sleepMinutes = valid > 0 ? (totals.light + totals.deep + totals.rem) / minute : null
  const efficiency = sleepMinutes === null ? null : sleepMinutes / validMinutes
  const latency = first === undefined ? null : (first - session.start) / minute
  const awakeSpans = stageSpans.filter(span =>
    span.stage === 'awake' && first !== undefined && last !== undefined && span.start >= first && span.end <= last,
  )
  const waso = first === undefined ? null : awakeSpans.reduce((sum, span) => sum + span.end - span.start, 0) / minute
  const eventCounts = { awake: awakeSpans.length, turn: 0, minor_movement: 0, apnea_suspected: 0 }
  let apneaSeconds = 0
  for (const event of events) {
    if (event.kind !== 'awake') eventCounts[event.kind] += 1
    if (event.kind === 'apnea_suspected') apneaSeconds += (event.end - event.start) / 1000
  }
  const turnRate = validMinutes ? eventCounts.turn / (validMinutes / 60) : null
  const minorRate = validMinutes ? eventCounts.minor_movement / (validMinutes / 60) : null

  return {
    version: '1.2.0', expected, observed: samples.length, valid, missing: expected - samples.length, gaps,
    validMinutes, sleepMinutes, efficiency, latency, waso, stageMinutes, eventCounts, apneaSeconds,
    heart: rateStats(samples.map(row => row.heart)),
    respiration: rateStats(samples.map(row => row.respiration)),
    score: scoreSleep(sleepMinutes, efficiency, awakeSpans.length, waso, turnRate, minorRate,
      valid / expected >= 0.8 && validMinutes >= 180),
  }
}

export function details(session: NightSession, samples: RadarSample[]): NightDetails {
  const { stageSpans, events } = spansFor(session, samples)
  const width = Math.max(1, Math.ceil((session.end - session.start) / interval / 360)) * interval
  const points: NightDetails['points'] = []
  let cursor = 0
  for (let start = session.start; start < session.end; start += width) {
    let heartCount = 0
    let respirationCount = 0
    let heart = 0
    let respiration = 0
    while (cursor < samples.length && samples[cursor].time < start + width) {
      const row = samples[cursor++]
      if (row.heart !== null) { heart += row.heart; heartCount += 1 }
      if (row.respiration !== null) { respiration += row.respiration; respirationCount += 1 }
    }
    points.push({
      time: start,
      heart: heartCount ? heart / heartCount : null,
      respiration: respirationCount ? respiration / respirationCount : null,
    })
  }
  return { points, stages: stageSpans, events }
}

export const trendWindows = [3, 7, 14, 30] as const
export type TrendWindow = (typeof trendWindows)[number]
export const trendMetrics = {
  sleep: { label: '估计睡眠时长', unit: '小时', read: (night: Night) => night.metrics.sleepMinutes === null ? null : night.metrics.sleepMinutes / 60 },
  score: { label: '研究性睡眠评分', unit: '分', read: (night: Night) => night.metrics.score.total },
  heart: { label: '平均夜间心率', unit: '次/分', read: (night: Night) => night.metrics.heart.mean },
  respiration: { label: '平均呼吸频率', unit: '次/分', read: (night: Night) => night.metrics.respiration.mean },
}
export type TrendMetric = keyof typeof trendMetrics
export const isValidNight = (night: Night) => night.metrics.score.total !== null
const trendPriority = (night: Night) => Number(isValidNight(night)) * 2 + Number(night.source === 'csv')

export function trends(nights: Night[], end: string, window: TrendWindow, metric: TrendMetric) {
  const start = addDays(end, 1 - window)
  const perDay = new Map<string, Night>()
  for (const night of nights) {
    const current = perDay.get(night.date)
    if (!current || trendPriority(night) > trendPriority(current) ||
      (trendPriority(night) === trendPriority(current) && night.start > current.start)) {
      perDay.set(night.date, night)
    }
  }
  const read = trendMetrics[metric].read
  const points = Array.from({ length: window }, (_, index) => {
    const date = addDays(start, index)
    const night = perDay.get(date)
    const validNight = night && isValidNight(night)
    return { date, value: validNight ? read(night) : null, validNight: Boolean(validNight) }
  })
  const previous = [...perDay.values()].filter(night => night.date < start && isValidNight(night))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  const previousValues = previous.map(read).filter((value): value is number => value !== null).sort((a, b) => a - b)
  const baseline = previousValues.length === 5 ? quantile(previousValues, 0.5) : null
  const values = points.flatMap(point => point.value === null ? [] : [point.value])
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  return {
    start, end, points, mean, median: quantile(values.toSorted((a, b) => a - b), 0.5),
    validCount: points.filter(point => point.validNight).length,
    valueCount: values.length,
    baseline, baselineCount: previousValues.length,
    baselineStart: previous.at(-1)?.date, baselineEnd: previous[0]?.date,
    delta: baseline !== null && mean !== null ? mean - baseline : null,
    change: values.length > 1 ? values[values.length - 1] - values[0] : null,
  }
}
