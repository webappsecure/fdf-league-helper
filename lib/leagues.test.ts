import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/lib/db";
import type { LeagueSetupInput } from "@/lib/league-setup";
import { createLeague, deleteLeague, getLeague, listLeagues } from "@/lib/leagues";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  vi.useRealTimers();
  db.close();
});

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

describe("createLeague and getLeague", () => {
  it("reads back a league with no structure", () => {
    const id = createLeague(db, setup({ seasonLabel: "2016", xpKickDistance: 15 }));

    expect(getLeague(db, id)).toEqual({
      id,
      name: "Continental League",
      seasonLabel: "2016",
      teamCount: 8,
      xpKickDistance: 15,
      conferences: [],
      divisions: [],
    });
    expect(db.prepare("SELECT status, sequence FROM season").get()).toEqual({
      status: "setup",
      sequence: 1,
    });
  });

  it("keeps divisions in the order they were entered", () => {
    const id = createLeague(
      db,
      setup({
        teamCount: 12,
        structure: {
          kind: "divisions",
          divisions: [
            { name: "West", teamCount: 5 },
            { name: "East", teamCount: 7 },
          ],
        },
      }),
    );

    const league = getLeague(db, id);

    expect(league?.conferences).toEqual([]);
    expect(league?.divisions.map(({ name, teamCount }) => [name, teamCount])).toEqual([
      ["West", 5],
      ["East", 7],
    ]);
  });

  it("keeps conferences and their divisions in order", () => {
    const id = createLeague(
      db,
      setup({
        teamCount: 16,
        structure: {
          kind: "conferences",
          conferences: [
            {
              name: "National",
              divisions: [
                { name: "South", teamCount: 4 },
                { name: "North", teamCount: 4 },
              ],
            },
            { name: "American", divisions: [{ name: "Central", teamCount: 8 }] },
          ],
        },
      }),
    );

    const league = getLeague(db, id);
    const shape = league?.conferences.map((conference) => [
      conference.name,
      conference.divisions.map((division) => division.name),
    ]);

    expect(shape).toEqual([
      ["National", ["South", "North"]],
      ["American", ["Central"]],
    ]);
    expect(league?.divisions).toEqual([]);
  });

  it("returns null for an unknown league", () => {
    expect(getLeague(db, 999)).toBeNull();
  });

  it("leaves nothing behind when creation fails partway", () => {
    const invalid = setup({
      structure: {
        kind: "divisions",
        divisions: [
          { name: "East", teamCount: 8 },
          { name: "West", teamCount: 0 },
        ],
      },
    });

    expect(() => createLeague(db, invalid)).toThrow();

    for (const table of ["league", "season", "conference", "division", "team_season"]) {
      expect(count(table), table).toBe(0);
    }
    expect(db.isTransaction).toBe(false);
  });
});

describe("listLeagues", () => {
  it("returns the newest league first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    createLeague(db, setup({ name: "Older" }));
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    createLeague(db, setup({ name: "Newer", teamCount: 10, seasonLabel: "2020" }));

    expect(listLeagues(db)).toEqual([
      { id: 2, name: "Newer", seasonLabel: "2020", teamCount: 10 },
      { id: 1, name: "Older", seasonLabel: "Season 1", teamCount: 8 },
    ]);
  });
});

describe("deleteLeague", () => {
  it("removes the league and everything in it, leaving others alone", () => {
    const structure: LeagueSetupInput["structure"] = {
      kind: "conferences",
      conferences: [{ name: "American", divisions: [{ name: "East", teamCount: 8 }] }],
    };
    const doomed = createLeague(db, setup({ name: "Doomed", structure }));
    const kept = createLeague(db, setup({ name: "Kept", structure }));

    deleteLeague(db, doomed);

    expect(getLeague(db, doomed)).toBeNull();
    expect(getLeague(db, kept)?.name).toBe("Kept");
    expect([count("league"), count("season"), count("conference"), count("division")]).toEqual([
      1, 1, 1, 1,
    ]);
  });
});
