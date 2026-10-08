import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, transaction } from "@/lib/db";

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

    expect(tableNames(file)).toEqual(["conference", "division", "league", "season"]);
  });

  it("records the migration version and is safe to open twice", () => {
    const file = path.join(dir, "fdf.sqlite");
    openDatabase(file).close();

    const db = openDatabase(file);
    const { user_version } = db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    db.close();

    expect(user_version).toBe(1);
    expect(tableNames(file)).toHaveLength(4);
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
