import type { DatabaseSync } from "node:sqlite";
import { transaction } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import type { XpKickDistance } from "@/lib/league-setup";
import { generateSeason, type GenerationLogEntry } from "@/lib/rules/generation";

export type GenerateResult =
  | { ok: true; runId: number }
  | { ok: false; reason: "not-found" | "no-teams" | "already-generated" };

export type RunLogLine = GenerationLogEntry;

export type GenerationRun = {
  id: number;
  seed: number;
  createdAt: string;
  entries: RunLogLine[];
};

// Rolls the management values and runs the inaugural draft for every team of
// a league that has not been generated yet, and saves them with the run and
// its log. The status check and
// the writes share one transaction, so a league cannot be generated twice.
export function generateLeague(db: DatabaseSync, leagueId: number, seed: number): GenerateResult {
  return transaction(db, (): GenerateResult => {
    const season = db
      .prepare(
        `SELECT id, status, xp_kick_distance AS xpKickDistance
         FROM season WHERE league_id = ? AND sequence = 1`,
      )
      .get(leagueId) as
      | { id: number; status: string; xpKickDistance: XpKickDistance }
      | undefined;
    if (!season) return { ok: false, reason: "not-found" };
    if (season.status !== "setup") return { ok: false, reason: "already-generated" };

    const teams = db
      .prepare(
        `SELECT franchise_id AS franchiseId, city || ' ' || nickname AS teamName,
                head_coach_name AS coachName
         FROM team_season WHERE season_id = ? ORDER BY position`,
      )
      .all(season.id) as { franchiseId: number; teamName: string; coachName: string }[];
    if (teams.length === 0) return { ok: false, reason: "no-teams" };

    const result = generateSeason(teams, seededRng(seed), season.xpKickDistance);

    const runId = Number(
      db
        .prepare(
          "INSERT INTO run (season_id, kind, seed, created_at) VALUES (?, 'generation', ?, ?)",
        )
        .run(season.id, seed, new Date().toISOString()).lastInsertRowid,
    );

    const insertEntry = db.prepare(
      `INSERT INTO run_log_entry (run_id, position, step, franchise_id, message)
       VALUES (?, ?, ?, ?, ?)`,
    );
    result.log.forEach((entry, position) => {
      insertEntry.run(runId, position, entry.step, entry.franchiseId, entry.message);
    });

    const updateTeam = db.prepare(
      `UPDATE team_season
       SET ownership_style = ?, ownership_loyalty = ?, front_office_grade = ?,
           head_coach_grade = ?, offense_profile = ?, offense_qualities = ?,
           defense_profile = ?, defense_qualities = ?, kick_return = ?, punt_return = ?,
           fg_range = ?, xp_range = ?
       WHERE season_id = ? AND franchise_id = ?`,
    );
    for (const team of result.teams) {
      updateTeam.run(
        team.ownershipStyle,
        team.ownershipLoyalty,
        team.frontOfficeGrade,
        team.headCoachGrade,
        team.offenseProfile,
        JSON.stringify(team.offenseQualities),
        team.defenseProfile,
        JSON.stringify(team.defenseQualities),
        team.kickReturn,
        team.puntReturn,
        team.fgRange,
        team.xpRange,
        season.id,
        team.franchiseId,
      );
    }

    db.prepare("UPDATE season SET status = 'draft' WHERE id = ?").run(season.id);
    return { ok: true, runId };
  });
}

export function getGenerationRun(db: DatabaseSync, leagueId: number): GenerationRun | null {
  const run = db
    .prepare(
      `SELECT run.id AS id, run.seed AS seed, run.created_at AS createdAt
       FROM run
       JOIN season ON season.id = run.season_id
       WHERE season.league_id = ? AND season.sequence = 1 AND run.kind = 'generation'
       ORDER BY run.id DESC LIMIT 1`,
    )
    .get(leagueId) as Omit<GenerationRun, "entries"> | undefined;
  if (!run) return null;

  const entries = db
    .prepare(
      `SELECT step, franchise_id AS franchiseId, message
       FROM run_log_entry WHERE run_id = ? ORDER BY position`,
    )
    .all(run.id) as RunLogLine[];
  return { ...run, entries };
}
