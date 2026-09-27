const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const initSqlJs = require('sql.js');

const projectRoot = path.resolve(__dirname, '..');
const serverPath = path.join(projectRoot, '.next', 'standalone', 'server.js');
const temporaryDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'project-tracker-api-'));
const temporaryDatabase = path.join(temporaryDataDirectory, 'tracker.db');
const productionDatabase = process.env.PROJECT_TRACKER_PRODUCTION_DB
  || (process.env.APPDATA
    ? path.join(process.env.APPDATA, 'project-tracker', 'data', 'tracker.db')
    : null);
const fixtureDatabase = process.env.PROJECT_TRACKER_TEST_FIXTURE_DB
  || (productionDatabase && fs.existsSync(productionDatabase) ? productionDatabase : null);
const productionDataDirectory = productionDatabase ? path.dirname(productionDatabase) : null;
const keepTemporaryData = process.env.PROJECT_TRACKER_KEEP_TEMP === '1';
/** 与 src/lib/db.ts 的 DATABASE_VERSION 对应。 */
const EXPECTED_DATABASE_VERSION = 2;

let assertions = 0;

/** 读取 SQLite 的 user_version，用于判断这次启动是否会执行迁移。 */
async function readUserVersion(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(projectRoot, 'node_modules', 'sql.js', 'dist', file),
  });
  const database = new SQL.Database(fs.readFileSync(filePath));
  try {
    const result = database.exec('PRAGMA user_version');
    return Number(result[0]?.values[0]?.[0] ?? 0);
  } finally {
    database.close();
  }
}

/**
 * 回归只允许写临时目录。在任何拷贝或写库之前硬校验，避免 APP_DATA_DIR
 * 指向真实数据目录时把生产库当作可写库打开。
 * 本函数的路径比较全部基于字符串前缀，不依赖目录是否存在。
 */
function assertIsolatedDataDirectory() {
  const temporary = path.resolve(os.tmpdir(), path.basename(temporaryDataDirectory));
  const temporaryRoot = path.resolve(os.tmpdir());
  if (!temporary.startsWith(temporaryRoot + path.sep)) {
    throw new Error(`临时数据目录必须位于系统临时目录内：${temporary}`);
  }
  const production = productionDataDirectory ? path.resolve(productionDataDirectory) : null;
  if (production && temporary === production) {
    throw new Error(`临时数据目录不能等于生产数据目录：${temporary}`);
  }
  if (fixtureDatabase) {
    const fixture = path.resolve(fixtureDatabase);
    if (fixture === temporary || fixture.startsWith(temporary + path.sep)) {
      throw new Error(`夹具库不能位于临时数据目录内：${fixture}`);
    }
    const fixtureDirectory = path.dirname(fixture);
    if (production && fixtureDirectory === production) {
      console.log(`[API 回归] 注意：夹具来自生产数据目录，只会被读取并拷贝，不会被写入。`);
    }
  }
}

/**
 * 默认清理本轮临时目录；失败时保留现场供排查，需要强制保留时设置
 * PROJECT_TRACKER_KEEP_TEMP=1。只删除带前缀且位于系统临时目录内的目录。
 */
function cleanupTemporaryData() {
  if (keepTemporaryData) return;
  const temporary = path.resolve(temporaryDataDirectory);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (!path.basename(temporary).startsWith('project-tracker-api-')) return;
  if (!temporary.startsWith(temporaryRoot + path.sep)) return;
  try {
    fs.rmSync(temporary, { recursive: true, force: true });
  } catch {
    // 清理失败不影响回归结论。
  }
}

function verify(value, message) {
  assert.ok(value, message);
  assertions += 1;
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function fingerprint(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    hash: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
    length: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill();
  });
}

async function waitForServer(baseUrl, child, getLogs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`隔离服务提前退出，退出码 ${child.exitCode}\n${getLogs()}`);
    }
    try {
      const response = await fetch(new URL('/api/dashboard', baseUrl));
      const payload = await response.json();
      if (
        response.status === 200
        && payload?.stats
        && Array.isArray(payload.projects)
        && Array.isArray(payload.urgentItems)
        && Array.isArray(payload.recentActivity)
      ) return;
    } catch {
      // 服务尚未就绪时继续轮询。
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`隔离服务启动超时\n${getLogs()}`);
}

function createRequester(baseUrl) {
  return async (route, options = {}, expectedStatus = 200) => {
    const response = await fetch(new URL(route, baseUrl), options);
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`${route} 返回了非 JSON 响应：${text.slice(0, 200)}`);
      }
    }
    equal(response.status, expectedStatus, `${route} 状态码不符合预期：${text}`);
    return body;
  };
}

