import type { Document, Encounter, Identity, Patient } from '../domain'

const texts = import.meta.glob<string>([
  '../../data/demo/病历/P001/P001_患者背景档案.txt',
  '../../data/demo/病历/P001/P001-V001-D01_入院大病历.txt',
  '../../data/demo/病历/P001/P001-V001-D02_出院记录.txt',
  '../../data/demo/病历/P001/P001-V002-D01_门诊复诊记录.txt',
  '../../data/demo/病历/P001/P001-V003-D01_入院大病历.txt',
  '../../data/demo/病历/P001/P001-V003-D02_出院记录.txt',
  '../../data/demo/病历/P001/P001-V004-D01_门诊随访记录.txt',
  '../../data/demo/病历/P002/P002_患者背景档案.txt',
  '../../data/demo/病历/P002/P002-V001-D01_入院大病历.txt',
  '../../data/demo/病历/P002/P002-V001-D02_冠状动脉介入记录.txt',
  '../../data/demo/病历/P002/P002-V001-D03_出院记录.txt',
  '../../data/demo/病历/P002/P002-V002-D01_门诊复诊记录.txt',
  '../../data/demo/病历/P002/P002-V003-D01_心功能再评估记录.txt',
  '../../data/demo/病历/P002/P002-V004-D01_门诊随访记录.txt',
  '../../data/demo/病历/P003/P003_患者背景档案.txt',
  '../../data/demo/病历/P003/P003-V001-D01_门诊首诊记录.txt',
  '../../data/demo/病历/P003/P003-V002-D01_睡眠专科评估记录.txt',
  '../../data/demo/病历/P003/P003-V003-D01_入院大病历.txt',
  '../../data/demo/病历/P003/P003-V003-D02_多导睡眠监测报告.txt',
  '../../data/demo/病历/P003/P003-V003-D03_出院记录.txt',
  '../../data/demo/病历/P003/P003-V004-D01_睡眠专科随访记录.txt',
], { eager: true, query: '?raw', import: 'default' })

const catalog = [
  { id: 'P001', name: '陆明远', description: '血压与代谢随访', dates: ['2024-03-11', '2024-10-16', '2025-08-18', '2026-11-12'], titles: ['首次住院', '门诊复诊', '再次住院', '门诊随访'], counts: [2, 1, 2, 1] },
  { id: 'P002', name: '沈维舟', description: '冠心病与心功能随访', dates: ['2023-06-19', '2024-02-22', '2025-09-17', '2026-11-13'], titles: ['心内科住院', '门诊复诊', '心功能再评估', '门诊随访'], counts: [3, 1, 1, 1] },
  { id: 'P003', name: '贺嘉树', description: '睡眠呼吸专科随访', dates: ['2024-09-09', '2025-04-15', '2026-05-18', '2026-10-20'], titles: ['门诊首诊', '睡眠专科评估', '住院睡眠监测', '睡眠专科随访'], counts: [1, 1, 3, 1] },
]

export const demoIdentities: Identity[] = [
  { role: 'admin', name: '研究管理员' },
  ...catalog.map(({ id, name }) => ({ role: 'subject' as const, name, patientId: id })),
]
export const identityKey = (identity: Identity) => identity.role === 'admin' ? 'admin' : identity.patientId

function original(prefix: string) {
  const matches = Object.entries(texts).filter(([path]) => path.split('/').at(-1)?.startsWith(prefix + '_'))
  if (matches.length !== 1) throw new Error('演示资料缺少唯一文件：' + prefix)
  const [path, text] = matches[0]
  return { name: path.split('/').at(-1)!, text: text.replace(/^\uFEFF/, '') }
}

export function clinicalFixtures() {
  const patients: Patient[] = []
  const encounters: Encounter[] = []
  const documents: Document[] = []
  for (const entry of catalog) {
    patients.push({
      id: entry.id, name: entry.name, description: entry.description,
      background: original(entry.id).text, synthetic: true,
    })
    entry.dates.forEach((date, index) => {
      const id = entry.id + '-V00' + (index + 1)
      encounters.push({ id, patientId: entry.id, date, title: entry.titles[index], note: '' })
      for (let number = 1; number <= entry.counts[index]; number += 1) {
        const documentId = id + '-D0' + number
        documents.push({
          id: documentId, encounterId: id, ...original(documentId),
          source: 'sample', addedAt: new Date(date + 'T09:00:00+08:00').toISOString(),
        })
      }
    })
  }
  return { patients, encounters, documents }
}
