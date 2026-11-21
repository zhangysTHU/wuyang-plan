import { openDB, type DBSchema } from 'idb'
import {
  addDays, validDate, type Document, type Encounter, type Identity, type ImportPreview,
  type Job, type Night, type NightSession, type Patient, type RadarSample, type Snapshot,
} from '../domain'
import type { ImportRequest } from '../radar/adapter'
import { seedEnd } from '../radar/simulator'
import { runWork } from '../radar/workerClient'
import type { DashboardData } from './contract'
import { clinicalFixtures, demoIdentities, identityKey } from './fixtures'

interface LocalStore extends DBSchema {
  settings: { key: string; value: boolean }
  patients: { key: string; value: Patient }
  encounters: { key: string; value: Encounter; indexes: { patient: string } }
  documents: { key: string; value: Document }
  nights: { key: string; value: Night; indexes: { patient: string; hash: [string, string] } }
  samples: { key: string; value: RadarSample[] }
  jobs: { key: string; value: Job }
}

let database: ReturnType<typeof openDB<LocalStore>> | undefined
function db() {
  database ??= openDB<LocalStore>('wuyang-demo', 1, {
    upgrade(store) {
      store.createObjectStore('settings')
      store.createObjectStore('patients', { keyPath: 'id' })
      store.createObjectStore('encounters', { keyPath: 'id' }).createIndex('patient', 'patientId')
      store.createObjectStore('documents', { keyPath: 'id' })
      const nights = store.createObjectStore('nights', { keyPath: 'id' })
      nights.createIndex('patient', 'patientId')
      nights.createIndex('hash', ['patientId', 'sha256'], { unique: true })
      store.createObjectStore('samples')
      store.createObjectStore('jobs', { keyPath: 'id' })
    },
  })
  return database
}

const authKey = 'wuyang-demo-session'
function identity(): Identity | null {
  const key = sessionStorage.getItem(authKey)
  return demoIdentities.find(account => identityKey(account) === key) ?? null
}
function requireIdentity() {
  const current = identity()
  if (!current) throw new Error('请先登录演示账号。')
  return current
}
function admin() {
  if (requireIdentity().role !== 'admin') throw new Error('此操作需要管理员身份。')
}
function mayRead(current: Identity, patientId: string) {
  if (current.role === 'subject' && current.patientId !== patientId) throw new Error('无法读取此监测记录。')
}

const events = new EventTarget()
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('wuyang-data')
channel?.addEventListener('message', () => events.dispatchEvent(new Event('change')))
function notify() {
  events.dispatchEvent(new Event('change'))
  channel?.postMessage('change')
}

function ascendingNights(a: Night, b: Night) {
  return a.date.localeCompare(b.date) || a.start - b.start ||
    Number(a.source === 'csv') - Number(b.source === 'csv') || a.id.localeCompare(b.id)
}
const now = () => new Date().toISOString()

async function saveNight(preview: ImportPreview, skipExisting: boolean) {
  const { session, samples, metrics } = preview
  const storage = await db()
  const tx = storage.transaction(['nights', 'samples'], 'readwrite')
  const nights = tx.objectStore('nights')
  const existing = await nights.get(session.id)
  const duplicate = session.sha256 && await nights.index('hash').get([session.patientId, session.sha256])
  if (existing || duplicate) {
    await tx.done
    if (skipExisting) return false
    throw new Error(existing ? '该会话编号已存在，请检查是否重复导入。' : '同一患者已导入此文件（SHA-256 相同）。')
  }
  await Promise.all([
    nights.add({ ...session, metrics, updatedAt: now() }),
    tx.objectStore('samples').add(samples, session.id),
    tx.done,
  ])
  return true
}

let initializing: Promise<void> | undefined
async function seed() {
  const storage = await db()
  if (await storage.get('settings', 'seeded-v1.2')) return
  const fixtures = clinicalFixtures()
  const tx = storage.transaction(['patients', 'encounters', 'documents'], 'readwrite')
  for (const key of ['patients', 'encounters', 'documents'] as const) {
    const store = tx.objectStore(key)
    for (const value of fixtures[key]) await store.put(value)
  }
  await tx.done
  for (const patient of fixtures.patients) {
    for (let offset = -6; offset <= 0; offset += 1) {
      const date = addDays(seedEnd, offset)
      const id = patient.id + '-' + date.replaceAll('-', '') + '-sim'
      if (await storage.get('nights', id)) continue
      await saveNight(await runWork({ kind: 'simulate', patientId: patient.id, date }), true)
    }
  }
  await storage.put('settings', true, 'seeded-v1.2')
}
function ready() {
  initializing ??= seed().catch(error => {
    initializing = undefined
    throw error
  })
  return initializing
}