async function verifyDatabase(filePath, label) {
  verify(fs.existsSync(filePath), `${label}必须存在`);
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(projectRoot, 'node_modules', 'sql.js', 'dist', file),
  });
  const database = new SQL.Database(fs.readFileSync(filePath));
  try {
    const integrity = database.exec('PRAGMA integrity_check');
    const foreignKeys = database.exec('PRAGMA foreign_key_check');
    equal(integrity[0]?.values[0]?.[0], 'ok', `${label}完整性检查必须通过`);
    equal(foreignKeys.length, 0, `${label}不能存在外键异常`);
  } finally {
    database.close();
  }
}

async function runApiWorkflow(baseUrl) {
  const request = createRequester(baseUrl);
  const suffix = `${Date.now()}-${process.pid}`;
  const initialProjects = await request('/api/projects?include_archived=true');
  const initialTasks = await request('/api/tasks?include_archived=true');

  const project = await request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `接口回归项目-${suffix}`,
      description: '仅用于临时数据库的自动化回归',
      color: '#2563EB',
    }),
  }, 201);
  verify(project?.id, '项目创建后必须返回 ID');

  const task = await request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: project.id,
      title: `接口回归任务-${suffix}`,
      priority: 'high',
    }),
  }, 201);
  verify(task?.id, '任务创建后必须返回 ID');

  const missingReason = await request(`/api/tasks/${task.id}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'blocked' }),
  }, 400);
  verify(String(missingReason?.error).includes('阻塞原因'), '无原因阻塞必须返回明确错误');

  const blockedTask = await request(`/api/tasks/${task.id}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'blocked', blocker_reason: '等待接口联调' }),
  });
  equal(blockedTask.stage, 'blocked', '任务必须进入阻塞阶段');
  equal(blockedTask.blockers.length, 1, '任务必须记录第一条阻塞原因');

  const secondBlocker = await request('/api/blockers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: task.id, reason: '等待设计确认', project_id: '伪造项目' }),
  }, 201);
  verify(secondBlocker?.id, '第二条阻塞必须创建成功');

  const afterFirstResolution = await request(`/api/blockers/${blockedTask.blockers[0].id}`, { method: 'PUT' });
  equal(afterFirstResolution.task.stage, 'blocked', '仍有阻塞时任务必须保持阻塞');
  equal(afterFirstResolution.task.blockers.length, 1, '解决一条后必须保留另一条阻塞');

  const afterLastResolution = await request(`/api/blockers/${secondBlocker.id}`, { method: 'PUT' });
  equal(afterLastResolution.task.stage, 'in_progress', '最后一条阻塞解决后必须回到进行中');
  equal(afterLastResolution.task.blockers.length, 0, '解决后不能残留活动阻塞');

  const updatedTask = await request(`/api/tasks/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `${task.title}-已更新`, stage: 'done', due_date: '2026-12-31' }),
  });
  equal(updatedTask.stage, 'done', '任务阶段必须原子更新');
  equal(updatedTask.title, `${task.title}-已更新`, '任务标题必须原子更新');

  const archivedTask = await request(`/api/tasks/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'archived' }),
  });
  equal(archivedTask.stage, 'archived', '任务必须进入归档状态');

  const archivedTaskEdit = await request(`/api/tasks/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'archived', title: '不应写入的标题' }),
  }, 400);
  verify(String(archivedTaskEdit?.error).includes('恢复任务'), '归档任务不能借同阶段请求修改内容');

  const restoreAndEdit = await request(`/api/tasks/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'todo', title: '不应同时写入的标题' }),
  }, 400);
  verify(String(restoreAndEdit?.error).includes('不能同时修改'), '恢复任务时不能同时编辑内容');

  const restoredTask = await request(`/api/tasks/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'todo' }),
  });
  equal(restoredTask.stage, 'todo', '任务必须可恢复到待办');

  const archivedProject = await request(`/api/projects/${project.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'archived' }),
  });
  equal(archivedProject.status, 'archived', '项目必须进入归档状态');

  const archivedTaskMutation = await request(`/api/tasks/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '归档项目内不应允许修改' }),
  }, 400);
  verify(String(archivedTaskMutation?.error).includes('归档项目'), '归档项目内任务必须只读');

  const archivedProjectEdit = await request(`/api/projects/${project.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '归档项目不应允许改名' }),
  }, 400);
  verify(String(archivedProjectEdit?.error).includes('恢复项目'), '归档项目不能直接编辑');

  const restoreProjectAndEdit = await request(`/api/projects/${project.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'active', name: '不应同时改名' }),
  }, 400);
  verify(String(restoreProjectAndEdit?.error).includes('不能同时修改'), '恢复项目时不能同时编辑内容');

  const restoredProject = await request(`/api/projects/${project.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'active' }),
  });
  equal(restoredProject.status, 'active', '项目必须可以恢复');

  const legacyArchive = await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
  equal(legacyArchive.task.stage, 'archived', '兼容 DELETE 也只能执行可恢复归档');
  await request(`/api/tasks/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 'todo' }),
  });

  const allProjects = await request('/api/projects?include_archived=true');
  const allTasks = await request('/api/tasks?include_archived=true');
  equal(allProjects.length, initialProjects.length + 1, '项目归档/恢复不能物理删除行');
  equal(allTasks.length, initialTasks.length + 1, '任务归档/恢复不能物理删除行');
  verify(allProjects.some((item) => item.id === project.id), '项目行必须仍然存在');
  verify(allTasks.some((item) => item.id === task.id), '任务行必须仍然存在');
}

async function main() {
  if (!fs.existsSync(serverPath)) {
    throw new Error('未找到 standalone 服务，请先运行 npm run build');
  }
  assertIsolatedDataDirectory();
  console.log(`[API 回归] 隔离数据目录：${temporaryDataDirectory}`);
  console.log(fixtureDatabase
    ? `[API 回归] 夹具库（只读拷贝一次）：${fixtureDatabase}`
    : '[API 回归] 未找到夹具库，将使用全新空数据库');

  const productionBefore = fingerprint(productionDatabase);
  if (fixtureDatabase) fs.copyFileSync(fixtureDatabase, temporaryDatabase, fs.constants.COPYFILE_EXCL);
  const fixtureBefore = fingerprint(temporaryDatabase);
  const fixtureVersion = await readUserVersion(temporaryDatabase);
  const migrationExpected = fixtureVersion !== null && fixtureVersion < EXPECTED_DATABASE_VERSION;
  if (migrationExpected) {
    console.log(`[API 回归] 夹具 user_version=${fixtureVersion} < ${EXPECTED_DATABASE_VERSION}，本次启动会执行 schema 迁移`);
  }
  const port = await reserveLocalPort();
  const baseUrl = new URL(`http://127.0.0.1:${port}`);
  let logs = '';
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      APP_DATA_DIR: temporaryDataDirectory,
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const collectLog = (chunk) => {
    logs = `${logs}${chunk}`.slice(-12000);
  };
  child.stdout.on('data', collectLog);
  child.stderr.on('data', collectLog);

  let failure = null;
  try {
    await waitForServer(baseUrl, child, () => logs);
    if (fixtureBefore && !migrationExpected) {
      // 没有待执行的迁移时，启动必须是纯只读的：不能重写库文件。
      const afterReadOnlyStartup = fingerprint(temporaryDatabase);
      equal(afterReadOnlyStartup.hash, fixtureBefore.hash, '只读启动不能重写已有数据库');
      equal(afterReadOnlyStartup.length, fixtureBefore.length, '只读启动不能改变数据库大小');
      equal(afterReadOnlyStartup.mtimeMs, fixtureBefore.mtimeMs, '只读启动不能改变数据库时间戳');
    }
    if (migrationExpected) {
      // 有待执行的迁移时，启动必须把它落盘：版本号推进且库仍然完整。
      equal(
        await readUserVersion(temporaryDatabase),
        EXPECTED_DATABASE_VERSION,
        '待执行的 schema 迁移必须在启动时落盘并推进 user_version',
      );
      await verifyDatabase(temporaryDatabase, '迁移后的临时主库');
    }
    await runApiWorkflow(baseUrl);
  } catch (error) {
    failure = error;
  } finally {
    await stopServer(child);
  }

  try {
    await verifyDatabase(temporaryDatabase, '临时主库');
    await verifyDatabase(`${temporaryDatabase}.bak`, '临时备份库');
    const leftovers = fs.readdirSync(temporaryDataDirectory).filter((name) => name.includes('.tmp-'));
    equal(leftovers.length, 0, '原子保存不能残留临时文件');
    equal(fingerprint(productionDatabase)?.hash ?? null, productionBefore?.hash ?? null, '生产数据库哈希必须保持不变');
    equal(fingerprint(productionDatabase)?.length ?? null, productionBefore?.length ?? null, '生产数据库大小必须保持不变');
    equal(fingerprint(productionDatabase)?.mtimeMs ?? null, productionBefore?.mtimeMs ?? null, '生产数据库时间戳必须保持不变');
  } catch (error) {
    if (!failure) failure = error;
  }

  if (failure) throw failure;
  console.log(`[API 回归] 全部通过，共 ${assertions} 项断言`);
}

main()
  .then(() => {
    cleanupTemporaryData();
    if (keepTemporaryData) {
      console.log(`[API 回归] 隔离数据按要求保留在：${temporaryDataDirectory}`);
    }
  })
  .catch((error) => {
    console.error('[API 回归] 失败：', error);
    console.error(`[API 回归] 为便于排查，隔离数据保留在：${temporaryDataDirectory}`);
    console.error('[API 回归] 确认无需现场后可手动删除该目录。');
    process.exitCode = 1;
  });
