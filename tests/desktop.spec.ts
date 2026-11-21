import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('administrator can record a visit, import data, recover from a bad file and run statistics', async ({ page }) => {
  await page.goto('/admin/patients')
  await page.getByRole('button', { name: '进入工作台' }).click()
  await expect(page.getByRole('heading', { name: '患者与病历', exact: true })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '添加就诊' }).click()
  await page.getByLabel('就诊日期').fill('2026-11-21')
  await page.getByLabel('就诊类型').fill('复查演示')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('button', { name: /复查演示/ })).toBeVisible()
  await page.getByRole('button', { name: '添加文书' }).click()
  await page.getByLabel('UTF-8 TXT 文件').setInputFiles({
    name: '挂号记录.txt', mimeType: 'text/plain', buffer: Buffer.from('演示上传的病历原文'),
  })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('演示上传的病历原文')).toBeVisible()
  await page.getByRole('button', { name: '添加文书' }).click()
  await page.getByRole('button', { name: '粘贴文本' }).click()
  await page.getByLabel('文书名称').fill('门诊记录')
  await page.getByLabel('病历原文').fill('演示粘贴的随访文本')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('演示粘贴的随访文本')).toBeVisible()
  await page.reload()
  await expect(page.getByText('演示粘贴的随访文本')).toBeVisible()
  await expect(page.getByText('分析服务待接入')).toBeVisible()

  await page.getByRole('link', { name: '监测数据', exact: true }).click()
  await expect(page.getByText('14,400 条').first()).toBeVisible()
  await page.getByRole('button', { name: '生成模拟数据' }).click()
  await page.getByLabel('生成范围').selectOption('14')
  await page.getByRole('dialog').getByRole('button', { name: '生成模拟数据' }).click()
  await expect(page.getByText('生成任务已完成。')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('14 晚 · 模拟数据')).toBeVisible()
  await expect(page.getByText(/个人基线 .*取 /)).toBeVisible()

  await page.getByRole('button', { name: '导入 2 秒 CSV' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('标准 CSV 文件').setInputFiles({
    name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('bad,columns\n1,2'),
  })
  await dialog.getByRole('button', { name: '校验并预览' }).click()
  await expect(dialog.getByRole('alert')).toContainText('CSV 表头')
  const downloaded = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '下载 CSV 样例' }).click()
  const file = await downloaded
  const input = {
    name: file.suggestedFilename(), mimeType: 'text/csv',
    buffer: await readFile((await file.path())!),
  }
  await dialog.getByLabel('标准 CSV 文件').setInputFiles(input)
  await dialog.getByRole('button', { name: '校验并预览' }).click()
  await expect(dialog.getByText('导入预览')).toBeVisible()
  await expect(dialog.getByText(/预计 14,400 条/)).toBeVisible()
  await dialog.getByRole('button', { name: '确认导入' }).click()
  await expect(page.getByText('CSV 已导入并生成统计。')).toBeVisible()
  await expect(page.getByLabel('监测夜晚').locator('option:checked')).toContainText('CSV 导入')
  await page.getByRole('button', { name: '重算统计与评分' }).click()
  await expect(page.getByText('逐夜统计与评分已更新。')).toBeVisible()

  await page.getByRole('button', { name: '导入 2 秒 CSV' }).click()
  await dialog.getByLabel('标准 CSV 文件').setInputFiles(input)
  await dialog.getByRole('button', { name: '校验并预览' }).click()
  await dialog.getByRole('button', { name: '确认导入' }).click()
  await expect(dialog.getByRole('alert')).toContainText('该会话编号已存在')
  await dialog.getByRole('button', { name: '关闭' }).click()

  await page.getByRole('link', { name: '任务与设置', exact: true }).click()
  await expect(page.getByText('该会话编号已存在，请检查是否重复导入。')).toBeVisible()
  await page.getByRole('button', { name: '模拟晨间统计' }).click()
  await expect(page.getByText('晨间统计已完成。')).toBeVisible()
  await page.getByRole('button', { name: '运行统计' }).click()
  await expect(page.getByText('统计任务已完成。')).toBeVisible()
  const backupDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份' }).click()
  const backup = await backupDownload
  const payload = JSON.parse(await readFile((await backup.path())!, 'utf8'))
  expect(payload.synthetic).toBe(true)
  expect(payload.nights).toHaveLength(29)
  expect(payload.documents).toHaveLength(20)
  await page.getByRole('link', { name: '健康报告', exact: true }).click()
  await expect(page.getByText('分析服务待接入')).toBeVisible()
  await page.getByRole('link', { name: '患者与病历', exact: true }).click()
  await page.getByRole('button', { name: '新建演示患者' }).click()
  await page.getByLabel('患者姓名').fill('新建示例')
  await page.getByLabel('随访摘要').fill('睡眠随访')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('heading', { name: '新建示例 · P004' })).toBeVisible()
  await expect(page.getByText('暂无就诊')).toBeVisible()
  await page.goto('/admin/monitoring?night=P002-20261120-sim')
  await expect(page.getByLabel('当前患者')).toHaveValue('P002')
  await expect(page.getByLabel('监测夜晚')).toHaveValue('P002-20261120-sim')
  await expect(page.getByRole('heading', { name: '睡眠结构' })).toBeVisible()
})
