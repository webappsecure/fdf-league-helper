import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import { createLeague, deleteLeague } from "@/lib/leagues";
import {
  addExpansionTeam,
  cancelMove,
  getOffseasonPlan,
  planMove,
  removeExpansionTeam,
  rerollExpansionTeam,
  setTeamRemoval,
  type PlanResult,
} from "@/lib/offseason-plan";
import { acceptLeague, generateLeague } from "@/lib/runs";
import { listTeams } from "@/lib/teams";
import type { LeagueStructure } from "@/lib/league-setup";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

function league(
  teamCount = 8,
  structure: LeagueStructure = { kind: "none" },
  accept = true,
): number {
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
  if (accept) {
    generateLeague(db, id, 1);
    acceptLeague(db, id);
  }
  return id;
}

const TWO_DIVISIONS: LeagueStructure = {
  kind: "divisions",
  divisions: [
    { name: "East", teamCount: 4 },
    { name: "West", teamCount: 4 },
  ],
};

function divisionIds(): number[] {
  return (db.prepare("SELECT id FROM division ORDER BY position").all() as { id: number }[]).map(
    (row) => row.id,
  );
}

function reason(result: PlanResult): string {
  return result.ok ? "ok" : result.reason;
}

describe("addExpansionTeam", () => {
  it("adds a team with identity and management but no qualities", () => {
    const id = league();
    expect(addExpansionTeam(db, id, null, seededRng(2))).toEqual({ ok: true });

    const plan = getOffseasonPlan(db, id);
    expect(plan.plannedTeamCount).toBe(9);
    const [team] = plan.expansionTeams;
    expect(team.city && team.nickname && team.headCoachName).toBeTruthy();
    expect(["A", "B", "C", "D", "F"]).toContain(team.frontOfficeGrade);
    expect(["A", "B", "C", "D", "F"]).toContain(team.headCoachGrade);
    expect(team.divisionId).toBeNull();
    expect(Object.keys(team)).not.toContain("offenseProfile");
    // The played season is untouched.
    expect(listTeams(db, id)).toHaveLength(8);
    expect(db.prepare("SELECT COUNT(*) AS n FROM franchise").get()).toEqual({ n: 8 });
  });

  it("is unique against current and planned teams", () => {
    const small = league(8);
    for (let seed = 1; seed <= 20; seed++) addExpansionTeam(db, small, null, seededRng(seed));
    const all = [
      ...listTeams(db, small).map((t) => t.city),
      ...getOffseasonPlan(db, small).expansionTeams.map((t) => t.city),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it("needs a division of this season in a league with divisions, and none otherwise", () => {
    const flat = league();
    expect(reason(addExpansionTeam(db, flat, 1, seededRng(1)))).toBe("division-required");

    const id = league(8, TWO_DIVISIONS);
    expect(reason(addExpansionTeam(db, id, null, seededRng(1)))).toBe("division-required");
    expect(reason(addExpansionTeam(db, id, 9999, seededRng(1)))).toBe("division-required");
    const [east] = divisionIds();
    expect(addExpansionTeam(db, id, east, seededRng(1))).toEqual({ ok: true });
    expect(getOffseasonPlan(db, id).expansionTeams[0].divisionId).toBe(east);
  });

  it("allows 56 teams and refuses 57", () => {
    const id = league(55);
    expect(addExpansionTeam(db, id, null, seededRng(1))).toEqual({ ok: true });
    expect(reason(addExpansionTeam(db, id, null, seededRng(2)))).toBe("too-many");
    expect(getOffseasonPlan(db, id).plannedTeamCount).toBe(56);
  });

  it("refuses a league that is not accepted or does not exist", () => {
    expect(
      reason(addExpansionTeam(db, league(8, { kind: "none" }, false), null, seededRng(1))),
    ).toBe("not-accepted");
    expect(reason(addExpansionTeam(db, 999, null, seededRng(1)))).toBe("not-found");
  });
});

describe("rerollExpansionTeam and removeExpansionTeam", () => {
  it("re-rolls in place, keeping the division and changing the identity", () => {
    const id = league(8, TWO_DIVISIONS);
    const [, west] = divisionIds();
    addExpansionTeam(db, id, west, seededRng(1));
    const before = getOffseasonPlan(db, id).expansionTeams[0];

    expect(rerollExpansionTeam(db, before.id, seededRng(7))).toEqual({ ok: true });
    const plan = getOffseasonPlan(db, id);
    expect(plan.expansionTeams).toHaveLength(1);
    expect(plan.expansionTeams[0].id).toBe(before.id);
    expect(plan.expansionTeams[0].divisionId).toBe(west);
    expect(plan.expansionTeams[0].city).not.toBe(before.city);
    expect(plan.expansionTeams[0].nickname).not.toBe(before.nickname);
  });

  it("removes a planned team, but not if that breaks a limit", () => {
    const id = league(8);
    addExpansionTeam(db, id, null, seededRng(1));
    const [team] = getOffseasonPlan(db, id).expansionTeams;
    // Contract one team so the planned team is what keeps the league at 8.
    const [first] = listTeams(db, id);
    expect(setTeamRemoval(db, first.id, true)).toEqual({ ok: true });
    expect(reason(removeExpansionTeam(db, team.id))).toBe("too-few");
    expect(getOffseasonPlan(db, id).expansionTeams).toHaveLength(1);

    setTeamRemoval(db, first.id, false);
    expect(removeExpansionTeam(db, team.id)).toEqual({ ok: true });
    expect(getOffseasonPlan(db, id).expansionTeams).toHaveLength(0);
  });

  it("reports an unknown planned team", () => {
    league();
    expect(reason(removeExpansionTeam(db, 999))).toBe("team-not-found");
    expect(reason(rerollExpansionTeam(db, 999, seededRng(1)))).toBe("team-not-found");
  });
});

describe("setTeamRemoval", () => {
  it("marks and unmarks a team and counts it", () => {
    const id = league(10);
    const [team] = listTeams(db, id);
    expect(setTeamRemoval(db, team.id, true)).toEqual({ ok: true });
    expect(getOffseasonPlan(db, id)).toMatchObject({
      removedTeamIds: [team.id],
      plannedTeamCount: 9,
    });
    expect(setTeamRemoval(db, team.id, false)).toEqual({ ok: true });
    expect(getOffseasonPlan(db, id).removedTeamIds).toEqual([]);
    // The team itself is never deleted.
    expect(listTeams(db, id)).toHaveLength(10);
  });

  it("allows 8 teams and refuses 7", () => {
    const id = league(9);
    const [a, b] = listTeams(db, id);
    expect(setTeamRemoval(db, a.id, true)).toEqual({ ok: true });
    expect(reason(setTeamRemoval(db, b.id, true))).toBe("too-few");
    expect(getOffseasonPlan(db, id).removedTeamIds).toEqual([a.id]);
  });

  it("refuses to unmark past 56", () => {
    const id = league(56);
    const [team] = listTeams(db, id);
    setTeamRemoval(db, team.id, true);
    addExpansionTeam(db, id, null, seededRng(1));
    expect(reason(setTeamRemoval(db, team.id, false))).toBe("too-many");
    expect(getOffseasonPlan(db, id).removedTeamIds).toEqual([team.id]);
  });

  it("keeps a team in every division", () => {
    const id = league(8, {
      kind: "divisions",
      divisions: [
        { name: "East", teamCount: 1 },
        { name: "West", teamCount: 7 },
      ],
    });
    const east = listTeams(db, id).find((team) => team.divisionId === divisionIds()[0])!;
    // Under 8 would also fail, so room first.
    addExpansionTeam(db, id, divisionIds()[1], seededRng(1));
    expect(reason(setTeamRemoval(db, east.id, true))).toBe("division-empty");
    addExpansionTeam(db, id, divisionIds()[0], seededRng(2));
    expect(setTeamRemoval(db, east.id, true)).toEqual({ ok: true });
    const [planned] = getOffseasonPlan(db, id).expansionTeams.filter(
      (team) => team.divisionId === divisionIds()[0],
    );
    expect(reason(removeExpansionTeam(db, planned.id))).toBe("division-empty");
  });

  it("clears a planned move city and refuses an unknown or non-accepted team", () => {
    const id = league(10);
    const [team] = listTeams(db, id);
    db.prepare("UPDATE team_season SET pending_move = 1 WHERE id = ?").run(team.id);
    planMove(db, team.id, seededRng(1));
    setTeamRemoval(db, team.id, true);
    expect(getOffseasonPlan(db, id).moves).toEqual([{ teamId: team.id, city: null }]);

    expect(reason(setTeamRemoval(db, 999, true))).toBe("team-not-found");
    const draft = league(8, { kind: "none" }, false);
    expect(reason(setTeamRemoval(db, listTeams(db, draft)[0].id, true))).toBe("not-accepted");
  });
});

describe("moves", () => {
  function flagged(): { id: number; teamId: number } {
    const id = league(10);
    const [team, other] = listTeams(db, id);
    db.prepare("UPDATE team_season SET pending_move = 1 WHERE id IN (?, ?)").run(team.id, other.id);
    return { id, teamId: team.id };
  }

  it("lists a flagged team without a city until the move is planned", () => {
    const { id, teamId } = flagged();
    expect(getOffseasonPlan(db, id).moves[0]).toEqual({ teamId, city: null });
  });

  it("rolls a city nobody else holds, and re-rolls it", () => {
    const { id, teamId } = flagged();
    addExpansionTeam(db, id, null, seededRng(4));
    expect(planMove(db, teamId, seededRng(1))).toEqual({ ok: true });
    const first = getOffseasonPlan(db, id).moves.find((m) => m.teamId === teamId)!.city!;

    const held = [
      ...listTeams(db, id).map((t) => t.city),
      ...getOffseasonPlan(db, id).expansionTeams.map((t) => t.city),
    ];
    expect(held).not.toContain(first);

    planMove(db, teamId, seededRng(2));
    const second = getOffseasonPlan(db, id).moves.find((m) => m.teamId === teamId)!.city!;
    expect(second).not.toBe(first);
    expect(held).not.toContain(second);
  });

  it("does not give two moving teams the same city", () => {
    const { id } = flagged();
    const [a, b] = getOffseasonPlan(db, id).moves;
    planMove(db, a.teamId, seededRng(5));
    planMove(db, b.teamId, seededRng(5));
    const [one, two] = getOffseasonPlan(db, id).moves;
    expect(one.city).not.toBe(two.city);
  });

  it("refuses a team with no pending move or one marked for removal", () => {
    const { id, teamId } = flagged();
    const plain = listTeams(db, id)[5];
    expect(reason(planMove(db, plain.id, seededRng(1)))).toBe("no-pending-move");
    expect(reason(cancelMove(db, plain.id))).toBe("no-pending-move");

    setTeamRemoval(db, teamId, true);
    expect(reason(planMove(db, teamId, seededRng(1)))).toBe("team-removed");
  });

  it("cancels a move, clearing the flag and city", () => {
    const { id, teamId } = flagged();
    planMove(db, teamId, seededRng(1));
    expect(cancelMove(db, teamId)).toEqual({ ok: true });
    expect(getOffseasonPlan(db, id).moves.map((m) => m.teamId)).not.toContain(teamId);
    expect(
      db.prepare("SELECT pending_move_city AS city FROM team_season WHERE id = ?").get(teamId),
    ).toEqual({ city: null });
  });
});

describe("league deletion", () => {
  it("removes the plan with the league", () => {
    const id = league();
    addExpansionTeam(db, id, null, seededRng(1));
    deleteLeague(db, id);
    expect(db.prepare("SELECT COUNT(*) AS n FROM expansion_team").get()).toEqual({ n: 0 });
  });
});
