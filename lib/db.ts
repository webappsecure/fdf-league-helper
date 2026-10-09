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
  `
  CREATE TABLE franchise (
    id INTEGER PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES league (id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  );

  CREATE TABLE team_season (
    id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES season (id) ON DELETE CASCADE,
    franchise_id INTEGER NOT NULL REFERENCES franchise (id) ON DELETE CASCADE,
    division_id INTEGER REFERENCES division (id) ON DELETE SET NULL,
    position INTEGER NOT NULL,
    city TEXT NOT NULL,
    nickname TEXT NOT NULL,
    head_coach_name TEXT NOT NULL,
    primary_color TEXT NOT NULL,
    secondary_color TEXT NOT NULL,
    UNIQUE (season_id, franchise_id),
    UNIQUE (season_id, position)
  );
  `,
  `
  ALTER TABLE team_season ADD COLUMN ownership_style TEXT
    CHECK (ownership_style IN ('MEDDLING', 'SAVVY'));
  ALTER TABLE team_season ADD COLUMN ownership_loyalty TEXT
    CHECK (ownership_loyalty IN ('SELFISH', 'LOYAL'));
  ALTER TABLE team_season ADD COLUMN front_office_grade TEXT
    CHECK (front_office_grade IN ('A', 'B', 'C', 'D', 'F'));
  ALTER TABLE team_season ADD COLUMN head_coach_grade TEXT
    CHECK (head_coach_grade IN ('A', 'B', 'C', 'D', 'F'));

  CREATE TABLE run (
    id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES season (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('generation', 'offseason')),
    seed INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE run_log_entry (
    id INTEGER PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES run (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    step TEXT NOT NULL,
    franchise_id INTEGER REFERENCES franchise (id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    UNIQUE (run_id, position)
  );
  `,
  `
  ALTER TABLE team_season ADD COLUMN offense_profile TEXT
    CHECK (offense_profile IN ('PROLIFIC', 'PROLIFIC_SEMI', 'AVERAGE', 'DULL_SEMI', 'DULL'));
  -- A JSON array of { quality, strength } in card order.
  ALTER TABLE team_season ADD COLUMN offense_qualities TEXT;
  `,
  `
  ALTER TABLE team_season ADD COLUMN defense_profile TEXT
    CHECK (defense_profile IN ('STAUNCH', 'STAUNCH_SEMI', 'AVERAGE', 'INEPT_SEMI', 'INEPT'));
  -- A JSON array of { quality, strength } in card order.
  ALTER TABLE team_season ADD COLUMN defense_qualities TEXT;
  -- Null on a generated team means no return quality.
  ALTER TABLE team_season ADD COLUMN kick_return TEXT
    CHECK (kick_return IN ('ELECTRIC', 'ELECTRIC_SEMI'));
  ALTER TABLE team_season ADD COLUMN punt_return TEXT
    CHECK (punt_return IN ('ELECTRIC', 'ELECTRIC_SEMI'));
  -- Success ranges as printed in Table E, for example 11-63.
  ALTER TABLE team_season ADD COLUMN fg_range TEXT;
  ALTER TABLE team_season ADD COLUMN xp_range TEXT;
  `,
  `
  -- Set by hand and never generated. Null means the team has no tag.
  ALTER TABLE team_season ADD COLUMN offense_tag TEXT
    CHECK (offense_tag IN ('R', 'R+', 'P', 'P+'));
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
  if (globalForDb.fdfDatabase) {
    // A connection kept across a dev-server reload was opened by older code and
    // may be missing migrations added since. This is one PRAGMA read when it
    // is up to date.
    migrate(globalForDb.fdfDatabase);
  } else {
    globalForDb.fdfDatabase = openDatabase(
      process.env.FDF_DB_PATH ?? path.join(process.cwd(), "data", "fdf.sqlite"),
    );
  }
  return globalForDb.fdfDatabase;
}
