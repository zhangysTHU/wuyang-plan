import Papa from 'papaparse'
import {
  addDays, apneaLabels, localDate, movements, stages, timezone, validDate,
  type ImportPreview, type NightSession, type RadarSample,
} from '../domain'
import { aggregate, interval } from './statistics'

export const radarColumns = [
  'patient_id', 'night_id', 'timestamp', 'heart_rate', 'respiratory_rate',
  'apnea_class', 'movement_class', 'sleep_stage',
] as const
export interface ImportRequest {
  patientId: string
  file: File
  sessionStart?: string
  sessionEnd?: string
}

const timestampPattern = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const maxDuration = 24 * 60 * 60 * 1000
function timestamp(input: string) {
  const match = timestampPattern.exec(input)
  return match && validDate(match[1]) ? Date.parse(input) : NaN
}

export async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function parseStandardCsv(
  text: string, patientId: string, metadata: { fileName: string; hash: string; sessionStart?: string; sessionEnd?: string },
): ImportPreview {
  const parsed = Papa.parse<string[]>(text, { delimiter: ',', skipEmptyLines: 'greedy' })
  if (parsed.errors.length) throw new Error('CSV 格式错误：' + parsed.errors[0].message)
  const [first, ...rows] = parsed.data
  const columns = first?.map(name => name.trim())
  if (!columns || new Set(columns).size !== columns.length || radarColumns.some(name => !columns.includes(name))) {
    throw new Error('CSV 表头缺失必需字段或包含重复字段。')
  }
  if (!rows.length) throw new Error('CSV 中没有采样记录。')
  const indexes = radarColumns.map(name => columns.indexOf(name))
  const byTime = new Map<number, RadarSample>()
  let nightId = ''
  let duplicates = 0

  rows.forEach((row, index) => {
    const location = '数据第 ' + (index + 1) + ' 行：'
    if (row.length !== columns.length) throw new Error(location + '字段数与表头不一致。')
    const [owner, id, rawTime, rawHeart, rawRespiration, apnea, movement, stage] =
      indexes.map(position => row[position].trim())
    if (owner !== patientId) throw new Error(location + '患者编号与当前选择不一致。')
    if (!/^[\p{L}\p{N}_.-]{1,80}$/u.test(id)) throw new Error(location + '夜晚编号无效。')
    if (nightId && id !== nightId) throw new Error(location + '单个 CSV 只能包含一个会话。')
    nightId = id
    const time = timestamp(rawTime)
    if (!Number.isFinite(time)) throw new Error(location + 'timestamp 须为含明确时区的 ISO 8601 时间。')
    const rate = (raw: string, integer: boolean) => {
      if (!raw || raw.toLowerCase() === 'null') return null
      const value = Number(raw)
      if (!/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
        throw new Error(location + '心率或呼吸频率格式不正确。')
      }
      return value
    }
    const stageValue = stages.find(value => value === stage)
    const movementValue = movements.find(value => value === movement)
    const apneaValue = apneaLabels.find(value => value === apnea)
    if (!stageValue || !movementValue || !apneaValue) throw new Error(location + '分类字段含无效枚举。')
    const sample = {
      time, heart: rate(rawHeart, true), respiration: rate(rawRespiration, false),
      stage: stageValue, movement: movementValue, apnea: apneaValue,
    }
    const existing = byTime.get(time)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(sample)) throw new Error(location + '同一时间点含互相冲突的数据。')
      duplicates += 1
    } else {
      byTime.set(time, sample)
    }
  })
  const samples = [...byTime.values()].sort((a, b) => a.time - b.time)
  const start = metadata.sessionStart ? timestamp(metadata.sessionStart) : samples[0].time
  const end = metadata.sessionEnd ? timestamp(metadata.sessionEnd) : samples[samples.length - 1].time + interval
  if (Boolean(metadata.sessionStart) !== Boolean(metadata.sessionEnd) || !Number.isFinite(start) ||
    !Number.isFinite(end) || end <= start || end - start > maxDuration || (end - start) % interval !== 0) {
    throw new Error('会话起止必须成对填写，使用有效时区，且为不超过 24 小时的 2 秒整数倍区间。')
  }
  if (samples.some(row => row.time < start || row.time + interval > end || (row.time - start) % interval !== 0)) {
    throw new Error('部分采样点越过会话边界，或未对齐 2 秒采样间隔。')
  }
  const session: NightSession = {
    id: nightId, patientId, start, end, date: localDate(end), source: 'csv', timezone,
    adapterVersion: 'standard-csv/1.2', sha256: metadata.hash, fileName: metadata.fileName,
    duplicates, synthetic: true,
  }
  return { session, samples, metrics: aggregate(session, samples) }
}

export async function readRadarCsv(input: ImportRequest) {
  if (input.file.size > 20 * 1024 * 1024) throw new Error('请选择不超过 20 MB 的夜间 CSV 文件。')
  const bytes = await input.file.arrayBuffer()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('CSV 无法按 UTF-8 解码。')
  }
  return parseStandardCsv(text, input.patientId, {
    fileName: input.file.name, hash: await sha256(bytes),
    sessionStart: input.sessionStart, sessionEnd: input.sessionEnd,
  })
}

export function exampleCsv(patientId: string, date: string) {
  const start = Date.parse(addDays(date, -1) + 'T23:00:00+08:00')
  const id = patientId + '-' + date.replaceAll('-', '') + '-csv'
  const rows = Array.from({ length: 14_400 }, (_, index) => {
    const stage = index < 480 ? 'awake' : index % 1450 < 280 ? 'deep' : index % 1450 > 1000 ? 'rem' : 'light'
    return [patientId, id, new Date(start + index * interval).toISOString(),
      59 + index % 5, 14 + (index % 12) / 10, 'normal', 'still', stage].join(',')
  })
  return radarColumns.join(',') + '\n' + rows.join('\n') + '\n'
}
