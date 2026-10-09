import type { DatabaseSync } from "node:sqlite";
import { transaction } from "@/lib/db";

export const MAX_GAMES = 99;

export type TeamResultInput = {
  teamId: number;
  wins: string;
  losses: string;
  ties: string;
  madePlayoffs: boolean;
};

export type SeasonResultsInput = {
  teams: TeamResultInput[];
  championTeamId: number | null;
};

export type TeamResult = {
  teamId: number;
  wins: number;
  losses: number;
  ties: number;
  madePlayoffs: boolean;
  isChampion: boolean;
};

export type ResultField = "wins" | "losses" | "ties" | "playoffs";

export type LeagueError = { teamId: null; field: null; message: string };
export type TeamFieldError = { teamId: number; field: ResultField; message: string };

// An error is either about the whole league or about one field of one team.
export type ResultError = LeagueError | TeamFieldError;

export type ResultsValidation =
  | { ok: true; results: TeamResult[] }
  | { ok: false; errors: ResultError[] };

const BAD_SHAPE: ResultsValidation = {
  ok: false,
  errors: [
    {
      teamId: null,
      field: null,
      message: "The results could not be read. Reload the page and try again.",
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// A whole number from 0 to MAX_GAMES, or null.
function toGames(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const games = Number(trimmed);
  return games <= MAX_GAMES ? games : null;
}

// Checks what the form sent against the teams of the season. Blank ties mean 0.
export function validateSeasonResults(
  input: unknown,
  seasonTeamIds: number[],
): ResultsValidation {
  if (!isRecord(input) || !Array.isArray(input.teams)) return BAD_SHAPE;
  const { teams, championTeamId } = input;
  if (championTeamId !== null && typeof championTeamId !== "number") return BAD_SHAPE;

  const rows: TeamResultInput[] = [];
  for (const row of teams) {
    if (
      !isRecord(row) ||
      typeof row.teamId !== "number" ||
      typeof row.wins !== "string" ||
      typeof row.losses !== "string" ||
      typeof row.ties !== "string" ||
      typeof row.madePlayoffs !== "boolean"
    ) {
      return BAD_SHAPE;
    }
    rows.push(row as TeamResultInput);
  }

  const sent = rows.map((row) => row.teamId).sort((a, b) => a - b);
  const expected = [...seasonTeamIds].sort((a, b) => a - b);
  if (sent.length !== expected.length || sent.some((id, index) => id !== expected[index])) {
    return BAD_SHAPE;
  }

  const errors: ResultError[] = [];
  const results: TeamResult[] = [];
  for (const row of rows) {
    const wins = toGames(row.wins);
    const losses = toGames(row.losses);
    const ties = row.ties.trim() === "" ? 0 : toGames(row.ties);
    const fields = { wins, losses, ties };
    const bad = (Object.keys(fields) as (keyof typeof fields)[]).filter(
      (field) => fields[field] === null,
    );
    if (bad.length > 0) {
      for (const field of bad) {
        errors.push({
          teamId: row.teamId,
          field,
          message: `Enter ${field} as a whole number from 0 to ${MAX_GAMES}.`,
        });
      }
      continue;
    }
    results.push({
      teamId: row.teamId,
      wins: wins as number,
      losses: losses as number,
      ties: ties as number,
      madePlayoffs: row.madePlayoffs,
      isChampion: row.teamId === championTeamId,
    });
  }

  const champion = rows.find((row) => row.teamId === championTeamId);
  if (!champion) {
    errors.push({ teamId: null, field: null, message: "Choose the league champion." });
  } else if (!champion.madePlayoffs) {
    errors.push({
      teamId: champion.teamId,
      field: "playoffs",
      message: "The league champion must be a playoff team.",
    });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, results };
}

type SeasonRow = { seasonId: number; status: string };

function findSeason(db: DatabaseSync, leagueId: number): SeasonRow | undefined {
  return db
    .prepare(
      "SELECT id AS seasonId, status FROM season WHERE league_id = ? AND sequence = 1",
    )
    .get(leagueId) as SeasonRow | undefined;
}

// The saved results of the league's season; empty when none are saved.
export function getSeasonResults(db: DatabaseSync, leagueId: number): TeamResult[] {
  const rows = db
    .prepare(
      `SELECT season_result.team_season_id AS teamId, wins, losses, ties,
              made_playoffs AS madePlayoffs, is_champion AS isChampion
       FROM season_result
       JOIN team_season ON team_season.id = season_result.team_season_id
       JOIN season ON season.id = team_season.season_id
       WHERE season.league_id = ? AND season.sequence = 1
       ORDER BY team_season.position`,
    )
    .all(leagueId) as (Omit<TeamResult, "madePlayoffs" | "isChampion"> & {
    madePlayoffs: number;
    isChampion: number;
  })[];
  return rows.map((row) => ({
    ...row,
    madePlayoffs: row.madePlayoffs === 1,
    isChampion: row.isChampion === 1,
  }));
}

export type SaveResultsOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "not-accepted" }
  | { ok: false; reason: "invalid"; errors: ResultError[] };

// Validates the input and replaces the season's results in one transaction.
export function saveSeasonResults(
  db: DatabaseSync,
  leagueId: number,
  input: unknown,
): SaveResultsOutcome {
  const season = findSeason(db, leagueId);
  if (!season) return { ok: false, reason: "not-found" };
  if (season.status !== "accepted") return { ok: false, reason: "not-accepted" };

  const teamIds = (
    db.prepare("SELECT id FROM team_season WHERE season_id = ?").all(season.seasonId) as {
      id: number;
    }[]
  ).map((row) => row.id);
  const validation = validateSeasonResults(input, teamIds);
  if (!validation.ok) return { ok: false, reason: "invalid", errors: validation.errors };

  transaction(db, () => {
    db.prepare(
      `DELETE FROM season_result WHERE team_season_id IN
         (SELECT id FROM team_season WHERE season_id = ?)`,
    ).run(season.seasonId);
    const insert = db.prepare(
      `INSERT INTO season_result
         (team_season_id, wins, losses, ties, made_playoffs, is_champion)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const result of validation.results) {
      insert.run(
        result.teamId,
        result.wins,
        result.losses,
        result.ties,
        result.madePlayoffs ? 1 : 0,
        result.isChampion ? 1 : 0,
      );
    }
  });
  return { ok: true };
}
