import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, openDatabase, transaction } from "@/lib/db";
import { getLeague } from "@/lib/leagues";
import { fillTeams, listTeams } from "@/lib/teams";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "fdf-db-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function tableNames(file: string): string[] {
  const db = openDatabase(file);
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  db.close();
  return rows.map((row) => row.name);
}

describe("openDatabase", () => {
  it("creates the schema in a missing directory", () => {
    const file = path.join(dir, "nested", "fdf.sqlite");

    expect(tableNames(file)).toEqual([
      "conference",
      "division",
      "franchise",
      "league",
      "season",
      "team_season",
    ]);
  });

  it("records the migration version and is safe to open twice", () => {
    const file = path.join(dir, "fdf.sqlite");
    openDatabase(file).close();

    const db = openDatabase(file);
    const { user_version } = db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    db.close();

    expect(user_version).toBe(2);
    expect(tableNames(file)).toHaveLength(6);
  });

  it("upgrades a database from before teams existed and keeps its leagues", () => {
    const file = path.join(dir, "old.sqlite");
    // The schema exactly as migration 1 left it.
    const old = new DatabaseSync(file);
    old.exec(`
      CREATE TABLE league (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
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
      INSERT INTO league (id, name, created_at) VALUES (1, 'Old League', '2026-01-01T00:00:00.000Z');
      INSERT INTO season (id, league_id, sequence, label, xp_kick_distance, status, team_count)
        VALUES (1, 1, 1, 'Season 1', 2, 'setup', 8);
      PRAGMA user_version = 1;
    `);
    old.close();

    const db = openDatabase(file);

    expect(getLeague(db, 1)?.name).toBe("Old League");
    expect(listTeams(db, 1)).toEqual([]);
    expect(fillTeams(db, 1, Math.random)).toBe(8);
    expect(listTeams(db, 1)).toHaveLength(8);
    db.close();
  });

  it("removes a league's children when the league is deleted", () => {
    const db = openDatabase(":memory:");
    db.exec(`
      INSERT INTO league (id, name, created_at) VALUES (1, 'Test', '2026-01-01T00:00:00.000Z');
      INSERT INTO season (id, league_id, sequence, label, xp_kick_distance, status, team_count)
        VALUES (1, 1, 1, 'Season 1', 2, 'setup', 8);
      INSERT INTO conference (id, season_id, name, position) VALUES (1, 1, 'East', 0);
      INSERT INTO division (id, season_id, conference_id, name, position, team_count)
        VALUES (1, 1, 1, 'North', 0, 8);
    `);

    db.exec("DELETE FROM league WHERE id = 1");

    for (const table of ["season", "conference", "division"]) {
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as {
        total: number;
      };
      expect(total, table).toBe(0);
    }
    db.close();
  });
});

describe("getDb", () => {
  it("applies new migrations to a connection kept from before they existed", () => {
    const kept = new DatabaseSync(":memory:");
    kept.exec("CREATE TABLE league (id INTEGER PRIMARY KEY); PRAGMA user_version = 1;");
    const globalForDb = globalThis as { fdfDatabase?: DatabaseSync };
    globalForDb.fdfDatabase = kept;

    try {
      const db = getDb();

      expect(db).toBe(kept);
      expect(db.prepare("SELECT COUNT(*) AS total FROM team_season").get()).toEqual({ total: 0 });
    } finally {
      delete globalForDb.fdfDatabase;
      kept.close();
    }
  });
});

describe("transaction", () => {
  it("rolls back and rethrows when the work fails", () => {
    const db = openDatabase(":memory:");

    expect(() =>
      transaction(db, () => {
        db.exec("INSERT INTO league (name, created_at) VALUES ('Test', '2026-01-01')");
        throw new Error("work failed");
      }),
    ).toThrow("work failed");

    expect(db.prepare("SELECT COUNT(*) AS total FROM league").get()).toEqual({ total: 0 });
    expect(db.isTransaction).toBe(false);
    db.close();
  });

  it("surfaces the original error when the transaction has already ended", () => {
    const db = openDatabase(":memory:");

    expect(() =>
      transaction(db, () => {
        db.exec("ROLLBACK");
        throw new Error("original failure");
      }),
    ).toThrow("original failure");
    db.close();
  });
});
