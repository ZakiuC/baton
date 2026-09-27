<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 仓库规范

改动本仓库前请先读 [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)，其中约定：

- **版本号**：SemVer。`package.json` 的 `version` 与 `src/lib/version.ts` 的 `APP_VERSION` 必须一致，
  `npm run check:version` 会校验（已纳入 `verify:static`）。
- **更新记录**：唯一来源是 `src/lib/version.ts` 的 `CHANGELOG`（「关于」页渲染它），不要另建 changelog 文件。
- **提交信息**：Conventional Commits，例如 `fix(settings): 主题列表不再重复渲染默认主题`。
- **分支**：单人项目直接在 `main` 提交；大改动用短生命周期分支，合回后删除。
- **交付**：升版本号 + 写更新记录 + `npm run verify` 通过 + 构建产物 + `chore(release): vX.Y.Z` 提交 + `vX.Y.Z` tag，
  且**版本变更必须提交进仓库**——不能只改了文件不打 tag。
- **门禁**：提交前 `npm run verify:static`，发版必须跑完整 `npm run verify`。
- **数据安全**：任何测试都不得把生产数据库当作可写库；`tracker.db*` 永不进版本库。
- **修缺陷**：先补一条能复现的断言，再修代码，并反向验证该断言确实会失败。
