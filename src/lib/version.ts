/**
 * 版本号与更新记录的唯一真源。
 *
 * 版本号规则（SemVer 2.0.0，与 package.json 的 version 必须一致）：
 *   MAJOR —— 破坏性变更：数据库结构不兼容、设置/数据文件格式断裂、用户可见功能被移除。
 *   MINOR —— 向下兼容地新增功能（新页面、新能力、新存储字段）。
 *   PATCH —— 向下兼容的问题修复与体验打磨，不新增功能。
 *
 * 约定：
 *   1. 任何一次交付（打包并替换 release 产物）都要同时更新 `package.json` 的
 *      version 和本文件的 APP_VERSION，两者不一致时 `npm run check:version` 会失败。
 *   2. 每次升版都要在 CHANGELOG 顶部追加一条，字段与措辞风格保持一致。
 *   3. 开发中的改动先累积在「未发布」分组，打包交付时再定版本号落地。
 */

export const APP_VERSION = '1.4.0';

export interface ChangeGroup {
  /** 分组标题，使用 Conventional Commits 的类型词。 */
  kind: 'feat' | 'fix' | 'perf' | 'refactor' | 'docs' | 'chore';
  items: string[];
}

export interface VersionEntry {
  version: string;
  /** 交付日期，YYYY-MM-DD。开发中的版本可以留空。 */
  released?: string;
  summary: string;
  groups: ChangeGroup[];
}

export const CHANGE_GROUP_LABELS: Record<ChangeGroup['kind'], string> = {
  feat: '新功能',
  fix: '问题修复',
  perf: '性能',
  refactor: '重构',
  docs: '文档',
  chore: '工程',
};

