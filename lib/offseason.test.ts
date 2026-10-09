import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import type { LeagueStructure } from "@/lib/league-setup";
import { createLeague, deleteLeague, getLeague, listLeagues } from "@/lib/leagues";
import {
  discardOffseason,
  getOffseasonDraft,
  nextSeasonLabel,
  rerollOffseason,
  startOffseason,
} from "@/lib/offseason";
import {
  addExpansionTeam,
  cancelMove,
  planMove,
  removeExpansionTeam,
  setTeamRemoval,
} from "@/lib/offseason-plan";
import { saveSeasonResults } from "@/lib/results";
import { acceptLeague, generateLeague } from "@/lib/runs";
import { listTeams } from "@/lib/teams";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

const TWO_DIVISIONS: LeagueStructure = {
  kind: "divisions",
  divisions: [
    { name: "East", teamCount: 4 },
    { name: "West", teamCount: 4 },
  ],
};

function league(structure: LeagueStructure = { kind: "none" }, teamCount = 8): number {
  const id = createLeague(
    db,
    {
      name: "Continental League",
      seasonLabel: "Season 1",
      xpKickDistance: 2,
      teamCount,
      structure,
    },
    seededRng(1),
  );
  generateLeague(db, id, 1);
  acceptLeague(db, id);
  return id;
}

// Saves results where team i has i + 1 wins, so team 0 is worst, and the last
// team is champion.
function enterResults(leagueId: number) {
  const teams = listTeams(db, leagueId);
  const outcome = saveSeasonResults(db, leagueId, {
    teams: teams.map((team, index) => ({
      teamId: team.id,
      wins: String(index + 1),
      losses: String(teams.length - index),
      ties: "0",
      madePlayoffs: index >= teams.length - 2,
    })),
    championTeamId: teams[teams.length - 1].id,
  });
  expect(outcome.ok).toBe(true);
}

function readyLeague(structure?: LeagueStructure, teamCount?: number): number {
  const id = league(structure, teamCount);
  enterResults(id);
  return id;
}

function count(sql: string, ...args: number[]): number {
  return (db.prepare(sql).get(...args) as { total: number }).total;
}

describe("nextSeasonLabel", () => {
  it.each([
    ["Season 1", 2, "Season 2"],
    ["2016", 2, "2017"],
    ["Year 12", 2, "Year 13"],
    ["Opening Day", 2, "Season 2"],
    ["2016-17", 3, "Season 3"],
  ])("%s becomes %s", (label, sequence, expected) => {
    expect(nextSeasonLabel(label, sequence)).toBe(expected);
  });
});

