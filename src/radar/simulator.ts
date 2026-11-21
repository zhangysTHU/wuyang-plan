import { addDays, timezone, type ImportPreview, type NightSession, type RadarSample } from '../domain'
import { aggregate, interval } from './statistics'

export const seedEnd = '2026-11-21'
function randomGenerator(key: string) {
  let seed = 2166136261
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619)
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

export function simulateNight(patientId: string, date: string): ImportPreview {
  const rng = randomGenerator(patientId + ':' + date)
  const id = patientId + '-' + date.replaceAll('-', '') + '-sim'
  const start = Date.parse(addDays(date, -1) + 'T23:00:00+08:00')
  const end = start + 8 * 60 * 60 * 1000
  const session: NightSession = {
    id, patientId, date, start, end, timezone, synthetic: true, duplicates: 0,
    source: 'simulator', adapterVersion: 'standard/1.2', simulatorVersion: '1.2.0',
  }
  const variable = patientId === 'P003'
  const stable = patientId === 'P002'
  const rise = patientId === 'P001' && date >= addDays(seedEnd, -2) && date <= seedEnd ? 5 : 0
  const nightly = (rng() - 0.5) * (stable ? 2 : 5)
  const latency = (9 + Math.floor(rng() * (variable ? 23 : 10))) * 30
  const earlyWake = Math.floor(rng() * (variable ? 22 : 12)) * 30
  const cycleOffset = Math.floor(rng() * 280)
  let movementLeft = 0
  let apneaLeft = 0
  let awakeningLeft = 0
  let movementKind: RadarSample['movement'] = 'still'
  const samples: RadarSample[] = []
  for (let index = 0; index < 14_400; index += 1) {
    const cycle = (index + cycleOffset) % 2590
    const awake = index < latency || index >= 14_400 - earlyWake
    if (rng() < (variable ? 0.0009 : 0.00028)) awakeningLeft = 8 + Math.floor(rng() * 75)
    const stage = awake || awakeningLeft > 0 ? 'awake'
      : cycle > 2070 ? 'rem' : cycle >= 630 && cycle < (index < 7000 ? 1260 : 900) ? 'deep' : 'light'
    if (movementLeft <= 0 && rng() < (variable ? 0.003 : 0.0012)) {
      movementLeft = 2 + Math.floor(rng() * 4)
      movementKind = rng() < 0.27 ? 'turn' : 'minor_movement'
    }
    if (apneaLeft <= 0 && stage !== 'awake' && rng() < (variable ? 0.001 : 0.00007)) {
      apneaLeft = 3 + Math.floor(rng() * 6)
    }
    const oscillation = Math.sin(index / 390) * 2.3 + Math.sin(index / 94)
    const heart = Math.round((stable ? 59 : variable ? 65 : 61) + rise + nightly + oscillation +
      (stage === 'awake' ? 7 : stage === 'deep' ? -3 : 0) + (rng() - 0.5) * 3)
    const respiration = Math.round(((variable ? 16 : 14.7) + nightly * 0.28 + oscillation * 0.23 +
      (stage === 'awake' ? 1.2 : 0) + (rng() - 0.5) * 1.5) * 10) / 10
    samples.push({
      time: start + index * interval, heart, respiration, stage,
      movement: movementLeft > 0 ? movementKind : 'still',
      apnea: apneaLeft > 0 ? 'apnea_suspected' : 'normal',
    })
    movementLeft -= 1
    apneaLeft -= 1
    awakeningLeft -= 1
  }
  return { session, samples, metrics: aggregate(session, samples) }
}
