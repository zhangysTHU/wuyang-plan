import { exampleCsv, readRadarCsv } from './adapter'
import { simulateNight } from './simulator'
import { aggregate, details } from './statistics'
import type { Work } from './workerClient'

self.addEventListener('message', async (event: MessageEvent<{ id: number; work: Work }>) => {
  const { id, work } = event.data
  try {
    switch (work.kind) {
      case 'simulate':
        self.postMessage({ id, data: simulateNight(work.patientId, work.date) })
        break
      case 'parse':
        self.postMessage({ id, data: await readRadarCsv(work.input) })
        break
      case 'aggregate':
        self.postMessage({ id, data: aggregate(work.session, work.samples) })
        break
      case 'details':
        self.postMessage({ id, data: details(work.session, work.samples) })
        break
      case 'example':
        self.postMessage({ id, data: exampleCsv(work.patientId, work.date) })
        break
    }
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : '无法处理夜间数据。' })
  }
})
