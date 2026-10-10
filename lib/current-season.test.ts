import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentSeasonId } from "@/lib/current-season";
import { openDatabase } from "@/lib/db";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  db.prepare("INSERT INTO league (id, name, created_at) VALUES (1, 'A', 'now')").run();
  db.prepare("INSERT INTO league (id, name, created_at) VALUES (2, 'B', 'now')").run();
});

afterEach(() => {
  db.close();
});

function addSeason(id: number, leagueId: number, sequence: number, status: string): void {
  db.prepare(
    `INSERT INTO season (id, league_id, sequence, label, xp_kick_distance, status, team_count)
     VALUES (?, ?, ?, 'S', 2, ?, 8)`,
  ).run(id, leagueId, sequence, status);
}

describe("currentSeasonId", () => {
  it("is the first season while it is a setup or draft season", () => {
    addSeason(1, 1, 1, "setup");
    expect(currentSeasonId(db, 1)).toBe(1);
    db.prepare("UPDATE season SET status = 'draft' WHERE id = 1").run();
    expect(currentSeasonId(db, 1)).toBe(1);
  });

  it("stays on the accepted season while an off-season draft exists", () => {
    addSeason(1, 1, 1, "accepted");
    addSeason(2, 1, 2, "draft");
    expect(currentSeasonId(db, 1)).toBe(1);
  });

  it("is the highest accepted season once there are several", () => {
    addSeason(1, 1, 1, "accepted");
    addSeason(2, 1, 2, "accepted");
    addSeason(3, 1, 3, "draft");
    expect(currentSeasonId(db, 1)).toBe(2);
    db.prepare("UPDATE season SET status = 'accepted' WHERE id = 3").run();
    expect(currentSeasonId(db, 1)).toBe(3);
  });

  it("looks only at the league asked for, and is undefined for an unknown one", () => {
    addSeason(1, 1, 1, "accepted");
    addSeason(2, 2, 1, "accepted");
    addSeason(3, 2, 2, "accepted");
    expect(currentSeasonId(db, 1)).toBe(1);
    expect(currentSeasonId(db, 2)).toBe(3);
    expect(currentSeasonId(db, 9)).toBeUndefined();
  });
});
