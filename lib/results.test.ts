import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import { createLeague, deleteLeague } from "@/lib/leagues";
import {
  getSeasonResults,
  saveSeasonResults,
  validateSeasonResults,
  type SeasonResultsInput,
} from "@/lib/results";
import { acceptLeague, generateLeague } from "@/lib/runs";
import { listTeams } from "@/lib/teams";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

function league(accept = true): number {
  const id = createLeague(
    db,
    {
      name: "Continental League",
      seasonLabel: "Season 1",
      xpKickDistance: 2,
      teamCount: 8,
      structure: { kind: "none" },
    },
    seededRng(1),
  );
  if (accept) {
    generateLeague(db, id, 1);
    acceptLeague(db, id);
  }
  return id;
}

function input(leagueId: number, change: Partial<SeasonResultsInput> = {}): SeasonResultsInput {
  const ids = listTeams(db, leagueId).map((team) => team.id);
  return {
    teams: ids.map((teamId, index) => ({
      teamId,
      wins: String(index),
      losses: "10",
      ties: "",
      madePlayoffs: index < 2,
    })),
    championTeamId: ids[0],
    ...change,
  };
}

function ids(leagueId: number): number[] {
  return listTeams(db, leagueId).map((team) => team.id);
}

function errorsOf(value: unknown, teamIds: number[]) {
  const result = validateSeasonResults(value, teamIds);
  if (result.ok) throw new Error("expected errors");
  return result.errors;
}

describe("validateSeasonResults", () => {
  it("accepts valid results and reads blank ties as 0", () => {
    const id = league();
    const result = validateSeasonResults(input(id), ids(id));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results[0]).toMatchObject({ wins: 0, losses: 10, ties: 0, isChampion: true });
    expect(result.results.filter((r) => r.isChampion)).toHaveLength(1);
  });

  it("accepts 0 and 99 and rejects other values", () => {
    const id = league();
    const base = input(id);
    for (const [wins, ok] of [["0", true], ["99", true], ["-1", false], ["100", false], ["1.5", false], ["abc", false], ["", false]] as const) {
      const value = { ...base, teams: base.teams.map((t, i) => (i === 3 ? { ...t, wins } : t)) };
      expect(validateSeasonResults(value, ids(id)).ok).toBe(ok);
    }
  });

  it("names the team and field whose number is wrong", () => {
    const id = league();
    const base = input(id);
    const value = { ...base, teams: base.teams.map((t, i) => (i === 3 ? { ...t, ties: "x" } : t)) };
    expect(errorsOf(value, ids(id))).toEqual([
      {
        teamId: base.teams[3].teamId,
        field: "ties",
        message: "Enter ties as a whole number from 0 to 99.",
      },
    ]);
  });

  it("gives each bad field of one team its own error", () => {
    const id = league();
    const base = input(id);
    const value = {
      ...base,
      teams: base.teams.map((t, i) => (i === 3 ? { ...t, wins: "", losses: "100" } : t)),
    };
    expect(errorsOf(value, ids(id)).map(({ teamId, field }) => [teamId, field])).toEqual([
      [base.teams[3].teamId, "wins"],
      [base.teams[3].teamId, "losses"],
    ]);
  });

  it("rejects a missing, extra or duplicated team and a bad shape", () => {
    const id = league();
    const base = input(id);
    const teamIds = ids(id);
    for (const value of [
      { ...base, teams: base.teams.slice(1) },
      { ...base, teams: [...base.teams, { ...base.teams[0], teamId: 9999 }] },
      { ...base, teams: [...base.teams.slice(1), base.teams[1]] },
      null,
      { teams: "no", championTeamId: null },
      { ...base, teams: [{ teamId: 1 }] },
      { ...base, championTeamId: "1" },
    ]) {
      expect(errorsOf(value, teamIds)).toEqual([
        { teamId: null, field: null, message: expect.any(String) },
      ]);
    }
  });

  it("needs a champion who is a playoff team of this season", () => {
    const id = league();
    const base = input(id);
    expect(errorsOf({ ...base, championTeamId: null }, ids(id))).toEqual([
      { teamId: null, field: null, message: "Choose the league champion." },
    ]);
    expect(errorsOf({ ...base, championTeamId: 9999 }, ids(id))[0].teamId).toBeNull();
    expect(errorsOf({ ...base, championTeamId: base.teams[5].teamId }, ids(id))).toEqual([
      {
        teamId: base.teams[5].teamId,
        field: "playoffs",
        message: "The league champion must be a playoff team.",
      },
    ]);
  });
});

describe("saveSeasonResults", () => {
  it("saves, loads, and replaces on the next save", () => {
    const id = league();
    expect(getSeasonResults(db, id)).toEqual([]);
    expect(saveSeasonResults(db, id, input(id))).toEqual({ ok: true });
    expect(getSeasonResults(db, id)).toHaveLength(8);

    const base = input(id);
    const second = { ...base, championTeamId: base.teams[1].teamId };
    expect(saveSeasonResults(db, id, second)).toEqual({ ok: true });
    const saved = getSeasonResults(db, id);
    expect(saved).toHaveLength(8);
    expect(saved.filter((r) => r.isChampion).map((r) => r.teamId)).toEqual([base.teams[1].teamId]);
  });

  it("keeps the previous results when the new ones are invalid", () => {
    const id = league();
    saveSeasonResults(db, id, input(id));
    const before = getSeasonResults(db, id);
    const outcome = saveSeasonResults(db, id, input(id, { championTeamId: null }));
    expect(outcome).toMatchObject({ ok: false, reason: "invalid" });
    expect(getSeasonResults(db, id)).toEqual(before);
  });

  it("refuses an unknown league and one that is not accepted", () => {
    expect(saveSeasonResults(db, 999, {})).toEqual({ ok: false, reason: "not-found" });
    const id = league(false);
    expect(saveSeasonResults(db, id, input(id))).toEqual({ ok: false, reason: "not-accepted" });
    expect(getSeasonResults(db, id)).toEqual([]);
  });

  it("is removed with the league", () => {
    const id = league();
    saveSeasonResults(db, id, input(id));
    deleteLeague(db, id);
    const row = db.prepare("SELECT COUNT(*) AS total FROM season_result").get() as { total: number };
    expect(row.total).toBe(0);
  });
});
