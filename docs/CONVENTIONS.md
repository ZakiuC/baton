# 仓库与交付规范

本文约定 ProjectTracker 的版本号、提交、分支与交付流程。目标是让任何一次改动都能回答三个问题：
**改了哪个版本、怎么回退、怎么验证**。不确定的地方一律采用当前主流做法，并在文末给出取舍理由。

---

## 1. 版本号

采用 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)：`MAJOR.MINOR.PATCH`。

| 位 | 何时 +1 | 本项目的具体判据 |
|---|---|---|
| MAJOR | 破坏性变更 | 数据库结构不兼容（旧库无法直接打开）、设置或数据文件格式断裂、移除用户已依赖的功能 |
| MINOR | 向下兼容地新增功能 | 新页面、新能力、新的存储字段（例如新增 `theme` 配置项） |
| PATCH | 向下兼容地修缺陷 | 只修问题、不新增功能（例如修复主题列表重复项） |

**开发中的改动不预先占号**：只修 bug 就只升 PATCH；攒了新功能再一起升 MINOR。不要为了「看起来有进展」而跳号。

版本号有**两个落点，必须一致**：

| 位置 | 作用 |
|---|---|
| `package.json` 的 `version` | 单一真源。`electron-builder` 用它给安装包版本，应用内 `app.getVersion()` 也读它 |
| `src/lib/version.ts` 的 `APP_VERSION` | 渲染进程展示用（「关于」页、设置页版本卡片） |

`npm run check:version` 会校验两者一致、版本号符合 SemVer、更新记录按版本从新到旧排列且顶部就是当前版本，
并在能读到 git 信息时要求存在对应的 `vX.Y.Z` tag。它已纳入 `verify:static`，所以写错版本号会让 `npm run verify` 直接失败。

> **注意**：因为包含 tag 检查，**刚升完版本号、还没打 tag 时 `npm run verify` 会失败**，这是刻意的——
> 它把「升了版本却没落 tag」变成显式错误。正常顺序是：改版本号 → 跑 `verify`（此时会提示缺 tag，
> 这是预期的）→ 提交 → `git tag` → 再跑一次 `verify` 确认通过。若只想在升版途中做静态检查，
> 可单独跑 `npm run typecheck && npm run lint && npm run check:theme`。

## 2. 更新记录

唯一的更新记录在 `src/lib/version.ts` 的 `CHANGELOG` 数组里，由「关于」页直接渲染——**不存在第二份 changelog 文件**，避免两份记录漂移。

条目结构：

```ts
{
  version: '1.3.0',
  released: '2026-09-27',        // 交付日期；开发中可省略，页面会显示「开发中」
  summary: '一句话概括这个版本的主题',
  groups: [
    { kind: 'feat', items: ['新增 …', '新增 …'] },
    { kind: 'fix',  items: ['修复 …'] },
  ],
}
```

`kind` 用 Conventional Commits 的类型词，页面按 `CHANGE_GROUP_LABELS` 映射成中文分组标题：

| kind | 页面显示 | 用于 |
|---|---|---|
| `feat` | 新功能 | 用户可感知的新能力 |
| `fix` | 问题修复 | 用户可感知的缺陷修复 |
| `perf` | 性能 | 更快、更省资源 |
| `refactor` | 重构 | 内部结构调整，行为不变 |
| `docs` | 文档 | 文档变更 |
| `chore` | 工程 | 构建、脚本、依赖、测试等 |

写条目的要求：**面向使用者描述影响，而不是罗列代码改动**。写「修复归档保护：DELETE 只做可恢复归档」，
不写「修改 tasks.ts 的 deleteTask 实现」。

## 3. 提交信息

