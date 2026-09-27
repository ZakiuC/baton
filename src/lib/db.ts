import initSqlJs, {
  BindParams,
  Database as SqlJsDatabase,
  SqlJsStatic,
} from 'sql.js';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.APP_DATA_DIR
  || path.join(/*turbopackIgnore: true*/ process.cwd(), 'src', 'data');
const DB_PATH = path.join(/*turbopackIgnore: true*/ DATA_DIR, 'tracker.db');
const BACKUP_PATH = `${DB_PATH}.bak`;
const DATABASE_VERSION = 2;

/**
 * 建表 DDL 的唯一真源。迁移里的影子表重建也从这里取列定义，
 * 避免「有约束的建表语句」和「迁移时用的语句」两份漂移。
 */
const TABLE_DEFINITIONS: Record<string, string> = {
  projects: `(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'paused', 'archived')),
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+08:00', 'now', '+8 hours')),
    updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+08:00', 'now', '+8 hours'))
  )`,
  tasks: `(
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'todo'
      CHECK (stage IN ('todo', 'in_progress', 'blocked', 'done', 'archived')),
    priority TEXT NOT NULL DEFAULT 'medium'
      CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+08:00', 'now', '+8 hours')),
    updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+08:00', 'now', '+8 hours'))
  )`,
  blockers: `(
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+08:00', 'now', '+8 hours')),
    resolved_at DATETIME
  )`,
  activity_log: `(
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+08:00', 'now', '+8 hours'))
  )`,
};

/** 建表顺序：被引用的表在前。 */
const TABLE_ORDER = ['projects', 'tasks', 'blockers', 'activity_log'] as const;

const INDEX_DEFINITIONS = [
  'CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(stage)',
  'CREATE INDEX IF NOT EXISTS idx_blockers_task ON blockers(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log(project_id)',
];

function createTableSql(table: string, name = table): string {
  return `CREATE TABLE IF NOT EXISTS ${name} ${TABLE_DEFINITIONS[table]}`;
}

function createIndexesSql(prefix = ''): string {
  return INDEX_DEFINITIONS
    .map((sql) => {
      if (!prefix) return `${sql};`;
      // 影子阶段索引名要带前缀，否则会与旧表上的同名索引冲突。
      return `${sql.replace(' ON ', ` ON ${prefix}`).replace('idx_', `idx_${prefix}_`) };`;
    })
    .join('\n');
}

const SCHEMA_SQL = `
  ${TABLE_ORDER.map((table) => `${createTableSql(table)};`).join('\n\n')}

  ${createIndexesSql()}
`;

/**
 * 每个 CHECK 约束对应一条「找出不合规行」的查询。
 * 重建表之前必须全部为空，否则迁移中止——宁可报错并保留旧库，
 * 也不要把无法通过约束的数据塞进新表。
 */
