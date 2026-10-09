import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import { createLeague } from "@/lib/leagues";
import { getOffseasonDraft, startOffseason } from "@/lib/offseason";
import { saveSeasonResults } from "@/lib/results";
import { acceptLeague, generateLeague } from "@/lib/runs";
import { listTeams } from "@/lib/teams";

// Training camp steps 7 to 9 are replaced with known results, so the test sees
// whether each value is saved in its own column.
vi.mock("@/lib/rules/camp-special-teams", () => ({
  runCampSpecialTeams: (teams: unknown[]) => ({
    results: teams.map((_, index) => ({
      kickReturn: "ELECTRIC",
      puntReturn: "ELECTRIC_SEMI",
      fgRange: `11-4${(index % 6) + 1}`,
      xpRange: `11-5${(index % 6) + 1}`,
    })),
    log: [],
  }),
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
});
