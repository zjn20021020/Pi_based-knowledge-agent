/**
 * SQLite 数据库单例(使用 sql.js,纯 JS 实现,无需编译)。
 * 提供类似 better-sqlite3 的同步 API。
 */
import initSqlJs, { type Database as SqlJsDB } from "sql.js";
import { join } from "path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";

const INDEX_DIR = join(process.cwd(), "index");
mkdirSync(INDEX_DIR, { recursive: true });

const DB_PATH = join(INDEX_DIR, "papers.db");

let _db: SqlJsDB | null = null;

// 启动时必须先调用这个初始化
export async function initDb(): Promise<void> {
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const buf = readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }
  _db.run("PRAGMA foreign_keys = ON");
}

// 初始化后可以同步获取
export function getDb(): SqlJsDB {
  if (!_db) throw new Error("Database not initialized. Call initDb() first.");
  return _db;
}

export function saveDb(): void {
  if (!_db) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

export function closeDb(): void {
  if (_db) {
    saveDb();
    _db.close();
    _db = null;
  }
}

// 兼容层:模拟 better-sqlite3 的 prepare() API
export interface PreparedStatement {
  run(...params: any[]): { changes: number };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

class Database {
  private db: SqlJsDB;

  constructor(db: SqlJsDB) {
    this.db = db;
  }

  prepare(sql: string): PreparedStatement {
    return {
      run: (...params: any[]) => {
        this.db.run(sql, params);
        saveDb();
        return { changes: 1 };
      },
      get: (...params: any[]) => {
        const result = this.db.exec(sql, params);
        if (result.length === 0 || result[0].values.length === 0) return undefined;
        const row = result[0].values[0];
        const obj: any = {};
        result[0].columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      },
      all: (...params: any[]) => {
        const result = this.db.exec(sql, params);
        if (result.length === 0) return [];
        return result[0].values.map((row) => {
          const obj: any = {};
          result[0].columns.forEach((col, i) => {
            obj[col] = row[i];
          });
          return obj;
        });
      },
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
    saveDb();
  }

  pragma(_: string): void {
    // sql.js doesn't support pragma
  }
}

// 模拟 better-sqlite3 的默认导出,返回兼容的 Database 对象
export default function(): Database {
  return new Database(getDb());
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS collections (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  abstract TEXT,
  published TEXT,
  pdf_path TEXT NOT NULL,
  parsed_at TEXT
);

CREATE TABLE IF NOT EXISTS collection_papers (
  collection_name TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_name, paper_id),
  FOREIGN KEY (collection_name) REFERENCES collections(name) ON DELETE CASCADE,
  FOREIGN KEY (paper_id) REFERENCES papers(id)
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  section_title TEXT,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  FOREIGN KEY (paper_id) REFERENCES papers(id),
  FOREIGN KEY (collection_name) REFERENCES collections(name) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collection_papers_paper ON collection_papers(paper_id);
CREATE INDEX IF NOT EXISTS idx_chunks_paper_col ON chunks(paper_id, collection_name);
`;