describe("startOffseason", () => {
  it("saves the next season as a draft with a team for every current team", () => {
    const id = readyLeague(TWO_DIVISIONS);
    expect(startOffseason(db, id, 5)).toEqual({ ok: true });

    const seasons = db
      .prepare(
        "SELECT sequence, label, status, team_count AS teamCount FROM season ORDER BY sequence",
      )
      .all();
    expect(seasons).toEqual([
      { sequence: 1, label: "Season 1", status: "accepted", teamCount: 8 },
      { sequence: 2, label: "Season 2", status: "draft", teamCount: 8 },
    ]);
    const draft = getOffseasonDraft(db, id)!;
    expect(draft.teams).toHaveLength(8);
    expect(draft.teams.every((team) => !team.isNew)).toBe(true);
    expect(new Set(draft.teams.map((team) => team.divisionName))).toEqual(
      new Set(["East", "West"]),
    );
    expect(draft.teams.every((team) => team.franchisePoints >= 0)).toBe(true);
    expect(draft.log.length).toBeGreaterThan(0);
  });

  it("copies the divisions and leaves profiles empty", () => {
    const id = readyLeague(TWO_DIVISIONS);
    startOffseason(db, id, 5);
    const rows = db
      .prepare(
        `SELECT division.name AS name, division.team_count AS teamCount
         FROM division JOIN season ON season.id = division.season_id
         WHERE season.sequence = 2 ORDER BY division.position`,
      )
      .all();
    expect(rows).toEqual([
      { name: "East", teamCount: 4 },
      { name: "West", teamCount: 4 },
    ]);
    const filled = count(
      `SELECT COUNT(*) AS total FROM team_season JOIN season ON season.id = season_id
       WHERE season.sequence = 2 AND (offense_profile IS NOT NULL OR defense_profile IS NOT NULL
         OR offense_qualities IS NOT NULL OR kick_return IS NOT NULL OR fg_range IS NOT NULL)`,
    );
    expect(filled).toBe(0);
  });

  it("does not change the accepted season or show the draft elsewhere", () => {
    const id = readyLeague(TWO_DIVISIONS);
    const before = listTeams(db, id);
    startOffseason(db, id, 5);
    expect(listTeams(db, id)).toEqual(before);
    expect(getLeague(db, id)).toMatchObject({ status: "accepted", seasonLabel: "Season 1" });
    expect(listLeagues(db)).toEqual([
      { id, name: "Continental League", seasonLabel: "Season 1", teamCount: 8 },
    ]);
  });

  it("is repeatable from the same seed", () => {
    const id = readyLeague();
    startOffseason(db, id, 9);
    const first = getOffseasonDraft(db, id)!;
    expect(rerollOffseason(db, id, 9)).toEqual({ ok: true });
    const again = getOffseasonDraft(db, id)!;
    const strip = (teams: typeof first.teams) =>
      teams.map((team) => ({ ...team, id: 0, franchiseId: 0 }));
    expect(strip(again.teams)).toEqual(strip(first.teams));
    expect(again.log.map((line) => line.message)).toEqual(first.log.map((line) => line.message));
  });

  it("adds expansion teams as new franchises and leaves out contracted ones", () => {
    const id = readyLeague(TWO_DIVISIONS);
    const teams = listTeams(db, id);
    const east = teams[0].divisionId;
    addExpansionTeam(db, id, east, seededRng(3));
    setTeamRemoval(db, teams[7].id, true);
    const planned = db.prepare("SELECT city, nickname FROM expansion_team").get() as {
      city: string;
      nickname: string;
    };

    expect(startOffseason(db, id, 5)).toEqual({ ok: true });
    const draft = getOffseasonDraft(db, id)!;
    expect(draft.teams).toHaveLength(8);
    const added = draft.teams.filter((team) => team.isNew);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      city: planned.city,
      nickname: planned.nickname,
      divisionName: "East",
    });
    expect(draft.teams.some((team) => team.franchiseId === teams[7].franchiseId)).toBe(false);
    expect(count("SELECT COUNT(*) AS total FROM franchise")).toBe(9);
    // The contracted franchise stays active until feature 16 accepts the draft.
    expect(count("SELECT COUNT(*) AS total FROM franchise WHERE active = 1")).toBe(9);
    const division = db
      .prepare(
        `SELECT division.team_count AS teamCount FROM division JOIN season ON season.id = season_id
         WHERE season.sequence = 2 AND division.name = 'East'`,
      )
      .get();
    expect(division).toEqual({ teamCount: 5 });
  });

  it("applies a planned move and clears the flag on the new row", () => {
    const id = readyLeague();
    const [team] = listTeams(db, id);
    db.prepare("UPDATE team_season SET pending_move = 1 WHERE id = ?").run(team.id);
    planMove(db, team.id, seededRng(2));
    const city = (
      db.prepare("SELECT pending_move_city AS city FROM team_season WHERE id = ?").get(team.id) as {
        city: string;
      }
    ).city;

    startOffseason(db, id, 5);
    const moved = getOffseasonDraft(db, id)!.teams.find((t) => t.franchiseId === team.franchiseId)!;
    expect(moved.city).toBe(city);
    expect(moved.nickname).toBe(team.nickname);
    expect(
      count(
        `SELECT COUNT(*) AS total FROM team_season JOIN season ON season.id = season_id
         WHERE sequence = 2 AND (pending_move = 1 OR pending_move_city IS NOT NULL)`,
      ),
    ).toBe(0);
  });

  it("rolls a city for a pending move that was never planned", () => {
    const id = readyLeague();
    const [team] = listTeams(db, id);
    db.prepare("UPDATE team_season SET pending_move = 1 WHERE id = ?").run(team.id);
    startOffseason(db, id, 5);
    const moved = getOffseasonDraft(db, id)!.teams.find((t) => t.franchiseId === team.franchiseId)!;
    expect(moved.city).not.toBe(team.city);
  });

  it("keeps a canceled move's city", () => {
    const id = readyLeague();
    const [team] = listTeams(db, id);
    db.prepare("UPDATE team_season SET pending_move = 1 WHERE id = ?").run(team.id);
    planMove(db, team.id, seededRng(2));
    cancelMove(db, team.id);
    startOffseason(db, id, 5);
    const same = getOffseasonDraft(db, id)!.teams.find((t) => t.franchiseId === team.franchiseId)!;
    expect(same.city).toBe(team.city);
  });

  it("moves the coach grade by the record and carries the offense tag", () => {
    const id = readyLeague();
    const teams = listTeams(db, id);
    const champion = teams[teams.length - 1];
    db.prepare(
      "UPDATE team_season SET offense_tag = 'P+', head_coach_grade = 'C' WHERE id = ?",
    ).run(champion.id);
    startOffseason(db, id, 5);
    const draft = getOffseasonDraft(db, id)!;
    const row = draft.teams.find((team) => team.franchiseId === champion.franchiseId)!;
    expect(row.headCoachGrade).toBe("A");
    const tag = db
      .prepare(
        `SELECT offense_tag AS tag FROM team_season JOIN season ON season.id = season_id
         WHERE sequence = 2 AND franchise_id = ?`,
      )
      .get(champion.franchiseId);
    expect(tag).toEqual({ tag: "P+" });
  });

  describe("refusals", () => {
    it("refuses an unknown league", () => {
      expect(startOffseason(db, 99, 1)).toEqual({ ok: false, reason: "not-found" });
    });

    it("refuses a league that is not accepted", () => {
      const id = createLeague(
        db,
        {
          name: "L",
          seasonLabel: "Season 1",
          xpKickDistance: 2,
          teamCount: 8,
          structure: { kind: "none" },
        },
        seededRng(1),
      );
      expect(startOffseason(db, id, 1)).toEqual({ ok: false, reason: "not-accepted" });
    });

    it("refuses when a team has no result, and writes nothing", () => {
      const id = league();
      expect(startOffseason(db, id, 1)).toEqual({ ok: false, reason: "results-missing" });
      expect(count("SELECT COUNT(*) AS total FROM season")).toBe(1);
      expect(count("SELECT COUNT(*) AS total FROM franchise")).toBe(8);
    });

    it("refuses a second start", () => {
      const id = readyLeague();
      startOffseason(db, id, 1);
      expect(startOffseason(db, id, 2)).toEqual({ ok: false, reason: "already-started" });
      expect(count("SELECT COUNT(*) AS total FROM season")).toBe(2);
    });

    it("refuses a plan that breaks a limit made through the database", () => {
      const id = readyLeague();
      db.prepare("UPDATE team_season SET pending_removal = 1 WHERE position < 2").run();
      expect(startOffseason(db, id, 1)).toEqual({ ok: false, reason: "too-few" });
      expect(count("SELECT COUNT(*) AS total FROM season")).toBe(1);
    });

    it("refuses a re-roll and a discard before the start", () => {
      const id = readyLeague();
      expect(rerollOffseason(db, id, 1)).toEqual({ ok: false, reason: "not-started" });
      expect(discardOffseason(db, id)).toEqual({ ok: false, reason: "not-started" });
    });
  });
});