const CONSTRAINT_CHECKS: { table: string; label: string; sql: string }[] = [
  {
    table: 'projects',
    label: 'projects.status 必须是 active/paused/archived',
    sql: "SELECT COUNT(*) AS count FROM projects WHERE status IS NULL OR status NOT IN ('active','paused','archived')",
  },
  {
    table: 'projects',
    label: 'projects.status 不能为空',
    sql: 'SELECT COUNT(*) AS count FROM projects WHERE status IS NULL',
  },
  {
    table: 'tasks',
    label: 'tasks.stage 必须是 todo/in_progress/blocked/done/archived',
    sql: "SELECT COUNT(*) AS count FROM tasks WHERE stage IS NULL OR stage NOT IN ('todo','in_progress','blocked','done','archived')",
  },
  {
    table: 'tasks',
    label: 'tasks.priority 必须是 low/medium/high/urgent',
    sql: "SELECT COUNT(*) AS count FROM tasks WHERE priority IS NULL OR priority NOT IN ('low','medium','high','urgent')",
  },
  {
    table: 'tasks',
    label: 'tasks.sort_order 必须是非负整数',
    sql: 'SELECT COUNT(*) AS count FROM tasks WHERE sort_order IS NULL OR typeof(sort_order) != \'integer\' OR sort_order < 0',
  },
  {
    table: 'tasks',
    label: 'tasks.project_id 必须指向存在的项目',
    sql: 'SELECT COUNT(*) AS count FROM tasks WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM projects)',
  },
  {
    table: 'blockers',
    label: 'blockers.resolved 必须是 0 或 1',
    sql: 'SELECT COUNT(*) AS count FROM blockers WHERE resolved IS NULL OR resolved NOT IN (0, 1)',
  },
  {
    table: 'blockers',
    label: 'blockers.task_id 必须指向存在的任务',
    sql: 'SELECT COUNT(*) AS count FROM blockers WHERE task_id IS NULL OR task_id NOT IN (SELECT id FROM tasks)',
  },
  {
    table: 'blockers',
    label: 'blockers.reason 不能为空',
    sql: "SELECT COUNT(*) AS count FROM blockers WHERE reason IS NULL OR TRIM(reason) = ''",
  },
  {
    table: 'activity_log',
    label: 'activity_log.task_id 必须指向存在的任务',
    sql: 'SELECT COUNT(*) AS count FROM activity_log WHERE task_id IS NOT NULL AND task_id NOT IN (SELECT id FROM tasks)',
  },
  {
    table: 'activity_log',
    label: 'activity_log.project_id 必须指向存在的项目',
    sql: 'SELECT COUNT(*) AS count FROM activity_log WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects)',
  },
];

let SQL: SqlJsStatic | null = null;
let db: SqlJsDatabase | null = null;
let initPromise: Promise<void> | null = null;

function resetDatabaseState(): void {
  const currentDatabase = db;
  if (currentDatabase) currentDatabase.close();
  db = null;
  initPromise = null;
}

export interface DatabaseTransaction {
  run(sql: string, params?: BindParams): void;
  get<T>(sql: string, params?: BindParams): T | undefined;
  all<T>(sql: string, params?: BindParams): T[];
}

function queryOne<T>(database: SqlJsDatabase, sql: string, params?: BindParams): T | undefined {
  const statement = database.prepare(sql);
  try {
    if (params) statement.bind(params);
    return statement.step() ? statement.getAsObject() as T : undefined;
  } finally {
    statement.free();
  }
}

function queryAll<T>(database: SqlJsDatabase, sql: string, params?: BindParams): T[] {
  const results: T[] = [];
  const statement = database.prepare(sql);
  try {
    if (params) statement.bind(params);
    while (statement.step()) results.push(statement.getAsObject() as T);
    return results;
  } finally {
    statement.free();
  }
}

function createTransaction(database: SqlJsDatabase): {
  api: DatabaseTransaction;
  isDirty: () => boolean;
} {
  let dirty = false;
  return {
    api: {
      run(sql, params) {
        database.run(sql, params);
        dirty = true;
      },
      get<T>(sql: string, params?: BindParams) {
        return queryOne<T>(database, sql, params);
      },
      all<T>(sql: string, params?: BindParams) {
        return queryAll<T>(database, sql, params);
      },
    },
    isDirty: () => dirty,
  };
}

function writeAndSync(filePath: string, data: Buffer): void {
  const descriptor = fs.openSync(/*turbopackIgnore: true*/ filePath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, data);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function syncExistingFile(filePath: string): void {
  // Windows 要求可写文件句柄才能执行 FlushFileBuffers（Node 的 fsync）。
  const descriptor = fs.openSync(/*turbopackIgnore: true*/ filePath, 'r+');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function syncDirectoryBestEffort(): void {
  try {
    const descriptor = fs.openSync(/*turbopackIgnore: true*/ DATA_DIR, 'r');
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    // Windows 不保证目录句柄可 fsync；数据库文件自身已经完成 fsync。
  }
}

function removeTemporaryFile(filePath: string): void {
  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      fs.unlinkSync(/*turbopackIgnore: true*/ filePath);
    }
  } catch {
    // 临时文件清理失败不应遮蔽最初的保存异常。
  }
}

