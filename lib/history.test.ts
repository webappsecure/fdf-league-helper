import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import { createLeague, getLeague, getSeasonLeague, listAcceptedSeasons } from "@/lib/leagues";
import { acceptOffseason, startOffseason } from "@/lib/offseason";
import { getResultsBySeason, getSeasonResults, saveSeasonResults } from "@/lib/results";
import { acceptLeague, generateLeague, getRunBySeason, getSeasonRun } from "@/lib/runs";
import { listSeasonTeams, listTeams, updateTeamField } from "@/lib/teams";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

function accepted(name = "Continental League"): number {
  const id = createLeague(
    db,
    {
      name,
      seasonLabel: "Season 1",
      xpKickDistance: 2,
      teamCount: 8,
      structure: {
        kind: "divisions",
        divisions: [
          { name: "East", teamCount: 4 },
          { name: "West", teamCount: 4 },
        ],
      },
    },
    seededRng(1),
  );
  generateLeague(db, id, 1);
  acceptLeague(db, id);
  return id;
}

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

describe("season history", () => {
  it("lists only accepted seasons, newest first, and marks the current one", () => {
    const id = accepted();
    expect(listAcceptedSeasons(db, id)).toMatchObject([{ sequence: 1, isCurrent: true }]);

    enterResults(id);
    startOffseason(db, id, 1);
    expect(listAcceptedSeasons(db, id).map((season) => season.sequence)).toEqual([1]);
    expect(getSeasonLeague(db, id, 2)).toBeNull();

    acceptOffseason(db, id);
    expect(listAcceptedSeasons(db, id)).toMatchObject([
      { sequence: 2, label: "Season 2", isCurrent: true },
      { sequence: 1, label: "Season 1", isCurrent: false },
    ]);
  });

  it("does not list a first season that was never accepted", () => {
    const id = createLeague(
      db,
      {
        name: "New",
        seasonLabel: "Season 1",
        xpKickDistance: 2,
        teamCount: 8,
        structure: { kind: "none" },
      },
      seededRng(1),
    );
    expect(listAcceptedSeasons(db, id)).toEqual([]);
    expect(getSeasonLeague(db, id, 1)).toBeNull();
  });

  it("reads a past season as it was after the current one changed", () => {
    const id = accepted();
    const before = listTeams(db, id);
    enterResults(id);
    const results = getSeasonResults(db, id);
    startOffseason(db, id, 1);
    acceptOffseason(db, id);
    updateTeamField(db, listTeams(db, id)[0].id, "city", "Renamed");

    const past = getSeasonLeague(db, id, 1)!;
    expect(past).toMatchObject({ seasonLabel: "Season 1", status: "accepted", sequence: 1 });
    expect(past.divisions.map((division) => division.name)).toEqual(["East", "West"]);
    expect(getLeague(db, id)).toMatchObject({ seasonLabel: "Season 2" });

    expect(listSeasonTeams(db, past.seasonId)).toEqual(before);
    expect(getResultsBySeason(db, past.seasonId)).toEqual(results);
    expect(getRunBySeason(db, past.seasonId)).toMatchObject({ kind: "generation" });
    expect(getSeasonRun(db, id)).toMatchObject({ kind: "offseason" });

    const current = getSeasonLeague(db, id, 2)!;
    expect(getRunBySeason(db, current.seasonId)).toMatchObject({ kind: "offseason" });
    expect(getResultsBySeason(db, current.seasonId)).toEqual([]);
  });

  it("carries the saved special results of a season", () => {
    const id = accepted();
    enterResults(id);
    startOffseason(db, id, 1);
    acceptOffseason(db, id);
    const season2 = getSeasonLeague(db, id, 2)!.seasonId;
    expect(listSeasonTeams(db, season2).every((team) => team.offenseSpecialResult === null)).toBe(
      true,
    );

    const [team] = listSeasonTeams(db, season2);
    db.prepare(
      "UPDATE team_season SET offense_special_result = ?, defense_special_result = ? WHERE id = ?",
    ).run("Offense result", "Defense result", team.id);

    expect(listSeasonTeams(db, season2)[0]).toMatchObject({
      offenseSpecialResult: "Offense result",
      defenseSpecialResult: "Defense result",
    });
    expect(listTeams(db, id)[0]).toMatchObject({ offenseSpecialResult: "Offense result" });
    expect(
      listSeasonTeams(db, getSeasonLeague(db, id, 1)!.seasonId)[0].offenseSpecialResult,
    ).toBeNull();
  });

  it("finds nothing for another league's season or an unknown sequence", () => {
    const first = accepted();
    const second = accepted("Other League");
    expect(getSeasonLeague(db, first, 3)).toBeNull();
    expect(getSeasonLeague(db, first, 1)?.id).toBe(first);
    expect(getSeasonLeague(db, second, 1)?.id).toBe(second);
    expect(getSeasonLeague(db, first, 1)!.seasonId).not.toBe(
      getSeasonLeague(db, second, 1)!.seasonId,
    );
    expect(listAcceptedSeasons(db, 999)).toEqual([]);
  });
});
