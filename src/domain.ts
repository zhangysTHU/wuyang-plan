export type Identity =
  | { role: 'admin'; name: string }
  | { role: 'subject'; name: string; patientId: string }

export interface Patient {
  id: string
  name: string
  description: string
  background: string
  synthetic: true
}

export interface Encounter {
  id: string
  patientId: string
  date: string
  title: string
  note: string
}

export interface Document {
  id: string
  encounterId: string
  name: string
  text: string
  source: 'sample' | 'upload' | 'paste'
  addedAt: string
}

export const stages = ['awake', 'light', 'deep', 'rem', 'unknown'] as const
export type Stage = (typeof stages)[number]
export const movements = ['still', 'minor_movement', 'turn', 'unknown'] as const
export type Movement = (typeof movements)[number]
export const apneaLabels = ['normal', 'apnea_suspected', 'unknown'] as const
export type Apnea = (typeof apneaLabels)[number]

export interface RadarSample {
  time: number
  heart: number | null
  respiration: number | null
  stage: Stage
  movement: Movement
  apnea: Apnea
}

export interface NightSession {
  id: string
  patientId: string
  date: string
  start: number
  end: number
  source: 'simulator' | 'csv'
  timezone: 'Asia/Shanghai'
  adapterVersion: string
  simulatorVersion?: string
  sha256?: string
  fileName?: string
  duplicates: number
  synthetic: true
}

export interface Span {
  start: number
  end: number
}

export type EventKind = 'awake' | 'turn' | 'minor_movement' | 'apnea_suspected'
export interface NightEvent extends Span { kind: EventKind; count: number }
export interface StageSpan extends Span { stage: Stage }
export interface RateStats {
  count: number
  mean: number | null
  median: number | null
  quantiles: Array<number | null>
}

export interface SleepScore {
  version: '0.1'
  total: number | null
  duration: number | null
  efficiency: number | null
  continuity: number | null
  movement: number | null
}

export interface NightMetrics {
  version: '1.2.0'
  expected: number
  observed: number
  valid: number
  missing: number
  gaps: Span[]
  validMinutes: number
  sleepMinutes: number | null
  efficiency: number | null
  latency: number | null
  waso: number | null
  stageMinutes: Record<Stage, number>
  eventCounts: Record<EventKind, number>
  apneaSeconds: number
  heart: RateStats
  respiration: RateStats
  score: SleepScore
}

export interface Night extends NightSession {
  metrics: NightMetrics
  updatedAt: string
}

export interface SeriesPoint { time: number; heart: number | null; respiration: number | null }
export interface NightDetails {
  points: SeriesPoint[]
  stages: StageSpan[]
  events: NightEvent[]
}

export interface ImportPreview {
  session: NightSession
  samples: RadarSample[]
  metrics: NightMetrics
}

export type JobKind = 'import' | 'statistics' | 'simulation' | 'morning'
export type JobStatus = 'running' | 'succeeded' | 'failed'
export interface Job {
  id: string
  kind: JobKind
  patientId?: string
  nightId?: string
  status: JobStatus
  startedAt: string
  finishedAt?: string
  message?: string
  inputs?: { nights?: number; endDate?: string }
}

export interface Snapshot {
  patients: Patient[]
  encounters: Encounter[]
  documents: Document[]
  nights: Night[]
  jobs: Job[]
}

export const timezone = 'Asia/Shanghai'
const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, dateStyle: 'short' })
const clockFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
export const localDate = (value: number | Date) => dayFormat.format(value)
const secondsFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
export const clock = (value: number) => clockFormat.format(value)
export const clockSeconds = (value: number) => secondsFormat.format(value)
export const dateTime = (value: string | number) => {
  const time = typeof value === 'string' ? Date.parse(value) : value
  return localDate(time) + ' ' + clock(time)
}
export const addDays = (date: string, count: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + count * 86_400_000).toISOString().slice(0, 10)
export const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value

export const stageLabel: Record<Stage, string> = {
  awake: '清醒', light: '浅睡', deep: '深睡', rem: '快速眼动', unknown: '未知',
}
export const eventLabel: Record<EventKind, string> = {
  awake: '觉醒', turn: '翻身', minor_movement: '轻微体动', apnea_suspected: '疑似呼吸暂停',
}
export const jobLabel: Record<JobKind, string> = {
  simulation: '生成模拟夜晚', import: '导入雷达 CSV', statistics: '逐夜统计', morning: '08:17 晨间统计',
}
export const jobStatus: Record<JobStatus, string> = {
  running: '运行中', succeeded: '已完成', failed: '失败',
}