function saveToDisk(database: SqlJsDatabase): void {
  fs.mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });

  const suffix = `${process.pid}-${Date.now()}-${randomUUID()}`;
  const temporaryPath = `${DB_PATH}.tmp-${suffix}`;
  const backupTemporaryPath = `${BACKUP_PATH}.tmp-${suffix}`;

  try {
    const buffer = Buffer.from(database.export());
    writeAndSync(temporaryPath, buffer);

    if (fs.existsSync(/*turbopackIgnore: true*/ DB_PATH)) {
      fs.copyFileSync(
        /*turbopackIgnore: true*/ DB_PATH,
        /*turbopackIgnore: true*/ backupTemporaryPath,
        fs.constants.COPYFILE_EXCL,
      );
      syncExistingFile(backupTemporaryPath);
      fs.renameSync(
        /*turbopackIgnore: true*/ backupTemporaryPath,
        /*turbopackIgnore: true*/ BACKUP_PATH,
      );
    }

    // 临时文件和目标文件位于同一目录，rename 在文件系统层面完成原子替换。
    fs.renameSync(
      /*turbopackIgnore: true*/ temporaryPath,
      /*turbopackIgnore: true*/ DB_PATH,
    );
    syncDirectoryBestEffort();
  } catch (error) {
    removeTemporaryFile(temporaryPath);
    removeTemporaryFile(backupTemporaryPath);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`数据库保存失败：${message}`);
  }
}

function assertDatabaseIntegrity(database: SqlJsDatabase, source: string): void {
  const result = queryOne<Record<string, string>>(database, 'PRAGMA quick_check(1)');
  if (!result || !Object.values(result).includes('ok')) {
    throw new Error(`${source} 未通过 SQLite 完整性检查`);
  }
}

/**
 * 每张表「必须出现」的 CHECK 片段。只判断“有没有 CHECK”是不够的：
 * 一张表可能只补了部分约束，那样会被误判为已完成而永远不再迁移。
 */
const REQUIRED_TABLE_CONSTRAINTS: Record<string, string[]> = {
  projects: ["status IN ('active', 'paused', 'archived')"],
  tasks: [
    "stage IN ('todo', 'in_progress', 'blocked', 'done', 'archived')",
    "priority IN ('low', 'medium', 'high', 'urgent')",
    'sort_order >= 0',
  ],
  blockers: ['resolved IN (0, 1)'],
  activity_log: [],
};

/**
 * 库里的表是否缺少期望的 CHECK 约束。
 * 不能只信 user_version：现实中出现过「表是无约束的旧结构、user_version 却是 0」
 * 的库，而 CREATE TABLE IF NOT EXISTS 对已存在的表是 no-op，
 * 于是约束永远补不上。
 */
function tablesMissingConstraints(database: SqlJsDatabase): boolean {
  for (const table of TABLE_ORDER) {
    const required = REQUIRED_TABLE_CONSTRAINTS[table] ?? [];
    if (required.length === 0) continue;
    const row = queryOne<{ sql: string | null }>(
      database,
      'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?',
      ['table', table],
    );
    if (!row?.sql) continue; // 表不存在，交给建表流程
    const normalize = (value: string) => value.replace(/\s+/g, ' ').toLowerCase();
    const ddl = normalize(row.sql);
    if (required.some((fragment) => !ddl.includes(normalize(fragment)))) return true;
  }
  return false;
}

function assertExistingDataMeetsConstraints(database: SqlJsDatabase): void {
  const violations: string[] = [];
  for (const check of CONSTRAINT_CHECKS) {
    const exists = queryOne<{ name: string }>(
      database,
      'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
      ['table', check.table],
    );
    if (!exists) continue;
    const count = queryOne<{ count: number }>(database, check.sql)?.count ?? 0;
    if (count > 0) violations.push(`${check.table}: ${check.label}（${count} 行不合规）`);
  }
  if (violations.length > 0) {
    throw new Error(
      `数据库存在无法满足约束的既有数据，迁移已中止且未做任何修改：\n  - ${violations.join('\n  - ')}`,
    );
  }
}

