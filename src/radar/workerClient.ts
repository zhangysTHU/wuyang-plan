import type { ImportPreview, NightDetails, NightMetrics, NightSession, RadarSample } from '../domain'
import type { ImportRequest } from './adapter'

export type Work =
  | { kind: 'simulate' | 'example'; patientId: string; date: string }
  | { kind: 'parse'; input: ImportRequest }
  | { kind: 'aggregate' | 'details'; session: NightSession; samples: RadarSample[] }

interface Results {
  simulate: ImportPreview
  example: string
  parse: ImportPreview
  aggregate: NightMetrics
  details: NightDetails
}

let worker: Worker | undefined
let sequence = 0
const pending = new Map<number, { resolve: (value: Results[keyof Results]) => void; reject: (error: Error) => void }>()

function openWorker() {
  const instance = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  instance.onmessage = ({ data: payload }) => {
    const request = pending.get(payload.id)
    if (!request) return
    pending.delete(payload.id)
    if ('error' in payload) request.reject(new Error(payload.error))
    else request.resolve(payload.data)
  }
  const fail = () => {
    for (const request of pending.values()) request.reject(new Error('夜间数据处理进程异常，请重试。'))
    pending.clear()
    instance.terminate()
    worker = undefined
  }
  instance.onerror = fail
  instance.onmessageerror = fail
  return instance
}

export function runWork<K extends keyof Results>(work: Work & { kind: K }): Promise<Results[K]> {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    worker ??= openWorker()
    pending.set(id, { resolve: value => resolve(value as Results[K]), reject })
    try {
      worker.postMessage({ id, work })
    } catch (error) {
      pending.delete(id)
      reject(error)
    }
  })
}
