import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Append only. An applied migration is never edited; later features add entries.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE league (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE season (
    id INTEGER PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES league (id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    label TEXT NOT NULL,
    xp_kick_distance INTEGER NOT NULL CHECK (xp_kick_distance IN (2, 15)),
    status TEXT NOT NULL CHECK (status IN ('setup', 'draft', 'accepted')),
    team_count INTEGER NOT NULL CHECK (team_count BETWEEN 8 AND 56),
    UNIQUE (league_id, sequence)
  );

  CREATE TABLE conference (
    id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES season (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE TABLE division (
    id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES season (id) ON DELETE CASCADE,
    conference_id INTEGER REFERENCES conference (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    team_count INTEGER NOT NULL CHECK (team_count >= 1)
  );
  `,
];

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    // SQLite may already have ended the transaction; a second ROLLBACK would
    // throw and hide the real error.
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export function openDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") {
    mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

// Kept on globalThis so dev-server module reloads reuse one connection.
const globalForDb = globalThis as { fdfDatabase?: DatabaseSync };

export function getDb(): DatabaseSync {
  globalForDb.fdfDatabase ??= openDatabase(
    process.env.FDF_DB_PATH ?? path.join(process.cwd(), "data", "fdf.sqlite"),
  );
  return globalForDb.fdfDatabase;
}