function columnNames(database: SqlJsDatabase, table: string): string[] {
  return queryAll<{ name: string }>(database, `PRAGMA table_info(${table})`).map((row) => String(row.name));
}

function assertSameColumnLayout(database: SqlJsDatabase, table: string, shadowTable: string): void {
  const current = columnNames(database, table);
  const target = columnNames(database, shadowTable);
  if (current.length !== target.length || current.some((name, index) => name !== target[index])) {
    throw new Error(
      `表 ${table} 的列结构与当前代码不一致，迁移已中止：\n`
      + `  库中：${current.join(', ')}\n  期望：${target.join(', ')}`,
    );
  }
}

/**
 * 用带 CHECK 约束的影子表重建所有表并搬移数据。
 * 事务内先删子表再删父表；PRAGMA foreign_keys 只能在事务外切换，
 * 因此由调用方在事务前后负责开关。
 */
function rebuildTablesWithConstraints(database: SqlJsDatabase): void {
  const shadowPrefix = 'migration_new_';
  database.run('BEGIN TRANSACTION');
  try {
    for (const table of TABLE_ORDER) {
      const exists = queryOne<{ name: string }>(
        database,
        'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
        ['table', table],
      );
      if (!exists) continue;
      database.run(createTableSql(table, `${shadowPrefix}${table}`));
      // 影子表按代码里的列顺序建，因此必须确认旧表列顺序一致，
      // 否则 SELECT * 会把值塞进错误的列。
      assertSameColumnLayout(database, table, `${shadowPrefix}${table}`);
      database.run(`INSERT INTO ${shadowPrefix}${table} SELECT * FROM ${table}`);
    }

    // 先删活动日志与阻塞，再删任务与项目，避免依赖顺序造成的外键失败。
    for (const table of [...TABLE_ORDER].reverse()) {
      database.run(`DROP TABLE IF EXISTS ${table}`);
    }
    for (const table of TABLE_ORDER) {
      const shadow = queryOne<{ name: string }>(
        database,
        'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
        ['table', `${shadowPrefix}${table}`],
      );
      if (shadow) database.run(`ALTER TABLE ${shadowPrefix}${table} RENAME TO ${table}`);
      else database.run(createTableSql(table));
    }

    database.run(createIndexesSql());

    // 搬移后逐表核对行数，防止静默丢行。
    for (const check of CONSTRAINT_CHECKS) {
      const count = queryOne<{ count: number }>(database, check.sql)?.count ?? 0;
      if (count > 0) {
        throw new Error(`重建后数据校验失败：${check.table} ${check.label}（${count} 行）`);
      }
    }

    const foreignKeyProblems = queryAll<Record<string, unknown>>(database, 'PRAGMA foreign_key_check');
    if (foreignKeyProblems.length > 0) {
      throw new Error(`重建后外键校验失败，共 ${foreignKeyProblems.length} 条违规`);
    }

    database.run('COMMIT');
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch {
      // SQLite 可能已自行回滚。
    }
    throw error;
  }
}

