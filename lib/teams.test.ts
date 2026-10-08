import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import type { Rng } from "@/lib/dice";
import type { LeagueSetupInput } from "@/lib/league-setup";
import { createLeague, deleteLeague, getLeague } from "@/lib/leagues";
import { generateLeague } from "@/lib/runs";
import { fillTeams, listTeams, rerollTeamField, updateTeamField } from "@/lib/teams";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

function seeded(seed: number): Rng {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function setup(overrides: Partial<LeagueSetupInput> = {}): LeagueSetupInput {
  return {
    name: "Continental League",
    seasonLabel: "Season 1",
    xpKickDistance: 2,
    teamCount: 8,
    structure: { kind: "none" },
    ...overrides,
  };
}

function count(table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number };
  return row.total;
}

// Removes a league's teams, leaving it as a league created before teams existed.
function stripTeams(): void {
  db.exec("DELETE FROM team_season; DELETE FROM franchise;");
}

describe("teams created with a league", () => {
  it("creates one team and one franchise per slot, in position order", () => {
    const id = createLeague(db, setup({ teamCount: 10 }), seeded(1));

    const teams = listTeams(db, id);

    expect(teams.map((team) => team.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(teams.every((team) => team.divisionId === null)).toBe(true);
    expect(new Set(teams.map((team) => team.franchiseId)).size).toBe(10);
    expect(
      teams.every(
        (team) =>
          team.ownershipStyle === null &&
          team.ownershipLoyalty === null &&
          team.frontOfficeGrade === null &&
          team.headCoachGrade === null &&
          team.offenseProfile === null &&
          team.offenseQualities === null &&
          team.defenseProfile === null &&
          team.defenseQualities === null &&
          team.kickReturn === null &&
          team.puntReturn === null &&
          team.fgRange === null &&
          team.xpRange === null,
      ),
    ).toBe(true);
    expect(teams.every((team) => team.city && team.nickname && team.headCoachName)).toBe(true);
    expect(count("franchise")).toBe(10);
    expect(db.prepare("SELECT DISTINCT league_id AS id, active FROM franchise").all()).toEqual([
      { id, active: 1 },
    ]);
  });

  it("gives each division its own number of teams, in display order", () => {
    const id = createLeague(
      db,
      setup({
        teamCount: 12,
        structure: {
          kind: "conferences",
          conferences: [
            {
              name: "National",
              divisions: [
                { name: "South", teamCount: 3 },
                { name: "North", teamCount: 2 },
              ],
            },
            { name: "American", divisions: [{ name: "Central", teamCount: 7 }] },
          ],
        },
      }),
      seeded(2),
    );
    const league = getLeague(db, id)!;
    const [south, north] = league.conferences[0].divisions;
    const [central] = league.conferences[1].divisions;

    const divisionIds = listTeams(db, id).map((team) => team.divisionId);

    expect(divisionIds).toEqual([
      ...Array(3).fill(south.id),
      ...Array(2).fill(north.id),
      ...Array(7).fill(central.id),
    ]);
  });

  it("lists only the teams of the requested league", () => {
    const first = createLeague(db, setup(), seeded(3));
    const second = createLeague(db, setup({ teamCount: 9 }), seeded(4));

    expect(listTeams(db, first)).toHaveLength(8);
    expect(listTeams(db, second)).toHaveLength(9);
    expect(listTeams(db, 999)).toEqual([]);
  });

  it("removes franchises and teams when the league is deleted", () => {
    const doomed = createLeague(db, setup(), seeded(5));
    const kept = createLeague(db, setup(), seeded(6));

    deleteLeague(db, doomed);

    expect(listTeams(db, doomed)).toEqual([]);
    expect(listTeams(db, kept)).toHaveLength(8);
    expect([count("franchise"), count("team_season")]).toEqual([8, 8]);
  });
});

describe("fillTeams", () => {
  it("fills a league that has no teams", () => {
    const id = createLeague(db, setup({ teamCount: 9 }), seeded(1));
    stripTeams();

    expect(fillTeams(db, id, seeded(2))).toBe(9);
    expect(listTeams(db, id)).toHaveLength(9);
  });

  it("changes nothing when the league already has teams", () => {
    const id = createLeague(db, setup(), seeded(1));
    const before = listTeams(db, id);

    expect(fillTeams(db, id, seeded(2))).toBe(0);
    expect(listTeams(db, id)).toEqual(before);
  });

  it("returns 0 for an unknown league", () => {
    expect(fillTeams(db, 999, seeded(1))).toBe(0);
  });
});

describe("updateTeamField", () => {
  it("saves one field and leaves the rest alone", () => {
    const id = createLeague(db, setup(), seeded(1));
    const [team, neighbor] = listTeams(db, id);

    expect(updateTeamField(db, team.id, "city", "Green Bay")).toBe(true);
    expect(updateTeamField(db, team.id, "secondaryColor", "#123456")).toBe(true);

    const [saved, untouched] = listTeams(db, id);
    expect(saved).toEqual({ ...team, city: "Green Bay", secondaryColor: "#123456" });
    expect(untouched).toEqual(neighbor);
  });

  it("returns false for an unknown team", () => {
    expect(updateTeamField(db, 999, "city", "Green Bay")).toBe(false);
  });
});

describe("rerollTeamField", () => {
  it.each(["city", "nickname", "headCoachName"] as const)(
    "saves a new %s that no team in the league holds",
    (field) => {
      const id = createLeague(db, setup({ teamCount: 56 }), seeded(1));
      const before = listTeams(db, id);
      const target = before[10];

      const rolled = rerollTeamField(db, target.id, field, seeded(7));

      const after = listTeams(db, id);
      expect(rolled).toEqual(after[10]);
      expect(before.map((team) => team[field])).not.toContain(after[10][field]);
      expect(after[10]).toEqual({ ...target, [field]: after[10][field] });
      expect(after.filter((team) => team.id !== target.id)).toEqual(
        before.filter((team) => team.id !== target.id),
      );
    },
  );

  it("saves a new color pair that no team in the league holds", () => {
    const id = createLeague(db, setup({ teamCount: 56 }), seeded(1));
    const pair = (team: { primaryColor: string; secondaryColor: string }) =>
      `${team.primaryColor}/${team.secondaryColor}`;
    const before = listTeams(db, id);

    rerollTeamField(db, before[0].id, "colors", seeded(7));

    const after = listTeams(db, id);
    expect(before.map(pair)).not.toContain(pair(after[0]));
    expect(after[0].city).toBe(before[0].city);
  });

  it("avoids other teams in the same league only", () => {
    const first = createLeague(db, setup(), seeded(1));
    createLeague(db, setup(), seeded(1));
    const target = listTeams(db, first)[0];
    // A roll of 0 is New York unless this league holds it.
    updateTeamField(db, target.id, "city", "Chicago");
    for (const team of listTeams(db, first).slice(1)) {
      updateTeamField(db, team.id, "city", `Town ${team.position}`);
    }

    expect(rerollTeamField(db, target.id, "city", () => 0)?.city).toBe("New York");
  });

  it("returns null for an unknown team", () => {
    expect(rerollTeamField(db, 999, "city", seeded(1))).toBeNull();
    expect(db.isTransaction).toBe(false);
  });
});

describe("teams of a generated league", () => {
  it("keep their drafted values when an identity field is edited or re-rolled", () => {
    const id = createLeague(db, setup(), seeded(1));
    generateLeague(db, id, 11);
    const [before] = listTeams(db, id);
    expect(Array.isArray(before.offenseQualities)).toBe(true);
    expect(Array.isArray(before.defenseQualities)).toBe(true);
    expect(before.fgRange).toMatch(/^11-/);

    updateTeamField(db, before.id, "city", "Renamed Town");
    const rolled = rerollTeamField(db, before.id, "nickname", seeded(3))!;

    expect(rolled.offenseProfile).toBe(before.offenseProfile);
    expect(rolled.offenseQualities).toEqual(before.offenseQualities);
    expect(rolled.defenseQualities).toEqual(before.defenseQualities);
    expect(listTeams(db, id)[0]).toEqual({
      ...before,
      city: "Renamed Town",
      nickname: rolled.nickname,
    });
  });
});
