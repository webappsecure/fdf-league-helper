import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, openDatabase, transaction } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import { createLeague, getLeague } from "@/lib/leagues";
import { generateLeague, getGenerationRun } from "@/lib/runs";
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
      "run",
      "run_log_entry",
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

    expect(user_version).toBe(6);
    expect(tableNames(file)).toHaveLength(8);
  });

  it("upgrades a database from before management rolls and keeps its teams", () => {
    const file = path.join(dir, "v2.sqlite");
    // The team table exactly as migration 2 left it, with one team in it.
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
      INSERT INTO league (id, name, created_at) VALUES (1, 'Old League', '2026-01-01T00:00:00.000Z');
      INSERT INTO season (id, league_id, sequence, label, xp_kick_distance, status, team_count)
        VALUES (1, 1, 1, 'Season 1', 2, 'setup', 8);
      INSERT INTO franchise (id, league_id) VALUES (1, 1);
      INSERT INTO team_season (season_id, franchise_id, position, city, nickname,
                               head_coach_name, primary_color, secondary_color)
        VALUES (1, 1, 0, 'Chicago', 'Aces', 'Adam Adams', '#000000', '#ffffff');
      PRAGMA user_version = 2;
    `);
    old.close();

    const db = openDatabase(file);

    expect(listTeams(db, 1)).toEqual([
      expect.objectContaining({
        city: "Chicago",
        franchiseId: 1,
        ownershipStyle: null,
        ownershipLoyalty: null,
        frontOfficeGrade: null,
        headCoachGrade: null,
        offenseProfile: null,
        offenseQualities: null,
      }),
    ]);
    expect(generateLeague(db, 1, 7).ok).toBe(true);
    expect(listTeams(db, 1)[0].frontOfficeGrade).not.toBeNull();
    db.close();
  });

  it("upgrades a generated league from before the offense draft and keeps its values", () => {
    const file = path.join(dir, "v3.sqlite");
    // Only what migration 4 touches needs its exact earlier shape: the team
    // table as migration 3 left it, holding one generated team.
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
        ownership_style TEXT CHECK (ownership_style IN ('MEDDLING', 'SAVVY')),
        ownership_loyalty TEXT CHECK (ownership_loyalty IN ('SELFISH', 'LOYAL')),
        front_office_grade TEXT CHECK (front_office_grade IN ('A', 'B', 'C', 'D', 'F')),
        head_coach_grade TEXT CHECK (head_coach_grade IN ('A', 'B', 'C', 'D', 'F')),
        UNIQUE (season_id, franchise_id),
        UNIQUE (season_id, position)
      );
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
      INSERT INTO league (id, name, created_at) VALUES (1, 'Old League', '2026-01-01T00:00:00.000Z');
      INSERT INTO season (id, league_id, sequence, label, xp_kick_distance, status, team_count)
        VALUES (1, 1, 1, 'Season 1', 2, 'draft', 8);
      INSERT INTO franchise (id, league_id) VALUES (1, 1);
      INSERT INTO team_season (season_id, franchise_id, position, city, nickname,
                               head_coach_name, primary_color, secondary_color,
                               ownership_style, front_office_grade, head_coach_grade)
        VALUES (1, 1, 0, 'Chicago', 'Aces', 'Adam Adams', '#000000', '#ffffff', 'SAVVY', 'A', 'B');
      INSERT INTO run (id, season_id, kind, seed, created_at)
        VALUES (1, 1, 'generation', 5, '2026-01-01T00:00:00.000Z');
      INSERT INTO run_log_entry (run_id, position, step, franchise_id, message)
        VALUES (1, 0, 'ownership', 1, 'Chicago Aces: style roll 6, SAVVY.');
      PRAGMA user_version = 3;
    `);
    old.close();

    const db = openDatabase(file);

    expect(listTeams(db, 1)).toEqual([
      expect.objectContaining({
        city: "Chicago",
        ownershipStyle: "SAVVY",
        frontOfficeGrade: "A",
        headCoachGrade: "B",
        offenseProfile: null,
        offenseQualities: null,
        defenseProfile: null,
        fgRange: null,
      }),
    ]);
    expect(getGenerationRun(db, 1)?.entries).toHaveLength(1);
    expect(generateLeague(db, 1, 7)).toEqual({ ok: false, reason: "already-generated" });
    expect(() =>
      db.exec("UPDATE team_season SET offense_profile = 'SPLENDID' WHERE id = 1"),
    ).toThrow();
    db.close();
  });

  it("upgrades a league drafted before defense existed and keeps its offense", () => {
    const file = path.join(dir, "v4.sqlite");
    // A current database wound back to version 4: the columns migrations 5 and
    // 6 add are dropped, leaving one team with its offense drafted.
    const old = openDatabase(file);
    old.exec(`
      ALTER TABLE team_season DROP COLUMN offense_tag;
      ALTER TABLE team_season DROP COLUMN defense_profile;
      ALTER TABLE team_season DROP COLUMN defense_qualities;
      ALTER TABLE team_season DROP COLUMN kick_return;
      ALTER TABLE team_season DROP COLUMN punt_return;
      ALTER TABLE team_season DROP COLUMN fg_range;
      ALTER TABLE team_season DROP COLUMN xp_range;
      INSERT INTO league (id, name, created_at) VALUES (1, 'Old League', '2026-01-01T00:00:00.000Z');
      INSERT INTO season (id, league_id, sequence, label, xp_kick_distance, status, team_count)
        VALUES (1, 1, 1, 'Season 1', 2, 'draft', 8);
      INSERT INTO franchise (id, league_id) VALUES (1, 1);
      INSERT INTO team_season (season_id, franchise_id, position, city, nickname,
                               head_coach_name, primary_color, secondary_color,
                               front_office_grade, head_coach_grade,
                               offense_profile, offense_qualities)
        VALUES (1, 1, 0, 'Chicago', 'Aces', 'Adam Adams', '#000000', '#ffffff', 'A', 'B',
                'PROLIFIC', '[{"quality":"DYNAMIC","strength":"SEMI"}]');
      PRAGMA user_version = 4;
    `);
    old.close();

    const db = openDatabase(file);

    expect(listTeams(db, 1)).toEqual([
      expect.objectContaining({
        city: "Chicago",
        headCoachGrade: "B",
        offenseProfile: "PROLIFIC",
        offenseQualities: [{ quality: "DYNAMIC", strength: "SEMI" }],
        defenseProfile: null,
        defenseQualities: null,
        kickReturn: null,
        puntReturn: null,
        fgRange: null,
        xpRange: null,
      }),
    ]);
    expect(() =>
      db.exec("UPDATE team_season SET defense_profile = 'SPLENDID' WHERE id = 1"),
    ).toThrow();
    expect(() => db.exec("UPDATE team_season SET kick_return = 'SHOCKING' WHERE id = 1")).toThrow();
    db.close();
  });

  it("upgrades a generated league from before offense tags and leaves its teams untagged", () => {
    const file = path.join(dir, "v5.sqlite");
    const first = openDatabase(file);
    const leagueId = createLeague(
      first,
      {
        name: "Old League",
        seasonLabel: "Season 1",
        xpKickDistance: 2,
        teamCount: 8,
        structure: { kind: "none" },
      },
      seededRng(3),
    );
    generateLeague(first, leagueId, 7);
    // The schema as migration 5 left it.
    first.exec("ALTER TABLE team_season DROP COLUMN offense_tag; PRAGMA user_version = 5;");
    first.close();

    const db = openDatabase(file);

    const { user_version } = db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    expect(user_version).toBe(6);
    const teams = listTeams(db, leagueId);
    expect(teams).toHaveLength(8);
    expect(teams.every((team) => team.offenseTag === null)).toBe(true);
    expect(teams.every((team) => team.offenseProfile !== null)).toBe(true);
    expect(() =>
      db.prepare("UPDATE team_season SET offense_tag = 'X' WHERE id = ?").run(teams[0].id),
    ).toThrow();
    db.prepare("UPDATE team_season SET offense_tag = 'P+' WHERE id = ?").run(teams[0].id);
    expect(listTeams(db, leagueId)[0].offenseTag).toBe("P+");
    db.close();
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
      expect(db.prepare("SELECT COUNT(*) AS total FROM run").get()).toEqual({ total: 0 });
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