采用 [Conventional Commits 1.0.0](https://www.conventionalcommits.org/zh-hans/)：

```
<type>(<scope>): <一句话说明>

<可选正文：为什么这么改、有什么取舍>

<可选脚注：关联问题、破坏性变更 BREAKING CHANGE:>
```

- `type` 取值：`feat` `fix` `perf` `refactor` `docs` `test` `build` `ci` `chore` `revert`。
- `scope` 用受影响的区域，本项目的常用值：`db` `api` `ui` `board` `timeline` `settings` `about` `theme` `electron` `scripts` `deps` `release`。
- 标题用中文祈使句、不超过一行；正文说明**为什么**，代码已经说明**是什么**。
- 破坏性变更必须写 `BREAKING CHANGE:` 脚注，并同步升 MAJOR。

示例：

```
fix(settings): 主题列表不再重复渲染默认主题

默认主题单独渲染在列表顶部，分组过滤只判断 mode，导致默认主题改为亮色后
在亮色分组里又出现一次，用户点到它就会把主题切回默认。

check:version 已纳入 verify:static，并在 UI 冒烟中加入重复项断言。
```

## 4. 分支策略

本仓库是**单人维护、纯本地、无远程**的私有项目，因此采用 [GitHub Flow](https://docs.github.com/get-started/using-github/github-flow) 的轻量形态：

| 分支 | 用途 |
|---|---|
| `master` | 默认分支，始终可交付。每个提交都应通过 `npm run verify` |
| `feat/<主题>`、`fix/<主题>` | 需要多次提交、或中途可能放弃的改动。做完合回 `master` 并删除 |

约定：

- **小改动直接提交到 `master`**（单人项目里为每个琐碎改动开分支只会增加合并成本）。
- **大改动开短生命周期分支**，合并方式用 `--no-ff` 保留一条合并记录，便于整体回退。
- 分支名小写、用连字符分隔，例如 `feat/about-page`。
- 不保留长期分支（`develop`、`release`），也不做 Git Flow 的 `hotfix`——本项目没有并行发版需求，引入它们只会带来闲置分支。

需要远程协作时（例如换机器、多人加入），执行：

```bash
git remote add origin <url>
git push -u origin master
git push --tags
```

## 5. 发版流程

每个「交付」= 一次版本号变更 + 一个提交 + 一个 tag + 一次可验证的产物。按顺序执行：

1. **改版本号**：同步更新 `package.json` 的 `version` 与 `src/lib/version.ts` 的 `APP_VERSION`。
2. **写更新记录**：在 `CHANGELOG` 顶部插入新条目（补 `released` 日期）。
3. **跑门禁**：`npm run verify` —— 必须退出码 0。它依次执行
   类型检查 → ESLint → 主题令牌一致性 → 版本一致性 → 生产构建 → 隔离 API 回归 → 真实 Electron UI 冒烟，
   并比对生产数据库指纹未变。
4. **构建产物**：`npm run build:electron:dir`（自带产物自检：运行依赖完整、`sql-wasm.wasm` 恰好 1 个、`tracker.db*` 为 0）。
5. **替换安装目录**：把新产物替换到 `release/win-unpacked`，**旧产物改名保留**而不是删除。
6. **提交**：`git add -A && git commit -m "chore(release): v1.3.0"`（正文写这一版的主要内容）。
7. **打 tag**：`git tag -a v1.3.0 -m "ProjectTracker 1.3.0"`。tag 是版本的锚点，**每次交付都要打**。
8. **验证安装包**：启动 `release/win-unpacked/ProjectTracker.exe`，确认进程数、`127.0.0.1:3099` 可访问、
   生产数据库哈希未变，并在「关于」页看到正确版本号。
9. **记录台账**：在仓库上级的 `WORKLOG.md` 追加条目，写明目标、现状与验证证据。

回退方式：

```bash
git checkout v1.2.0            # 回到某个版本的代码
git revert <commit>            # 或撤销某次改动
```

产物回退靠 `release/` 下保留的旧目录（`release/` 不进版本库，见第 7 节）。

## 6. 质量门禁

| 命令 | 内容 |
|---|---|
| `npm run typecheck` | TypeScript 全量类型检查 |
| `npm run lint` | ESLint（含 react-hooks 规则） |
| `npm run check:theme` | 默认主题与 `globals.css` 的 `:root` 回退值逐条一致 |
| `npm run check:version` | 版本号一致性与更新记录格式 |
| `npm run test:api:built` | 隔离数据目录下的 API 回归 |
| `npm run test:ui:built` | 真实 Electron 窗口 UI 冒烟 |
| `npm run verify` | 以上全部 + 生产构建 |

约定：

- 提交前至少跑 `npm run verify:static`；**发版必须跑完整的 `npm run verify`**。
- 测试一律使用隔离数据目录，任何脚本都不得把生产库当作可写库。
- 发现缺陷时，先补一条能复现它的断言，再修代码。修完要**反向验证**这条断言确实会失败
  （临时改回缺陷实现跑一次），否则无法确认断言不是永远为真。

## 7. 不进入版本库的内容

`.gitignore` 已覆盖，改 `.gitignore` 前请确认没有把这些带进来：

| 内容 | 原因 |
|---|---|
| `node_modules/`、`.next/` | 依赖与构建产物，可由源码重建 |
| `release/`、`theme_*/` | 安装包产物，体积大且二进制不可复现 |
| `**/tracker.db*`、`/src/data/*.db*` | **用户真实数据**，绝不能进版本库 |
| `.dev-data/` | 开发用隔离数据目录 |
| `*.tsbuildinfo`、`next-env.d.ts` | 生成物 |

> 注意：`release/` 被忽略意味着**产物不随仓库分发**。换机器后需要重新 `npm run build:electron:dir` 生成。

## 8. 目录职责

| 路径 | 内容 |
|---|---|
| `src/app/` | 页面与 API 路由（App Router） |
| `src/components/` | UI 组件（`shared` / `board` / `dashboard` / `forms`） |
| `src/lib/queries/` | 业务逻辑与校验（唯一的数据访问层） |
| `src/lib/db.ts` | 数据库连接、事务、迁移 |
| `src/lib/version.ts` | 版本号与更新记录（单一真源） |
| `electron/` | 桌面外壳：主进程、preload、图标 |
| `scripts/` | 构建、打包、校验与冒烟脚本 |
| `docs/` | 规范与说明文档 |

## 9. 取舍说明

不确定或存在多种主流做法时，本仓库的选择与理由：

| 议题 | 选择 | 理由 |
|---|---|---|
| 分支模型 | GitHub Flow 轻量形态，而非 Git Flow | 单人 + 无并行发版需求；`develop`/`release` 分支在本项目只会闲置 |
| 默认分支名 | 保留 `master` | 仓库已初始化在 `master`。改名收益仅为跟随 GitHub 新默认，却会打断已有引用；如需统一改 `main`，应在有远程之前一次改完 |
| 提交规范 | Conventional Commits | 主流、可读、能与变更分组和版本号规则对齐 |
| 更新记录存放 | 代码内的 `CHANGELOG` 常量 | 「关于」页需要渲染它；放 Markdown 会造成两份记录漂移。若将来要发布到 npm/GitHub Release，再从常量导出即可 |
| 版本号真源 | `package.json` | 打包工具与 `app.getVersion()` 都读它，不必额外工具 |
| 自动化发版工具 | 不引入（如 semantic-release / changesets） | 本项目无远程与 CI，引入后仍要人工决定版本号，收益为负 |
| 质量门禁 | `npm run verify` 一条命令 | 单人项目不需要 CI 编排；一条命令即可复现全部验证 |

需要重新评估以上取舍的时机：接入远程仓库与 CI、出现第二位维护者、或开始对外分发安装包。
