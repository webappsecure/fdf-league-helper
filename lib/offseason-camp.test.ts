import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import { createLeague } from "@/lib/leagues";
import { getOffseasonDraft, startOffseason } from "@/lib/offseason";
import { addExpansionTeam } from "@/lib/offseason-plan";
import { saveSeasonResults } from "@/lib/results";
import { acceptLeague, generateLeague } from "@/lib/runs";
import { listTeams } from "@/lib/teams";

// Training camp steps 7 to 9 are replaced with known results, so the test sees
// whether each value is saved in its own column.
const stepInputs = vi.hoisted(() => ({ teams: [] as { previous: unknown }[] }));

vi.mock("@/lib/rules/camp-special-teams", () => ({
  runCampSpecialTeams: (teams: { previous: unknown }[]) => {
    stepInputs.teams = teams;
    return {
      results: teams.map((_, index) => ({
        kickReturn: "ELECTRIC",
        puntReturn: "ELECTRIC_SEMI",
        fgRange: `11-4${(index % 6) + 1}`,
        xpRange: `11-5${(index % 6) + 1}`,
      })),
      log: [],
    };
  },
}));
vi.mock("@/lib/rules/camp-events", () => ({
  runEvents: (teams: unknown[]) => ({ teams, log: [] }),
  runSaleOrMove: (teams: { pendingMove: boolean }[]) => ({
    teams: teams.map((team, index) => ({ ...team, pendingMove: index === 1 })),
    log: [],
  }),
}));

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

function readyLeague(): number {
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
  generateLeague(db, id, 1);
  acceptLeague(db, id);
  const teams = listTeams(db, id);
  const outcome = saveSeasonResults(db, id, {
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
  return id;
}

describe("saving training camp steps 7 to 9", () => {
  it("saves each special teams value in its own column, and the move flag", () => {
    const id = readyLeague();
    startOffseason(db, id, 5);

    const teams = getOffseasonDraft(db, id)!.teams;
    expect(teams).toHaveLength(8);
    teams.forEach((team, index) => {
      expect(team.kickReturn).toBe("ELECTRIC");
      expect(team.puntReturn).toBe("ELECTRIC_SEMI");
      expect(team.fgRange).toBe(`11-4${(index % 6) + 1}`);
      expect(team.xpRange).toBe(`11-5${(index % 6) + 1}`);
      expect(team.pendingMove).toBe(index === 1);
    });
  });

  it("gives step 7 each kept team's season-1 special teams, and none for an expansion team", () => {
    const id = readyLeague();
    const season1 = listTeams(db, id).map((team, index) => ({
      id: team.id,
      kickReturn: index % 2 === 0 ? "ELECTRIC" : null,
      puntReturn: index % 2 === 0 ? "ELECTRIC_SEMI" : "ELECTRIC",
      fgRange: `11-3${index + 1}`,
      xpRange: `11-2${index + 1}`,
    }));
    for (const team of season1) {
      db.prepare(
        "UPDATE team_season SET kick_return = ?, punt_return = ?, fg_range = ?, xp_range = ? WHERE id = ?",
      ).run(team.kickReturn, team.puntReturn, team.fgRange, team.xpRange, team.id);
    }
    expect(addExpansionTeam(db, id, null, Math.random)).toEqual({ ok: true });
    startOffseason(db, id, 5);

    expect(stepInputs.teams.map((team) => team.previous)).toEqual([
      ...season1.map(({ kickReturn, puntReturn, fgRange, xpRange }) => ({
        kickReturn,
        puntReturn,
        fgRange,
        xpRange,
      })),
      null,
    ]);
  });
});
