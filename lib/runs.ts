import type { DatabaseSync } from "node:sqlite";
import { CURRENT_SEASON } from "@/lib/current-season";
import { transaction } from "@/lib/db";
import { seededRng } from "@/lib/dice";
import type { XpKickDistance } from "@/lib/league-setup";
import type { SeasonStatus } from "@/lib/leagues";
import { generateSeason, type GenerationLogEntry } from "@/lib/rules/generation";

export type GenerateResult =
  | { ok: true; runId: number }
  | { ok: false; reason: "not-found" | "no-teams" | "already-generated" };

export type RerollResult =
  | { ok: true; runId: number }
  | { ok: false; reason: "not-found" | "not-generated" | "accepted" | "no-teams" };

export type AcceptResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "not-generated" | "already-accepted" | "incomplete" };

export type RunLogLine = GenerationLogEntry;

// The run that made the current season: the inaugural generation, or the
// off-season that created it.
export type SeasonRun = {
  id: number;
  kind: "generation" | "offseason";
  seed: number;
  createdAt: string;
  entries: RunLogLine[];
};

type SeasonRow = { id: number; status: SeasonStatus; xpKickDistance: XpKickDistance };

function findSeason(db: DatabaseSync, leagueId: number): SeasonRow | undefined {
  return db
    .prepare(
      `SELECT id, status, xp_kick_distance AS xpKickDistance
       FROM season WHERE league_id = ? AND sequence = 1`,
    )
    .get(leagueId) as SeasonRow | undefined;
}

// Rolls the management values and runs the inaugural draft for every team of
// a season, and saves them with a new run and its log. Returns the run, or
// null and writes nothing when the season has no teams. The caller owns the
// transaction, because transaction() does not nest.
function rollAndSave(db: DatabaseSync, season: SeasonRow, seed: number): number | null {
  const teams = db
    .prepare(
      `SELECT franchise_id AS franchiseId, city || ' ' || nickname AS teamName,
              head_coach_name AS coachName
       FROM team_season WHERE season_id = ? ORDER BY position`,
    )
    .all(season.id) as { franchiseId: number; teamName: string; coachName: string }[];
  if (teams.length === 0) return null;

  const result = generateSeason(teams, seededRng(seed), season.xpKickDistance);

  const runId = Number(
    db
      .prepare("INSERT INTO run (season_id, kind, seed, created_at) VALUES (?, 'generation', ?, ?)")
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
  return runId;
}

// Generates a league that has not been generated yet and makes it a draft.
// The status check and the writes share one transaction, so a league cannot
// be generated twice.
export function generateLeague(db: DatabaseSync, leagueId: number, seed: number): GenerateResult {
  return transaction(db, (): GenerateResult => {
    const season = findSeason(db, leagueId);
    if (!season) return { ok: false, reason: "not-found" };
    if (season.status !== "setup") return { ok: false, reason: "already-generated" };

    const runId = rollAndSave(db, season, seed);
    if (runId === null) return { ok: false, reason: "no-teams" };

    db.prepare("UPDATE season SET status = 'draft' WHERE id = ?").run(season.id);
    return { ok: true, runId };
  });
}

// Generates a draft league again from its current teams, replacing every
// generated value and the earlier run and its log. A failure leaves the
// earlier draft as it was.
export function rerollLeague(db: DatabaseSync, leagueId: number, seed: number): RerollResult {
  return transaction(db, (): RerollResult => {
    const season = findSeason(db, leagueId);
    if (!season) return { ok: false, reason: "not-found" };
    if (season.status === "setup") return { ok: false, reason: "not-generated" };
    if (season.status === "accepted") return { ok: false, reason: "accepted" };

    const runId = rollAndSave(db, season, seed);
    if (runId === null) return { ok: false, reason: "no-teams" };

    // After the new run is saved, so a refusal above removes nothing.
    db.prepare("DELETE FROM run WHERE season_id = ? AND kind = 'generation' AND id <> ?").run(
      season.id,
      runId,
    );
    return { ok: true, runId };
  });
}

// Makes a draft the official season. An accepted season is never re-rolled.
export function acceptLeague(db: DatabaseSync, leagueId: number): AcceptResult {
  return transaction(db, (): AcceptResult => {
    const season = findSeason(db, leagueId);
    if (!season) return { ok: false, reason: "not-found" };
    if (season.status === "setup") return { ok: false, reason: "not-generated" };
    if (season.status === "accepted") return { ok: false, reason: "already-accepted" };

    // A league generated before the whole draft existed has teams without
    // these. A re-roll fills them in.
    const { missing } = db
      .prepare(
        `SELECT COUNT(*) AS missing FROM team_season
         WHERE season_id = ?
           AND (defense_profile IS NULL OR fg_range IS NULL OR xp_range IS NULL)`,
      )
      .get(season.id) as { missing: number };
    if (missing > 0) return { ok: false, reason: "incomplete" };

    db.prepare("UPDATE season SET status = 'accepted' WHERE id = ?").run(season.id);
    return { ok: true };
  });
}

const RUN_SELECT = `
  SELECT run.id AS id, run.kind AS kind, run.seed AS seed, run.created_at AS createdAt
  FROM run
  JOIN season ON season.id = run.season_id`;

function withEntries(db: DatabaseSync, run: Omit<SeasonRun, "entries"> | undefined) {
  if (!run) return null;
  const entries = db
    .prepare(
      `SELECT step, franchise_id AS franchiseId, message
       FROM run_log_entry WHERE run_id = ? ORDER BY position`,
    )
    .all(run.id) as RunLogLine[];
  return { ...run, entries };
}

export function getSeasonRun(db: DatabaseSync, leagueId: number): SeasonRun | null {
  const run = db
    .prepare(
      `${RUN_SELECT}
       WHERE season.league_id = ? AND ${CURRENT_SEASON}
       ORDER BY run.id DESC LIMIT 1`,
    )
    .get(leagueId) as Omit<SeasonRun, "entries"> | undefined;
  return withEntries(db, run);
}

// The run that made one season, current or past.
export function getRunBySeason(db: DatabaseSync, seasonId: number): SeasonRun | null {
  const run = db
    .prepare(`${RUN_SELECT} WHERE season.id = ? ORDER BY run.id DESC LIMIT 1`)
    .get(seasonId) as Omit<SeasonRun, "entries"> | undefined;
  return withEntries(db, run);
}
