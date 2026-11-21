import assert from 'node:assert/strict'
import test from 'node:test'
import { addDays, type Night } from '../src/domain'
import { exampleCsv, parseStandardCsv, radarColumns } from '../src/radar/adapter'
import { seedEnd, simulateNight } from '../src/radar/simulator'
import { aggregate, details, scoreSleep, trends } from '../src/radar/statistics'

const metadata = { fileName: 'test.csv', hash: 'fixture' }
const start = '2026-11-20T23:59:56+08:00'
const rows = [
  ['P001', 'test-night', start, '65', '14.6', 'apnea_suspected', 'still', 'deep'],
  ['P001', 'test-night', '2026-11-20T15:59:58Z', '67', '15', 'apnea_suspected', 'still', 'deep'],
  ['P001', 'test-night', '2026-11-21T00:00:02+08:00', '', 'null', 'apnea_suspected', 'turn', 'unknown'],
]
const csv = (data: string[][]) => [radarColumns.join(','), ...data.map(row => row.join(','))].join('\n')

test('a seeded night is repeatable and spans 14,400 aligned samples across midnight', () => {
  const { session, samples, metrics } = simulateNight('P001', seedEnd)
  assert.equal(samples.length, 14_400)
  assert.equal(session.date, '2026-11-21')
  assert.equal(new Date(session.start).toISOString(), '2026-11-20T15:00:00.000Z')
  assert.equal(samples[0].time, session.start)
  assert.equal(samples.at(-1)!.time + 2000, session.end)
  assert(samples.slice(1).every((row, i) => row.time - samples[i].time === 2000))
  assert.deepEqual(metrics, simulateNight('P001', seedEnd).metrics)
  assert.equal(metrics.expected, 14_400)
  assert.equal(metrics.validMinutes, 480)
  assert(Math.abs(Object.values(metrics.stageMinutes).reduce((sum, value) => sum + value, 0) - 480) < 1e-8)
  assert(Math.abs(metrics.sleepMinutes! - metrics.stageMinutes.light - metrics.stageMinutes.deep - metrics.stageMinutes.rem) < 1e-8)
  assert(details(session, samples).points.length <= 360)
})

test('CSV accepts explicit offsets and UTC, normalizes duplicates and preserves gaps', () => {
  const input = parseStandardCsv(csv([rows[2], rows[0], rows[1], rows[0]]), 'P001', metadata)
  const { session, samples, metrics } = input
  assert.equal(session.date, '2026-11-21')
  assert.equal(session.duplicates, 1)
  assert.deepEqual(samples.map(row => row.time), samples.map(row => row.time).toSorted((a, b) => a - b))
  assert.equal(metrics.expected, 4)
  assert.equal(metrics.missing, 1)
  assert.equal(metrics.valid, 2)
  assert.equal(metrics.score.total, null)
  assert.equal(metrics.apneaSeconds, 6)
  assert.equal(metrics.eventCounts.apnea_suspected, 2)
  assert.equal(metrics.heart.mean, 66)
  assert.deepEqual(metrics.heart.quantiles, [65.1, 65.5, 66.5, 66.9])
  assert.equal(details(session, samples).points[2].heart, null)
  const bounded = parseStandardCsv(csv(rows), 'P001', {
    ...metadata, sessionStart: '2026-11-20T23:59:54+08:00', sessionEnd: '2026-11-21T00:00:06+08:00',
  })
  assert.equal(bounded.metrics.missing, 3)
  assert.equal(bounded.metrics.gaps.length, 3)
})

test('CSV rejects another patient, malformed data and conflicts', () => {
  assert.throws(() => parseStandardCsv(csv(rows), 'P002', metadata), /患者编号/)
  assert.throws(() => parseStandardCsv(csv([rows[0], rows[0].map((value, index) => index === 3 ? '74' : value)]), 'P001', metadata), /冲突/)
  assert.throws(() => parseStandardCsv(csv([rows[0].map((value, index) => index === 2 ? '2026-02-30T23:59:56+08:00' : value)]), 'P001', metadata), /timestamp/)
  assert.throws(() => parseStandardCsv(csv(rows), 'P001', { ...metadata, sessionStart: start }), /成对填写/)
  assert.throws(() => parseStandardCsv(csv(rows), 'P001', {
    ...metadata, sessionStart: '2026-11-21T00:00:00+08:00', sessionEnd: '2026-11-21T00:00:04+08:00',
  }), /边界/)
})

test('a full downloadable CSV has valid metrics and the score follows the four dimensions', () => {
  const { metrics } = parseStandardCsv(exampleCsv('P002', seedEnd), 'P002', metadata)
  assert.equal(metrics.valid, 14_400)
  assert.equal(scoreSleep(450, 0.9, 3, 12, 2, 4, true).total, 89)
  assert.equal(scoreSleep(450, 0.9, 3, 12, 2, 4, false).total, null)
  const { session, samples } = simulateNight('P002', seedEnd)
  assert.equal(aggregate(session, samples.slice(0, 11_519)).score.total, null)
  assert.notEqual(aggregate(session, samples.slice(0, 11_520)).score.total, null)
  assert.equal(aggregate({ ...session, end: session.start + 179 * 60_000 }, samples.slice(0, 179 * 30)).score.total, null)
})

test('rolling trends carry missing calendar days and use only the 5 preceding valid nights for baseline', () => {
  const nights: Night[] = Array.from({ length: 14 }, (_, index) => {
    const { session, metrics } = simulateNight('P001', addDays(seedEnd, index - 13))
    return { ...session, metrics, updatedAt: '2026-11-21T00:00:00Z' }
  })
  const current = trends(nights, seedEnd, 7, 'heart')
  const expected = nights.slice(2, 7).map(night => night.metrics.heart.mean!).sort((a, b) => a - b)[2]
  assert.equal(current.baseline, expected)
  assert.equal(current.validCount, 7)
  assert.equal(current.baselineCount, 5)
  const sparse = trends(nights.slice(9), seedEnd, 14, 'score')
  assert.equal(sparse.validCount, 5)
  assert.equal(sparse.points[0].value, null)
  assert.equal(sparse.baseline, null)
})
