# 无恙计划 V1.2

居家夜间健康监测前端。管理员可以管理演示患者及病历、导入或生成夜间数据并重算睡眠统计。受试者可以查看本人监测、趋势与个人档案。分析报告及结构化病历显示「分析服务待接入」。

## 本地运行

使用 Node.js 24 和 npm。

```sh
npm ci
npm run dev
```

打开终端显示的本地网址，选择研究管理员或 P001–P003 受试者。登录状态随当前标签页保留，业务记录保存在该浏览器的 IndexedDB。开发环境和构建预览使用不同端口时各有独立数据。公开演示包仅使用项目虚构资料。正式的数据保密和角色授权需要服务端会话和患者级访问校验。

默认提供 3 位患者、12 次就诊、18 份文书和每人 7 晚固定种子数据。在监测数据页可生成 14 晚以查看个人基线，或下载标准 CSV 样例，校验后导入。文件须为 UTF-8，同一文件仅包含一个病人的一晚会话。可用显式起止时间检测首尾缺失。

## 构建与检查

```sh
npm test
npm run build
npm run preview
```

浏览器测试在构建完成后执行。使用 Playwright Chromium 时先运行 `npx playwright install chromium`，再运行 `npm run test:e2e`。如本机已安装 Edge，可设置 `WUYANG_TEST_EDGE=1` 使用 Edge 执行相同测试。

## 公开部署

将前端源码及 `data/demo/病历` 下的既有演示资料提交至 GitHub，再在 Cloudflare Pages 选择连接该仓库。生产分支为 `main`，根目录使用仓库根，构建命令为 `npm run build`，发布目录为 `dist`，环境设置 `NODE_VERSION=24`。Pages Git 集成安装锁定依赖，并在推送时自动部署。Pages 的 SPA 回退可直接打开角色页和监测详情链接。 [Git 集成](https://developers.cloudflare.com/pages/configuration/git-integration/) · [SPA 回退](https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering)

## 数据契约

`src/data/contract.ts` 定义页面的数据服务接口、未来 API 响应和任务返回结构，`src/data/local.ts` 提供本地适配。未来的同源服务沿用 V1.2 的 `/api/auth/*`、`/api/patients/*`、`/api/encounters/*`、`/api/nights/*`、`/api/jobs/*` 和受试者专属 `/api/me/*` 路径。HTTP 响应使用 `data`、`error`、`request_id`，任务提交返回 `job_id` 和状态。后端按 Cookie 会话确定身份与患者归属，接入后对可见视图每 60 秒重新查询，回到前台和提交成功后立即刷新。

`src/radar/adapter.ts` 将标准 CSV 转为统一的会话和采样格式。字段为：

```csv
patient_id,night_id,timestamp,heart_rate,respiratory_rate,apnea_class,movement_class,sleep_stage
P001,P001-example,2026-11-21T23:00:00+08:00,64,15.7,normal,still,light
```

时间戳使用带时区的 ISO 8601，采样间隔为 2 秒。心率为整数，呼吸频率为数值，两者均接受空值。分类枚举见 `src/domain.ts`。浏览器内部和备份使用 UTC Unix 毫秒，北京时间会话结束日作为睡眠日期。未来的设备格式可新增适配器，复用统计和图表。有效监测时长按已知分期样本计算，心率及呼吸频率各按自身有效读数汇总。同一患者同日有多次监测时，趋势优先使用有效会话。有效性相同时，先选导入会话，同来源取开始时间较晚的一次。
