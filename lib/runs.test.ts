import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import type { LeagueSetupInput } from "@/lib/league-setup";
import { createLeague, deleteLeague } from "@/lib/leagues";
import { basePoints } from "@/lib/reference/management-tables";
import { generateLeague, getGenerationRun } from "@/lib/runs";
import { listTeams } from "@/lib/teams";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

function league(teamCount = 8, identitySeed = 1): number {
  const input: LeagueSetupInput = {
    name: "Continental League",
    seasonLabel: "Season 1",
    xpKickDistance: 2,
    teamCount,
    structure: { kind: "none" },
  };
  return createLeague(db, input, seededRng(identitySeed));
}

function count(table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number };
  return row.total;
}

function status(leagueId: number): string {
  const row = db.prepare("SELECT status FROM season WHERE league_id = ?").get(leagueId) as {
    status: string;
  };
  return row.status;
}

function management(leagueId: number) {
  return listTeams(db, leagueId).map((team) => [
    team.ownershipStyle,
    team.ownershipLoyalty,
    team.frontOfficeGrade,
    team.headCoachGrade,
  ]);
}

describe("generateLeague", () => {
  it("saves the run, its log, every team's values and the draft status", () => {
    const id = league(10);

    const result = generateLeague(db, id, 4242);

    expect(result.ok).toBe(true);
    const run = getGenerationRun(db, id)!;
    expect(result).toEqual({ ok: true, runId: run.id });
    expect(run.seed).toBe(4242);
    expect(new Date(run.createdAt).toISOString()).toBe(run.createdAt);
    expect(status(id)).toBe("draft");

    const teams = listTeams(db, id);
    for (const team of teams) {
      expect(["A", "B", "C", "D"]).toContain(team.frontOfficeGrade);
      expect(["A", "B", "C", "D"]).toContain(team.headCoachGrade);
      expect(["MEDDLING", "SAVVY", null]).toContain(team.ownershipStyle);
      expect(["SELFISH", "LOYAL", null]).toContain(team.ownershipLoyalty);
    }

    // Four entries per team: each step in turn, teams in position order.
    const order = teams.map((team) => team.franchiseId);
    expect(run.entries.map((entry) => entry.step)).toEqual([
      ...Array(10).fill("ownership"),
      ...Array(10).fill("front-office"),
      ...Array(10).fill("head-coach"),
      ...Array(10).fill("franchise-points"),
    ]);
    expect(run.entries.map((entry) => entry.franchiseId)).toEqual([
      ...order,
      ...order,
      ...order,
      ...order,
    ]);
  });

  it("logs each team under the name and grades it was given", () => {
    const id = league();
    generateLeague(db, id, 7);

    const [team] = listTeams(db, id);
    const lines = getGenerationRun(db, id)!
      .entries.filter((entry) => entry.franchiseId === team.franchiseId)
      .map((entry) => entry.message);

    expect(lines).toHaveLength(4);
    expect(lines.every((line) => line.startsWith(`${team.city} ${team.nickname}: `))).toBe(true);
    expect(lines[1]).toContain(`Front Office Grade ${team.frontOfficeGrade}.`);
    expect(lines[2]).toContain(team.headCoachName);
    expect(lines[2]).toContain(`Head Coach Grade ${team.headCoachGrade}.`);
    expect(lines[3]).toBe(
      `${team.city} ${team.nickname}: Front Office ${team.frontOfficeGrade} and Head Coach ` +
        `${team.headCoachGrade}, ${basePoints(team.frontOfficeGrade!, team.headCoachGrade!)} FP.`,
    );
  });

  it("gives two leagues with the same teams the same values for the same seed", () => {
    const first = league(12, 5);
    const second = league(12, 5);
    const third = league(12, 5);

    generateLeague(db, first, 31337);
    generateLeague(db, second, 31337);
    generateLeague(db, third, 31338);

    expect(management(second)).toEqual(management(first));
    expect(getGenerationRun(db, second)!.entries.map((entry) => entry.message)).toEqual(
      getGenerationRun(db, first)!.entries.map((entry) => entry.message),
    );
    expect(management(third)).not.toEqual(management(first));
  });

  it("refuses to generate a league twice and changes nothing", () => {
    const id = league();
    generateLeague(db, id, 1);
    const before = { teams: listTeams(db, id), run: getGenerationRun(db, id) };

    expect(generateLeague(db, id, 2)).toEqual({ ok: false, reason: "already-generated" });

    expect({ teams: listTeams(db, id), run: getGenerationRun(db, id) }).toEqual(before);
    expect(count("run")).toBe(1);
  });

  it("refuses a league with no teams and leaves it in setup", () => {
    const id = league();
    db.exec("DELETE FROM team_season; DELETE FROM franchise;");

    expect(generateLeague(db, id, 1)).toEqual({ ok: false, reason: "no-teams" });

    expect(status(id)).toBe("setup");
    expect([count("run"), count("run_log_entry")]).toEqual([0, 0]);
  });

  it("reports an unknown league", () => {
    expect(generateLeague(db, 999, 1)).toEqual({ ok: false, reason: "not-found" });
    expect(db.isTransaction).toBe(false);
  });

  it("only touches the league it was asked to generate", () => {
    const generated = league();
    const untouched = league();

    generateLeague(db, generated, 1);

    expect(status(untouched)).toBe("setup");
    expect(getGenerationRun(db, untouched)).toBeNull();
    expect(management(untouched).flat().every((value) => value === null)).toBe(true);
  });
});

describe("getGenerationRun", () => {
  it("returns null before a league is generated and for an unknown league", () => {
    expect(getGenerationRun(db, league())).toBeNull();
    expect(getGenerationRun(db, 999)).toBeNull();
  });
});

describe("deleting a generated league", () => {
  it("removes its run and log and keeps other leagues' runs", () => {
    const doomed = league();
    const kept = league();
    generateLeague(db, doomed, 1);
    generateLeague(db, kept, 2);

    deleteLeague(db, doomed);

    expect(getGenerationRun(db, doomed)).toBeNull();
    expect(getGenerationRun(db, kept)!.entries).toHaveLength(32);
    expect([count("run"), count("run_log_entry")]).toEqual([1, 32]);
  });
});