async function withJob(input: Pick<Job, 'kind' | 'patientId' | 'nightId' | 'inputs'>, run: () => Promise<string>) {
  const store = await db()
  const job: Job = { ...input, id: crypto.randomUUID(), status: 'running', startedAt: now() }
  const execute = async () => {
    await store.put('jobs', job)
    notify()
    try {
      const message = await run()
      await store.put('jobs', { ...job, status: 'succeeded', message, finishedAt: now() })
    } catch (error) {
      await store.put('jobs', {
        ...job, status: 'failed', finishedAt: now(),
        message: error instanceof Error ? error.message : '任务失败，请重试。',
      })
      throw error
    } finally {
      notify()
    }
  }
  if (navigator.locks) await navigator.locks.request('wuyang-job:' + job.id, execute)
  else await execute()
}

async function recoverJobs(jobs: Job[]) {
  const running = jobs.filter(job => job.status === 'running')
  if (!navigator.locks || !running.length) return jobs
  const store = await db()
  await Promise.all(running.map(job => navigator.locks.request('wuyang-job:' + job.id, { ifAvailable: true }, async lock => {
    if (!lock) return
    const latest = await store.get('jobs', job.id)
    if (latest?.status !== 'running') return
    await store.put('jobs', { ...latest, status: 'failed', finishedAt: now(), message: '任务在关闭或刷新页面时中断，可重新运行。' })
  })))
  return store.getAll('jobs')
}

async function updateNight(night: Night) {
  const storage = await db()
  const samples = await storage.get('samples', night.id)
  if (!samples) throw new Error('找不到夜晚原始采样：' + night.id)
  const metrics = await runWork({ kind: 'aggregate', session: night, samples })
  await storage.put('nights', { ...night, metrics, updatedAt: now() })
}

async function addDocument(input: Pick<Document, 'encounterId' | 'name' | 'text' | 'source'>) {
  admin()
  const storage = await db()
  if (!await storage.get('encounters', input.encounterId)) throw new Error('找不到所选的就诊记录。')
  const name = input.name.trim()
  if (!name || !input.text.trim()) throw new Error('请填写文书名称和内容。')
  if (!['paste', 'upload'].includes(input.source)) throw new Error('文书来源不正确。')
  if (new TextEncoder().encode(input.text).length > 1024 * 1024) throw new Error('文书大小不得超过 1 MB。')
  const document = { ...input, name, id: crypto.randomUUID(), addedAt: now() }
  await storage.add('documents', document)
  notify()
  return document
}

