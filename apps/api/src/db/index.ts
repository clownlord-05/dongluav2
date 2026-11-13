import initSqlJs, { Database as SqlJsDatabase, Statement as SqlJsStatement } from 'sql.js';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || './data/dongluav2.db';
const resolvedPath = path.resolve(DB_PATH);

// Ensure data directory exists
const dir = path.dirname(resolvedPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export interface StatementWrapper {
  run(...params: any[]): { changes: number };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

export interface DbWrapper {
  prepare(sql: string): StatementWrapper;
  exec(sql: string): void;
  pragma(sql: string): void;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
}

let sqlInstance: SqlJsDatabase | null = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;
let isSaving = false;
let pendingSave = false;

function saveDbToFile() {
  if (!sqlInstance || isSaving) {
    if (isSaving) pendingSave = true;
    return;
  }
  isSaving = true;
  pendingSave = false;
  try {
    const data = sqlInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFile(resolvedPath, buffer, (err) => {
      isSaving = false;
      if (err) {
        console.error('[DB] Failed to save database to file:', err);
      }
      if (pendingSave) {
        scheduleSave();
      }
    });
  } catch (err) {
    isSaving = false;
    console.error('[DB] Failed to export database:', err);
  }
}

function scheduleSave() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveDbToFile();
  }, 2000); // 2s debounce, async non-blocking save
}

// Ensure synchronous flush on process exit
const flushSyncOnExit = () => {
  if (sqlInstance) {
    try {
      const data = sqlInstance.export();
      fs.writeFileSync(resolvedPath, Buffer.from(data));
    } catch (e) {
      // Ignored
    }
  }
};
process.on('SIGINT', () => { flushSyncOnExit(); process.exit(0); });
process.on('SIGTERM', () => { flushSyncOnExit(); process.exit(0); });

function cleanValue(val: any): any {
  if (val === undefined) return null;
  return val;
}

function normalizeParams(params: any[]): any {
  if (params.length === 0) return [];
  if (params.length === 1) {
    if (Array.isArray(params[0])) {
      return params[0].map(cleanValue);
    }
    if (params[0] && typeof params[0] === 'object' && !(params[0] instanceof Uint8Array)) {
      const cleanedObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(params[0])) {
        cleanedObj[k] = cleanValue(v);
      }
      return cleanedObj;
    }
  }
  return params.map(cleanValue);
}

export async function initDb(): Promise<DbWrapper> {
  if (sqlInstance) return getDb();

  const SQL = await initSqlJs();
  let buffer: Buffer | null = null;

  if (fs.existsSync(resolvedPath)) {
    try {
      buffer = fs.readFileSync(resolvedPath);
    } catch (e) {
      console.warn('[DB] Could not read existing DB file, creating fresh:', e);
    }
  }

  sqlInstance = buffer ? new SQL.Database(buffer) : new SQL.Database();

  // Run schema
  const possiblePaths = [
    path.join(__dirname, 'schema.sql'),
    path.join(__dirname, '../src/db/schema.sql'),
    path.join(process.cwd(), 'src/db/schema.sql'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const schema = fs.readFileSync(p, 'utf-8');
      sqlInstance.exec(schema);
      break;
    }
  }

  // Ensure title column exists in room_playback (migration)
  try {
    sqlInstance.exec("ALTER TABLE room_playback ADD COLUMN title TEXT;");
  } catch (e) {
    // column already exists
  }

  // Performance indexes for 5,000-user scale (safe to run repeatedly via IF NOT EXISTS)
  try {
    sqlInstance.exec(`
      CREATE INDEX IF NOT EXISTS idx_room_members_room_active ON room_members(room_id, left_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_token_expires ON sessions(token, expires_at);
      CREATE INDEX IF NOT EXISTS idx_room_members_user_room ON room_members(user_id, room_id);
      CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_id, status);
    `);
  } catch (e) {
    // Indexes may already exist or be unsupported
  }

  saveDbToFile();
  console.log(`[DB] Connected and initialized: ${resolvedPath}`);

  return getDb();
}

export function getDb(): DbWrapper {
  if (!sqlInstance) {
    throw new Error('[DB] Database not initialized! Please await initDb() before using getDb().');
  }

  return {
    prepare(sql: string): StatementWrapper {
      return {
        run(...params: any[]) {
          const flatParams = normalizeParams(params);
          let stmt: SqlJsStatement | null = null;
          try {
            stmt = sqlInstance!.prepare(sql);
            if (flatParams.length > 0) {
              stmt.bind(flatParams);
            }
            stmt.step();
            const changes = sqlInstance!.getRowsModified();
            scheduleSave();
            return { changes };
          } finally {
            if (stmt) stmt.free();
          }
        },
        get(...params: any[]) {
          const flatParams = normalizeParams(params);
          let stmt: SqlJsStatement | null = null;
          try {
            stmt = sqlInstance!.prepare(sql);
            if (flatParams.length > 0) {
              stmt.bind(flatParams);
            }
            if (stmt.step()) {
              return stmt.getAsObject();
            }
            return undefined;
          } finally {
            if (stmt) stmt.free();
          }
        },
        all(...params: any[]) {
          const flatParams = normalizeParams(params);
          let stmt: SqlJsStatement | null = null;
          const rows: any[] = [];
          try {
            stmt = sqlInstance!.prepare(sql);
            if (flatParams.length > 0) {
              stmt.bind(flatParams);
            }
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
            return rows;
          } finally {
            if (stmt) stmt.free();
          }
        },
      };
    },

    exec(sql: string) {
      sqlInstance!.exec(sql);
      scheduleSave();
    },

    pragma(sql: string) {
      try {
        sqlInstance!.exec(`PRAGMA ${sql};`);
      } catch (e) {
        // Ignore unsupported pragmas like WAL in memory
      }
    },

    transaction<T extends (...args: any[]) => any>(fn: T): T {
      return ((...args: any[]) => {
        sqlInstance!.exec('BEGIN TRANSACTION;');
        try {
          const result = fn(...args);
          sqlInstance!.exec('COMMIT;');
          scheduleSave();
          return result;
        } catch (err) {
          sqlInstance!.exec('ROLLBACK;');
          throw err;
        }
      }) as T;
    },

    close() {
      if (sqlInstance) {
        saveDbToFile();
        sqlInstance.close();
        sqlInstance = null;
      }
    },
  };
}

export default getDb;