describe("re-roll and discard", () => {
  it("re-roll replaces the draft in full, including earlier expansion franchises", () => {
    const id = readyLeague();
    addExpansionTeam(db, id, null, seededRng(3));
    startOffseason(db, id, 1);
    expect(count("SELECT COUNT(*) AS total FROM franchise")).toBe(9);
    expect(count("SELECT COUNT(*) AS total FROM run WHERE kind = 'offseason'")).toBe(1);

    expect(rerollOffseason(db, id, 2)).toEqual({ ok: true });
    expect(count("SELECT COUNT(*) AS total FROM franchise")).toBe(9);
    expect(count("SELECT COUNT(*) AS total FROM season")).toBe(2);
    expect(count("SELECT COUNT(*) AS total FROM run WHERE kind = 'offseason'")).toBe(1);
    expect(getOffseasonDraft(db, id)!.seed).toBe(2);
    expect(getOffseasonDraft(db, id)!.teams.filter((team) => team.isNew)).toHaveLength(1);
  });

  it("discard removes the draft, its run and the expansion franchises, and unlocks the plan", () => {
    const id = readyLeague();
    addExpansionTeam(db, id, null, seededRng(3));
    startOffseason(db, id, 1);
    expect(discardOffseason(db, id)).toEqual({ ok: true });

    expect(getOffseasonDraft(db, id)).toBeNull();
    expect(count("SELECT COUNT(*) AS total FROM season")).toBe(1);
    expect(count("SELECT COUNT(*) AS total FROM franchise")).toBe(8);
    expect(count("SELECT COUNT(*) AS total FROM run WHERE kind = 'offseason'")).toBe(0);
    expect(count("SELECT COUNT(*) AS total FROM expansion_team")).toBe(1);
    expect(addExpansionTeam(db, id, null, seededRng(4))).toEqual({ ok: true });
  });

  it("deleting the league removes the draft too", () => {
    const id = readyLeague();
    startOffseason(db, id, 1);
    deleteLeague(db, id);
    expect(count("SELECT COUNT(*) AS total FROM season")).toBe(0);
    expect(count("SELECT COUNT(*) AS total FROM team_season")).toBe(0);
    expect(count("SELECT COUNT(*) AS total FROM run_log_entry")).toBe(0);
  });
});

describe("locks while a draft exists", () => {
  it("refuses plan changes", () => {
    const id = readyLeague(TWO_DIVISIONS);
    const [team] = listTeams(db, id);
    addExpansionTeam(db, id, team.divisionId, seededRng(3));
    const planned = (db.prepare("SELECT id FROM expansion_team").get() as { id: number }).id;
    startOffseason(db, id, 1);

    const refused = { ok: false, reason: "offseason-started" };
    expect(addExpansionTeam(db, id, team.divisionId, seededRng(4))).toEqual(refused);
    expect(removeExpansionTeam(db, planned)).toEqual(refused);
    expect(setTeamRemoval(db, team.id, true)).toEqual(refused);
    expect(planMove(db, team.id, seededRng(5))).toEqual(refused);
    expect(cancelMove(db, team.id)).toEqual(refused);
  });

  it("refuses saving results", () => {
    const id = readyLeague();
    startOffseason(db, id, 1);
    const outcome = saveSeasonResults(db, id, { teams: [], championTeamId: null });
    expect(outcome).toEqual({ ok: false, reason: "offseason-started" });
  });
});
