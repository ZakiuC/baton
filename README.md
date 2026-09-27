# Baton 执筹

> 本地多项目并行管理工作台

**Baton**（指挥棒）寓意同时指挥多条线；**执筹**取自「运筹」「统筹」，即筹划与调度多件事。
它是一个**纯本地**运行的桌面工作台：把多个项目的任务放进看板按阶段流转，遇到卡点记录阻塞原因，
解决后自动回到进行中。所有数据保存在本机的一个 SQLite 文件里，**不联网、不上传**，
删除一律是可恢复的归档。

![应用图标](src/app/icon.svg)

## 主要功能

| 功能 | 说明 |
|---|---|
| **仪表盘** | 一眼看到进行中、被阻塞、今日到期的任务，以及每个项目的进度与最近动态 |
| **看板** | 待办 / 进行中 / 阻塞 / 已完成四列拖拽流转，支持键盘操作与屏幕阅读器播报 |
| **时间线** | 按周铺开带截止日期的任务；没有截止日期的「长期任务」单独成列，不会被遗漏 |
| **阻塞闭环** | 标记阻塞必须写清原因；最后一个阻塞被解决时，任务自动回到进行中 |
| **可恢复归档** | 项目与任务只归档、不物理删除，随时可在设置页恢复，历史记录完整保留 |
| **主题** | 13 套主题（默认 + 6 暗色 + 6 亮色），选择结果保存在本机配置里 |

## 技术架构

```
Electron 主进程 (electron/main.js)
  ├─ 单实例锁 · 系统托盘 · 开机自启
  ├─ settings.json 原子写（tmp + fsync + rename）
  └─ spawn 随包 Node 运行 standalone 服务
       ↓ 127.0.0.1:3099（仅本机监听）
Next.js 16 App Router（客户端页面 + API 路由）
       ↓
src/lib/queries/*（唯一业务逻辑与校验层）
       ↓
src/lib/db.ts —— sql.js（SQLite WASM）内存库，每次写事务后整库原子落盘
```

- **数据存储**：`sql.js`（SQLite WASM），单文件 `tracker.db`；事务前导出快照、失败即回滚；
  落盘采用临时文件 + `fsync` + 原子替换，并保留 `.bak`。
- **样式**：Tailwind CSS v4 + CSS 变量主题令牌，令牌一致性有自动校验。
- **数据位置**：`%APPDATA%\baton\data\tracker.db`

## 环境要求

- Node.js 20+（开发用）
- Windows 10/11 x64（打包目标）

## 快速开始

```bash
npm install
npm run dev            # 浏览器开发模式，http://localhost:3000
npm run dev:electron   # Electron + 开发服务器，数据目录隔离在 .dev-data
```

## 构建与打包

```bash
npm run build              # Next.js 生产构建（含 standalone 资源准备）
npm run build:electron:dir # 打包为免安装目录 → 系统临时目录
npm run build:icon         # 重新生成图标（改过 src/app/icon*.svg 后执行）
```

打包产物输出到系统临时目录下的时间戳目录，**不会覆盖 `release/`**；
确认无误后再手动替换 `release/win-unpacked`。

## 质量门禁

```bash
npm run verify    # 发版前必须全绿：类型 → Lint → 主题令牌 → 版本 → 构建 → API 回归 → UI 冒烟
```

单独执行：

| 命令 | 内容 |
|---|---|
| `npm run verify:static` | TypeScript、ESLint、主题令牌一致性、版本号一致性 |
| `npm run test:api:built` | 隔离数据目录下的 API 回归 |
| `npm run test:ui:built` | 真实 Electron 窗口的 UI 冒烟（多视口、焦点管理、无障碍、主题对比度） |
| `npm run check:version` | 版本号与更新记录格式，并要求存在对应 git tag |

测试一律使用隔离数据目录，**任何脚本都不会把真实数据库当作可写库**。

## 版本与更新记录

版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。更新记录的唯一来源是
[`src/lib/version.ts`](src/lib/version.ts) 的 `CHANGELOG` 常量（应用内「关于」页直接渲染它），
不在仓库里另建变更日志文件，避免两份记录漂移。

完整规范见 [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)：版本号规则、提交信息格式、
分支策略、发版流程、质量门禁与目录职责。

## 目录结构

| 路径 | 内容 |
|---|---|
| `src/app/` | 页面与 API 路由（App Router） |
| `src/components/` | UI 组件（`shared` / `board` / `dashboard` / `forms`） |
| `src/lib/queries/` | 业务逻辑与校验（唯一的数据访问层） |
| `src/lib/db.ts` | 数据库连接、事务与 schema 迁移 |
| `src/lib/version.ts` | 版本号与更新记录（单一真源） |
| `electron/` | 桌面外壳：主进程、preload、图标 |
| `scripts/` | 构建、打包、校验与冒烟脚本 |
| `docs/` | 规范与说明文档 |

## 数据安全提醒

数据库位于 `%APPDATA%\baton\data\`，当前版本**不会自动轮转备份**。
`data/backups/` 下的备份是历次迁移或修复时手动生成的，建议定期自行复制一份。

## 许可

未声明开源许可证。如需对外分发或允许他人使用，请先补充 `LICENSE`。