export const dataService: DashboardData = {
  getIdentity: identity,
  login(key) {
    const account = demoIdentities.find(candidate => identityKey(candidate) === key)
    if (!account) throw new Error('演示身份不存在。')
    sessionStorage.setItem(authKey, key)
    return account
  },
  logout() { sessionStorage.removeItem(authKey) },
  subscribe(callback) {
    events.addEventListener('change', callback)
    return () => events.removeEventListener('change', callback)
  },
  async snapshot(): Promise<Snapshot> {
    const account = requireIdentity()
    await ready()
    const store = await db()
    if (account.role === 'subject') {
      const [patient, nights] = await Promise.all([
        store.get('patients', account.patientId),
        store.getAllFromIndex('nights', 'patient', account.patientId),
      ])
      return { patients: patient ? [patient] : [], nights: nights.sort(ascendingNights), encounters: [], documents: [], jobs: [] }
    }
    const [patients, encounters, documents, nights, jobs] = await Promise.all([
      store.getAll('patients'), store.getAll('encounters'), store.getAll('documents'),
      store.getAll('nights'), store.getAll('jobs'),
    ])
    return {
      patients, encounters, documents, nights: nights.sort(ascendingNights),
      jobs: (await recoverJobs(jobs)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    }
  },
  async addPatient(input) {
    admin()
    const name = input.name.trim()
    if (!name) throw new Error('请填写患者姓名。')
    const storage = await db()
    const tx = storage.transaction('patients', 'readwrite')
    const keys = await tx.store.getAllKeys()
    const next = Math.max(3, ...keys.map(key => Number(key.slice(1)))) + 1
    const patient: Patient = { ...input, name, id: 'P' + String(next).padStart(3, '0'), synthetic: true }
    await tx.store.add(patient)
    await tx.done
    notify()
    return patient
  },
  async addEncounter(input) {
    admin()
    const title = input.title.trim()
    if (!title || !validDate(input.date)) throw new Error('请填写有效的就诊日期和类型。')
    const storage = await db()
    if (!await storage.get('patients', input.patientId)) throw new Error('患者不存在。')
    const tx = storage.transaction('encounters', 'readwrite')
    const keys = await tx.store.index('patient').getAllKeys(input.patientId)
    const next = Math.max(0, ...keys.map(key => Number(key.split('-V')[1]))) + 1
    const entry = { ...input, title, id: input.patientId + '-V' + String(next).padStart(3, '0') }
    await tx.store.add(entry)
    await tx.done
    notify()
    return entry
  },
  addDocument,
  async prepareImport(input) {
    admin()
    try {
      const preview = await runWork({ kind: 'parse', input })
      if (!(await (await db()).get('patients', input.patientId))) throw new Error('患者不存在。')
      return preview
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CSV 校验失败。'
      const store = await db()
      await store.put('jobs', {
        id: crypto.randomUUID(), kind: 'import', patientId: input.patientId, status: 'failed',
        startedAt: now(), finishedAt: now(), message,
      })
      notify()
      throw error
    }
  },
  async importNight(preview) {
    admin()
    await withJob({ kind: 'import', patientId: preview.session.patientId, nightId: preview.session.id }, async () => {
      await saveNight(preview, false)
      return '已导入 ' + preview.samples.length.toLocaleString('zh-CN') + ' 条采样，并完成统计。'
    })
  },
  async generate(patientId, nights, endDate) {
    admin()
    if (![1, 7, 14].includes(nights) || !validDate(endDate)) throw new Error('请选择有效的日期和生成范围。')
    await withJob({ kind: 'simulation', patientId, inputs: { nights, endDate } }, async () => {
      const store = await db()
      if (!(await store.get('patients', patientId))) throw new Error('患者不存在。')
      let added = 0
      for (let offset = 1 - nights; offset <= 0; offset += 1) {
        const date = addDays(endDate, offset)
        const id = patientId + '-' + date.replaceAll('-', '') + '-sim'
        if (await store.get('nights', id)) continue
        if (await saveNight(await runWork({ kind: 'simulate', patientId, date }), true)) added += 1
      }
      return '新增 ' + added + ' 晚，跳过 ' + (nights - added) + ' 晚已有数据。'
    })
  },
  async nightDetails(id) {
    const account = requireIdentity()
    const storage = await db()
    const night = await storage.get('nights', id)
    if (!night) throw new Error('无法读取此监测记录。')
    mayRead(account, night.patientId)
    const samples = await storage.get('samples', id)
    if (!samples) throw new Error('该夜晚缺少采样记录。')
    return runWork({ kind: 'details', session: night, samples })
  },
  async recalculate(patientId, nightId) {
    admin()
    await withJob({ kind: 'statistics', patientId, nightId }, async () => {
      const storage = await db()
      const nights = (await storage.getAllFromIndex('nights', 'patient', patientId))
        .filter(night => !nightId || night.id === nightId)
      if (!nights.length) throw new Error('所选范围没有可统计的夜晚。')
      for (const night of nights) await updateNight(night)
      return '已重新计算 ' + nights.length + ' 晚的统计和评分。'
    })
  },
  async runMorning() {
    admin()
    await withJob({ kind: 'morning' }, async () => {
      const nights = (await (await db()).getAll('nights')).sort(ascendingNights)
      const latest = new Map<string, Night>()
      for (const night of nights) latest.set(night.patientId, night)
      for (const night of latest.values()) await updateNight(night)
      return '已汇总 ' + latest.size + ' 位患者的最新监测。'
    })
  },
  async example(patientId, date) {
    admin()
    if (!validDate(date)) throw new Error('请选择有效的样例日期。')
    return runWork({ kind: 'example', patientId, date })
  },
  async backup() {
    admin()
    const storage = await db()
    const tx = storage.transaction(['patients', 'encounters', 'documents', 'nights', 'samples', 'jobs'])
    const [patients, encounters, documents, nights, samples, sampleKeys, jobs] = await Promise.all([
      tx.objectStore('patients').getAll(), tx.objectStore('encounters').getAll(),
      tx.objectStore('documents').getAll(), tx.objectStore('nights').getAll(),
      tx.objectStore('samples').getAll(), tx.objectStore('samples').getAllKeys(), tx.objectStore('jobs').getAll(),
      tx.done,
    ])
    const rows = samples.map((data, index) => ({ nightId: sampleKeys[index], data }))
    const payload = { version: '1.2.0', synthetic: true, timeEncoding: 'epoch milliseconds UTC',
      exportedAt: now(), patients, encounters, documents, nights, samples: rows, jobs }
    return new Blob([JSON.stringify(payload)], { type: 'application/json' })
  },
}