/** 最新版本在最上方。 */
export const CHANGELOG: VersionEntry[] = [
  {
    version: '1.4.0',
    released: '2026-09-27',
    summary: '新增「长期任务」视图：没有截止日期的任务不再从视野里消失。',
    groups: [
      {
        kind: 'feat',
        items: [
          '时间线新增「长期任务」面板：按项目列出所有没有截止日期、且尚未完成的任务。'
          + '这类任务不会出现在按日期铺排的周视图里，此前创建后基本就看不到。',
          '任务详情新增「设为长期任务」一键清空截止日期；没有日期时会在输入框下方提示当前是长期任务。',
          '长期任务按优先级排序（紧急 → 高 → 中 → 低）并显示所处阶段，便于判断先推进哪个。',
        ],
      },
      {
        kind: 'fix',
        items: [
          '修复 UI 冒烟在缺少同步 IPC handler 时会无限挂起的问题：新增看门狗，超时显式失败而不是永久等待。',
        ],
      },
      {
        kind: 'chore',
        items: [
          'UI 冒烟补齐长期任务断言：面板内容、设日期后移出面板并进入周视图、一键设为长期任务，'
          + '并修正键盘输入与坐标点击在无头 Electron 下的不稳定问题。',
        ],
      },
    ],
  },
  {
    version: '1.3.0',
    released: '2026-09-27',
    summary: '补齐数据库约束、统一启动入口、主题可跨地址持久化，并新增「关于」页。',
    groups: [
      {
        kind: 'feat',
        items: [
          '新增数据库 schema 迁移：为 projects 与 tasks 补齐 CHECK 约束（状态、优先级、排序），迁移前逐条校验既有数据，任一行不合规即中止且不改动数据库。',
          '新增「关于」页：软件介绍、版本号、技术栈与完整更新记录。',
          '主题改由主进程 settings.json 保存，不再依赖浏览器 localStorage，因此更换访问地址（localhost 与 127.0.0.1）后主题不会丢失。',
        ],
      },
      {
        kind: 'fix',
        items: [
          '修复设置页主题列表重复渲染「Original Indigo」的问题——默认主题的 mode 与分组相同时会被重复列出，导致点选后看似主题被重置。',
          '修复「最近活动」在项目卡片上丢失任务标题与阻塞原因的问题（查询未取 detail 字段）。',
          '修复归档保护：DELETE 只做可恢复归档，不再物理删除任务或项目。',
          '修复新建任务不再依赖系统 node.exe，统一由随包 Electron 运行时启动服务。',
          '修复打包产物缺少 public 资源、以及移除的文件残留进产物的问题。',
        ],
      },
      {
        kind: 'chore',
        items: [
          '废弃并删除 scripts/start.bat 与 scripts/tray.ps1（浏览器 + 托盘的第二套入口），setup.bat 改为指向打包产物。',
          '冒烟脚本加固：临时数据目录必须位于系统临时目录内且不等于生产数据目录，运行后自动清理，默认不再拿生产库当可写库。',
          '新增主题令牌一致性检查，默认主题与 globals.css 的回退值必须逐条一致。',
        ],
      },
    ],
  },
  {
    version: '1.2.0',
    released: '2026-07-28',
    summary: '数据安全与桌面工作台体验：可恢复归档、阻塞闭环、主题体系与打包链路。',
    groups: [
      {
        kind: 'feat',
        items: [
          '所有删除入口改为可恢复归档，并新增设置页「归档管理」用于恢复项目与任务。',
          '阻塞闭环：标记阻塞必须填写原因，解决最后一个阻塞后任务自动回到进行中。',
          '13 套主题（1 套默认 + 6 暗色 + 6 亮色），主题令牌自动计算前景色以保证对比度。',
          '统一桌面工作台视觉：响应式侧栏、深浅主题、加载骨架屏、Toast 反馈与错误重试。',
        ],
      },
      {
        kind: 'fix',
        items: [
          '数据库保存改为事务快照加原子替换，失败时回滚内存状态，杜绝「请求成功但没落盘」。',
          '修复弹窗关闭后焦点无法回到触发元素的问题，Modal/Drawer 统一处理初始焦点。',
        ],
      },
      {
        kind: 'chore',
        items: [
          '开发、测试与打包默认使用隔离数据目录，避免误碰生产数据库。',
          '新增隔离 API 回归与真实 Electron UI 冒烟，纳入 npm run verify。',
        ],
      },
    ],
  },
  {
    version: '1.1.0',
    released: '2026-07-22',
    summary: '从模板工程落地为可用的多项目并行管理工作台。',
    groups: [
      {
        kind: 'feat',
        items: [
          '仪表盘：活跃项目、进行中、被阻塞、今日到期四项统计，项目进度、紧急事项与活动流。',
          '看板：四列拖拽流转，含键盘操作与屏幕阅读器播报。',
          '时间线：按周查看带截止日期的任务。',
          '项目详情：快速添加任务、项目进度、活动记录与归档。',
          'Electron 桌面外壳：内嵌 Next.js 服务、系统托盘、开机自启。',
        ],
      },
      {
        kind: 'chore',
        items: [
          '数据库改用 sql.js（SQLite WASM），单文件落盘，无需外部数据库服务。',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    released: '2026-07-21',
    summary: '首个可运行版本。',
    groups: [
      {
        kind: 'feat',
        items: [
          '项目 / 任务 / 阻塞 / 活动日志四张表的数据模型与 REST 接口。',
          'Next.js 16 + React 19 + Tailwind v4 的应用骨架。',
        ],
      },
    ],
  },
];

export const APP_TAGLINE = '本地多项目并行管理工作台';

export const APP_DESCRIPTION =
  'ProjectTracker 是一个纯本地运行的桌面工作台，用来同时推进多个项目：'
  + '把任务放进看板按阶段流转，遇到卡点就记录阻塞原因，解决后自动回到进行中。'
  + '所有数据保存在本机的一个 SQLite 文件里，不联网、不上传，删除一律是可恢复的归档。';

export const APP_FEATURES: { title: string; detail: string }[] = [
  { title: '仪表盘', detail: '一眼看到进行中、被阻塞与今日到期的任务，以及每个项目的进度和最近动态。' },
  { title: '看板', detail: '待办 / 进行中 / 阻塞 / 已完成四列拖拽流转，支持键盘操作与无障碍播报。' },
  { title: '时间线', detail: '按周铺开所有带截止日期的任务，直观看到这一周的排期。' },
  { title: '阻塞闭环', detail: '标记阻塞必须写清原因；最后一个阻塞被解决时，任务自动回到进行中。' },
  { title: '可恢复归档', detail: '项目与任务只归档不删除，随时可以在设置页恢复，历史记录完整保留。' },
  { title: '主题', detail: '13 套主题（默认 + 6 暗色 + 6 亮色），选择结果保存在本机配置里。' },
];

export const APP_STACK: { label: string; value: string }[] = [
  { label: '应用框架', value: 'Next.js 16（App Router）· React 19' },
  { label: '桌面外壳', value: 'Electron 43 · 内嵌服务运行在 127.0.0.1:3099' },
  { label: '数据存储', value: 'sql.js（SQLite WASM）· 单文件 tracker.db · 事务快照 + 原子替换' },
  { label: '样式', value: 'Tailwind CSS v4 · CSS 变量主题令牌' },
  { label: '数据位置', value: '%APPDATA%\\project-tracker\\data\\tracker.db' },
];
