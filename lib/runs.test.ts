import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import type { LeagueSetupInput } from "@/lib/league-setup";
import { createLeague, deleteLeague } from "@/lib/leagues";
import { basePoints } from "@/lib/reference/management-tables";
import { DEFENSE_PAIRS } from "@/lib/reference/defense-tables";
import { OFFENSE_PAIRS } from "@/lib/reference/offense-tables";
import { pairIndexIn } from "@/lib/reference/profile-tables";
import { GENERATION_STEPS } from "@/lib/rules/generation";
import { acceptLeague, generateLeague, getSeasonRun, rerollLeague } from "@/lib/runs";
import { listTeams, updateTeamField } from "@/lib/teams";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

function league(
  teamCount = 8,
  identitySeed = 1,
  xpKickDistance: LeagueSetupInput["xpKickDistance"] = 2,
): number {
  const input: LeagueSetupInput = {
    name: "Continental League",
    seasonLabel: "Season 1",
    xpKickDistance,
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

function offense(leagueId: number) {
  return listTeams(db, leagueId).map((team) => [team.offenseProfile, team.offenseQualities]);
}

// Defense and special teams, the values of steps 12 to 14.
function drafted(leagueId: number) {
  return listTeams(db, leagueId).map((team) => [
    team.defenseProfile,
    team.defenseQualities,
    team.kickReturn,
    team.puntReturn,
    team.fgRange,
    team.xpRange,
  ]);
}

// Everything a re-roll or an accept may change for one league.
function snapshot(leagueId: number) {
  return {
    status: status(leagueId),
    teams: listTeams(db, leagueId),
    run: getSeasonRun(db, leagueId),
  };
}

function messages(leagueId: number): string[] {
  return getSeasonRun(db, leagueId)!.entries.map((entry) => entry.message);
}

describe("generateLeague", () => {
  it("saves the run, its log, every team's values and the draft status", () => {
    const id = league(10);

    const result = generateLeague(db, id, 4242);

    expect(result.ok).toBe(true);
    const run = getSeasonRun(db, id)!;
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

    // Four management entries per team: each step in turn, teams in position
    // order. The offense draft follows.
    const order = teams.map((team) => team.franchiseId);
    const managed = run.entries.slice(0, 40);
    expect(managed.map((entry) => entry.step)).toEqual([
      ...Array(10).fill("ownership"),
      ...Array(10).fill("front-office"),
      ...Array(10).fill("head-coach"),
      ...Array(10).fill("franchise-points"),
    ]);
    expect(managed.map((entry) => entry.franchiseId)).toEqual([
      ...order,
      ...order,
      ...order,
      ...order,
    ]);
  });

  it("saves every team's offense and the draft's log after the management steps", () => {
    const id = league(10);

    generateLeague(db, id, 4242);

    const teams = listTeams(db, id);
    for (const team of teams) {
      expect(["PROLIFIC", "PROLIFIC_SEMI", "AVERAGE", "DULL_SEMI", "DULL"]).toContain(
        team.offenseProfile,
      );
      const pairs = team.offenseQualities!.map((entry) => pairIndexIn(OFFENSE_PAIRS, entry.quality));
      expect(pairs).toEqual([...new Set(pairs)].sort((a, b) => a - b));
      expect(team.offenseQualities!.every((entry) => /^(FULL|SEMI)$/.test(entry.strength))).toBe(
        true,
      );
    }
    expect(teams.filter((team) => team.offenseProfile === "PROLIFIC")).toHaveLength(1);
    expect(teams.filter((team) => team.offenseProfile === "PROLIFIC_SEMI")).toHaveLength(1);
    // QV is 2: four teams are efficient and four inefficient.
    const efficiency = teams.flatMap((team) =>
      team.offenseQualities!.filter((entry) => pairIndexIn(OFFENSE_PAIRS, entry.quality) === 5),
    );
    expect(efficiency).toHaveLength(8);

    const entries = getSeasonRun(db, id)!.entries;
    expect([...new Set(entries.map((entry) => entry.step))]).toEqual([...GENERATION_STEPS]);
    expect(entries[40]).toEqual({
      step: "qv-cdv",
      franchiseId: null,
      message: "10 teams: QV 2, CDV 1.",
    });
    const known = new Set(teams.map((team) => team.franchiseId));
    expect(entries.slice(41).every((entry) => entry.franchiseId === null || known.has(entry.franchiseId))).toBe(true);
  });

  it("saves every team's defense and special teams", () => {
    const id = league(10);

    generateLeague(db, id, 4242);

    const teams = listTeams(db, id);
    for (const team of teams) {
      expect(["STAUNCH", "STAUNCH_SEMI", "AVERAGE", "INEPT_SEMI", "INEPT"]).toContain(
        team.defenseProfile,
      );
      const pairs = team.defenseQualities!.map((entry) =>
        pairIndexIn(DEFENSE_PAIRS, entry.quality),
      );
      expect(pairs).not.toContain(-1);
      expect(pairs).toEqual([...new Set(pairs)].sort((a, b) => a - b));
      expect(["ELECTRIC", "ELECTRIC_SEMI", null]).toContain(team.kickReturn);
      expect(["ELECTRIC", "ELECTRIC_SEMI", null]).toContain(team.puntReturn);
      expect(team.fgRange).toMatch(/^11-[4-6][1-6]$/);
      expect(team.xpRange).toMatch(/^11-6[3-6]$/);
    }
    expect(teams.filter((team) => team.defenseProfile === "STAUNCH")).toHaveLength(1);
    expect(teams.filter((team) => team.defenseProfile === "STAUNCH_SEMI")).toHaveLength(1);

    // Each team's four first rolls are logged in team order.
    const rolls = getSeasonRun(db, id)!.entries.filter(
      (entry) => entry.step === "special-teams" && entry.message.includes("Kickoff return roll"),
    );
    expect(rolls.map((entry) => entry.franchiseId)).toEqual(teams.map((team) => team.franchiseId));
  });

  it("takes each league's XP range from the column for its kick distance", () => {
    // Seeds chosen only to give enough teams; the columns share 11-61 to 11-66
    // only above 11-62, so any 11-56, 11-61 or 11-62 proves the 15-yard column.
    const xp = (distance: 2 | 15) =>
      [1, 2, 3, 4, 5, 6].flatMap((seed) => {
        const id = league(8, seed, distance);
        generateLeague(db, id, seed);
        return listTeams(db, id).map((team) => team.xpRange!);
      });

    expect(xp(2).every((range) => /^11-6[3-6]$/.test(range))).toBe(true);
    expect(xp(15).some((range) => /^11-(56|61|62)$/.test(range))).toBe(true);
  });

  it("stores qualities as JSON text in card order", () => {
    const id = league();
    generateLeague(db, id, 9);

    const stored = db
      .prepare(
        `SELECT offense_qualities AS offense, defense_qualities AS defense
         FROM team_season ORDER BY position`,
      )
      .all() as { offense: string; defense: string }[];

    expect(stored.map((row) => JSON.parse(row.offense))).toEqual(
      listTeams(db, id).map((team) => team.offenseQualities),
    );
    expect(stored.map((row) => JSON.parse(row.defense))).toEqual(
      listTeams(db, id).map((team) => team.defenseQualities),
    );
    expect(stored.every((row) => row.offense.startsWith("[") && row.defense.startsWith("["))).toBe(
      true,
    );
  });

  it("saves nothing when a team's values cannot be stored", () => {
    const id = league();
    // Makes the last team's update fail after the run, its log and the other
    // teams have been written.
    db.exec(`
      CREATE TRIGGER reject_last BEFORE UPDATE ON team_season WHEN NEW.position = 7
      BEGIN SELECT RAISE(ABORT, 'rejected'); END;
    `);

    expect(() => generateLeague(db, id, 1)).toThrow("rejected");

    expect(status(id)).toBe("setup");
    expect([count("run"), count("run_log_entry")]).toEqual([0, 0]);
    expect(listTeams(db, id).every((team) => team.offenseProfile === null)).toBe(true);
    expect(drafted(id).flat().every((value) => value === null)).toBe(true);
    expect(management(id).flat().every((value) => value === null)).toBe(true);
    expect(db.isTransaction).toBe(false);
  });

  it("logs each team under the name and grades it was given", () => {
    const id = league();
    generateLeague(db, id, 7);

    const [team] = listTeams(db, id);
    const lines = getSeasonRun(db, id)!
      .entries.slice(0, 32)
      .filter((entry) => entry.franchiseId === team.franchiseId)
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
    expect(offense(second)).toEqual(offense(first));
    expect(drafted(second)).toEqual(drafted(first));
    expect(getSeasonRun(db, second)!.entries.map((entry) => entry.message)).toEqual(
      getSeasonRun(db, first)!.entries.map((entry) => entry.message),
    );
    expect(management(third)).not.toEqual(management(first));
  });

  it("refuses to generate a league twice and changes nothing", () => {
    const id = league();
    generateLeague(db, id, 1);
    const before = { teams: listTeams(db, id), run: getSeasonRun(db, id) };

    expect(generateLeague(db, id, 2)).toEqual({ ok: false, reason: "already-generated" });

    expect({ teams: listTeams(db, id), run: getSeasonRun(db, id) }).toEqual(before);
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
    expect(getSeasonRun(db, untouched)).toBeNull();
    expect(management(untouched).flat().every((value) => value === null)).toBe(true);
    expect(offense(untouched).flat().every((value) => value === null)).toBe(true);
    expect(drafted(untouched).flat().every((value) => value === null)).toBe(true);
  });
});

describe("rerollLeague", () => {
  it("replaces every team's values, the run and its log, and stays a draft", () => {
    const id = league();
    generateLeague(db, id, 1);
    const before = snapshot(id);
    const managedBefore = management(id);

    const result = rerollLeague(db, id, 2);

    const run = getSeasonRun(db, id)!;
    expect(result).toEqual({ ok: true, runId: run.id });
    expect(run.id).not.toBe(before.run!.id);
    expect(run.seed).toBe(2);
    expect(status(id)).toBe("draft");
    expect([count("run"), count("run_log_entry")]).toEqual([1, run.entries.length]);
    expect(management(id)).not.toEqual(managedBefore);
    expect(run.entries).not.toEqual(before.run!.entries);
    expect(listTeams(db, id).every((team) => team.fgRange !== null && team.xpRange !== null)).toBe(
      true,
    );
  });

  it("gives what generating a fresh copy of the league with that seed gives", () => {
    const rerolled = league(8, 3);
    const fresh = league(8, 3);
    generateLeague(db, rerolled, 1);

    rerollLeague(db, rerolled, 5);
    generateLeague(db, fresh, 5);

    expect(management(rerolled)).toEqual(management(fresh));
    expect(offense(rerolled)).toEqual(offense(fresh));
    expect(drafted(rerolled)).toEqual(drafted(fresh));
    expect(messages(rerolled)).toEqual(messages(fresh));
  });

  it("can be repeated, keeping one run each time", () => {
    const id = league();
    generateLeague(db, id, 1);

    for (const seed of [2, 3, 4]) {
      expect(rerollLeague(db, id, seed).ok).toBe(true);
      expect(count("run")).toBe(1);
      expect(getSeasonRun(db, id)!.seed).toBe(seed);
    }
    expect(status(id)).toBe("draft");
  });

  it("uses the teams' current names", () => {
    const id = league();
    generateLeague(db, id, 1);
    const [team] = listTeams(db, id);
    updateTeamField(db, team.id, "city", "Renamed City");

    rerollLeague(db, id, 2);

    expect(messages(id)[0].startsWith(`Renamed City ${team.nickname}: `)).toBe(true);
  });

  it("goes back to the previous draft when a team's values cannot be stored", () => {
    const id = league();
    generateLeague(db, id, 1);
    const before = snapshot(id);
    db.exec(`
      CREATE TRIGGER reject_last BEFORE UPDATE ON team_season WHEN NEW.position = 7
      BEGIN SELECT RAISE(ABORT, 'rejected'); END;
    `);

    expect(() => rerollLeague(db, id, 2)).toThrow("rejected");

    expect(snapshot(id)).toEqual(before);
    expect([count("run"), count("run_log_entry")]).toEqual([1, before.run!.entries.length]);
    expect(db.isTransaction).toBe(false);
  });

  it("refuses a league that has not been generated and changes nothing", () => {
    const id = league();

    expect(rerollLeague(db, id, 2)).toEqual({ ok: false, reason: "not-generated" });

    expect(status(id)).toBe("setup");
    expect(count("run")).toBe(0);
    expect(management(id).flat().every((value) => value === null)).toBe(true);
  });

  it("refuses an accepted league and changes nothing", () => {
    const id = league();
    generateLeague(db, id, 1);
    acceptLeague(db, id);
    const before = snapshot(id);

    expect(rerollLeague(db, id, 2)).toEqual({ ok: false, reason: "accepted" });

    expect(snapshot(id)).toEqual(before);
    expect(count("run")).toBe(1);
  });

  it("refuses a draft with no teams and keeps its run", () => {
    const id = league();
    generateLeague(db, id, 1);
    db.exec("DELETE FROM team_season; DELETE FROM franchise;");
    const run = getSeasonRun(db, id)!;

    expect(rerollLeague(db, id, 2)).toEqual({ ok: false, reason: "no-teams" });

    expect(getSeasonRun(db, id)).toEqual(run);
    expect(count("run")).toBe(1);
  });

  it("reports an unknown league", () => {
    expect(rerollLeague(db, 999, 1)).toEqual({ ok: false, reason: "not-found" });
    expect(db.isTransaction).toBe(false);
  });

  it("only touches the league it was asked to re-roll", () => {
    const rerolled = league();
    const untouched = league();
    generateLeague(db, rerolled, 1);
    generateLeague(db, untouched, 1);
    const before = snapshot(untouched);

    rerollLeague(db, rerolled, 2);

    expect(snapshot(untouched)).toEqual(before);
    expect(count("run")).toBe(2);
  });
});

describe("acceptLeague", () => {
  it("makes a draft the accepted season and changes nothing else", () => {
    const id = league();
    generateLeague(db, id, 1);
    const before = snapshot(id);
    const rows = [count("run"), count("run_log_entry"), count("team_season")];

    expect(acceptLeague(db, id)).toEqual({ ok: true });

    expect(snapshot(id)).toEqual({ ...before, status: "accepted" });
    expect([count("run"), count("run_log_entry"), count("team_season")]).toEqual(rows);
  });

  it("refuses a league that has not been generated", () => {
    const id = league();

    expect(acceptLeague(db, id)).toEqual({ ok: false, reason: "not-generated" });

    expect(status(id)).toBe("setup");
  });

  it("refuses a league that is already accepted", () => {
    const id = league();
    generateLeague(db, id, 1);
    acceptLeague(db, id);

    expect(acceptLeague(db, id)).toEqual({ ok: false, reason: "already-accepted" });

    expect(status(id)).toBe("accepted");
  });

  it.each(["defense_profile", "fg_range", "xp_range"])(
    "refuses a draft with a team that has no %s until it is re-rolled",
    (column) => {
      const id = league();
      generateLeague(db, id, 1);
      db.exec(`UPDATE team_season SET ${column} = NULL WHERE position = 3`);

      expect(acceptLeague(db, id)).toEqual({ ok: false, reason: "incomplete" });
      expect(status(id)).toBe("draft");

      rerollLeague(db, id, 2);
      expect(acceptLeague(db, id)).toEqual({ ok: true });
    },
  );

  it("reports an unknown league", () => {
    expect(acceptLeague(db, 999)).toEqual({ ok: false, reason: "not-found" });
    expect(db.isTransaction).toBe(false);
  });

  it("only touches the league it was asked to accept", () => {
    const accepted = league();
    const untouched = league();
    generateLeague(db, accepted, 1);
    generateLeague(db, untouched, 1);
    const before = snapshot(untouched);

    acceptLeague(db, accepted);

    expect(snapshot(untouched)).toEqual(before);
  });

  it("stops an accepted league from being generated again", () => {
    const id = league();
    generateLeague(db, id, 1);
    acceptLeague(db, id);

    expect(generateLeague(db, id, 2)).toEqual({ ok: false, reason: "already-generated" });
    expect(status(id)).toBe("accepted");
  });
});

describe("offense tags", () => {
  it("are kept through generating, re-rolling and accepting", () => {
    const id = league();
    updateTeamField(db, listTeams(db, id)[0].id, "offenseTag", "R+");
    const tags = () => listTeams(db, id).map((team) => team.offenseTag);
    const expected = ["R+", ...Array<null>(7).fill(null)];

    generateLeague(db, id, 7);
    expect(tags()).toEqual(expected);
    rerollLeague(db, id, 8);
    expect(tags()).toEqual(expected);
    acceptLeague(db, id);
    expect(tags()).toEqual(expected);
  });
});

describe("getSeasonRun", () => {
  it("returns null before a league is generated and for an unknown league", () => {
    expect(getSeasonRun(db, league())).toBeNull();
    expect(getSeasonRun(db, 999)).toBeNull();
  });
});

describe("deleting a generated league", () => {
  it("removes its run and log and keeps other leagues' runs", () => {
    const doomed = league();
    const kept = league();
    generateLeague(db, doomed, 1);
    generateLeague(db, kept, 2);

    deleteLeague(db, doomed);

    expect(getSeasonRun(db, doomed)).toBeNull();
    const keptEntries = getSeasonRun(db, kept)!.entries.length;
    expect(keptEntries).toBeGreaterThan(32);
    expect([count("run"), count("run_log_entry")]).toEqual([1, keptEntries]);
  });
});