/** 返回值表示库是否被改动过——改动过就必须落盘，否则每次启动都会重跑迁移。 */
function migrateDatabase(database: SqlJsDatabase, fromVersion: number): boolean {
  if (fromVersion > DATABASE_VERSION) {
    throw new Error(`数据库版本 ${fromVersion} 高于应用支持的版本 ${DATABASE_VERSION}`);
  }

  let changed = false;

  if (fromVersion < 1) {
    database.run('BEGIN TRANSACTION');
    try {
      database.run(SCHEMA_SQL);
      database.run('COMMIT');
      changed = true;
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  }

  // 版本号可能落后于实际结构（历史库就是这种情况），所以按结构本身判断。
  if (fromVersion < DATABASE_VERSION && tablesMissingConstraints(database)) {
    assertExistingDataMeetsConstraints(database);
    database.run('PRAGMA foreign_keys = OFF');
    try {
      rebuildTablesWithConstraints(database);
    } finally {
      database.run('PRAGMA foreign_keys = ON');
    }
    changed = true;
  }

  if (fromVersion !== DATABASE_VERSION) {
    database.run(`PRAGMA user_version = ${DATABASE_VERSION}`);
    changed = true;
  }

  return changed;
}

async function ensureDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  if (!initPromise) {
    initPromise = (async () => {
      const wasmPath = path.join(
        process.cwd(),
        'node_modules',
        'sql.js',
        'dist',
        'sql-wasm.wasm',
      );
      SQL ??= await initSqlJs({ locateFile: () => wasmPath });

      const primaryExists = fs.existsSync(/*turbopackIgnore: true*/ DB_PATH);
      const backupExists = fs.existsSync(/*turbopackIgnore: true*/ BACKUP_PATH);
      let restoredFromBackup = false;

      if (primaryExists) {
        const buffer = fs.readFileSync(/*turbopackIgnore: true*/ DB_PATH);
        if (buffer.length === 0) throw new Error(`数据库文件为空，已保留备份：${BACKUP_PATH}`);
        db = new SQL.Database(buffer);
        assertDatabaseIntegrity(db, DB_PATH);
      } else if (backupExists) {
        const buffer = fs.readFileSync(/*turbopackIgnore: true*/ BACKUP_PATH);
        db = new SQL.Database(buffer);
        assertDatabaseIntegrity(db, BACKUP_PATH);
        restoredFromBackup = true;
      } else {
        db = new SQL.Database();
      }

      db.run('PRAGMA foreign_keys = ON');
      const versionRow = queryOne<Record<string, number>>(db, 'PRAGMA user_version');
      const version = versionRow ? Number(Object.values(versionRow)[0]) : 0;
      const migrated = migrateDatabase(db, version);

      // 结构被改动过就必须立即落盘：否则迁移只存在于内存里，
      // 每次启动都会重跑一遍，而磁盘上的库永远补不上约束。
      if (migrated || !primaryExists || restoredFromBackup) saveToDisk(db);
    })();
  }

  try {
    await initPromise;
    return db!;
  } catch (error) {
    resetDatabaseState();
    throw error;
  }
}

function restoreInMemoryDatabase(snapshot: Uint8Array): void {
  if (!SQL) throw new Error('SQL.js 尚未初始化');
  db?.close();
  db = new SQL.Database(snapshot);
  db.run('PRAGMA foreign_keys = ON');
}

export async function dbRun(sql: string, params?: BindParams): Promise<void> {
  await dbTransaction((transaction) => transaction.run(sql, params));
}

export async function dbGet<T = unknown>(sql: string, params?: BindParams): Promise<T | undefined> {
  return queryOne<T>(await ensureDb(), sql, params);
}

export async function dbAll<T = unknown>(sql: string, params?: BindParams): Promise<T[]> {
  return queryAll<T>(await ensureDb(), sql, params);
}

/**
 * 同一回调中的所有 SQL 同属一个事务，并且只在提交后保存一次。
 * 回调必须保持同步，避免事务跨越事件循环并与其他请求交错。
 */
export async function dbTransaction<T>(fn: (transaction: DatabaseTransaction) => T): Promise<T> {
  const database = await ensureDb();
  const snapshot = database.export();
  const transaction = createTransaction(database);
  let committed = false;

  database.run('BEGIN TRANSACTION');
  try {
    const result = fn(transaction.api);
    if (result instanceof Promise) throw new Error('数据库事务回调不能是异步函数');
    database.run('COMMIT');
    committed = true;
    if (transaction.isDirty()) saveToDisk(database);
    return result;
  } catch (error) {
    if (!committed) {
      try {
        database.run('ROLLBACK');
      } catch {
        // 若 SQLite 已自行回滚，随后仍会用事务前快照恢复内存状态。
      }
    }
    restoreInMemoryDatabase(snapshot);
    throw error;
  }
}

export function closeDb(): void {
  resetDatabaseState();
}
