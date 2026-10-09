import type { DatabaseSync } from "node:sqlite";
import { transaction } from "@/lib/db";
import type { Rng } from "@/lib/dice";
import type { DivisionInput, LeagueSetupInput, XpKickDistance } from "@/lib/league-setup";
import { insertTeams } from "@/lib/teams";

export type SeasonStatus = "setup" | "draft" | "accepted";

export type LeagueSummary = {
  id: number;
  name: string;
  seasonLabel: string;
  teamCount: number;
};

export type DivisionDetail = { id: number; name: string; teamCount: number };
export type ConferenceDetail = { id: number; name: string; divisions: DivisionDetail[] };

export type LeagueDetail = LeagueSummary & {
  xpKickDistance: XpKickDistance;
  status: SeasonStatus;
  conferences: ConferenceDetail[];
  // Divisions that do not belong to a conference.
  divisions: DivisionDetail[];
};

export function createLeague(
  db: DatabaseSync,
  input: LeagueSetupInput,
  rng: Rng = Math.random,
): number {
  return transaction(db, () => {
    const leagueId = Number(
      db
        .prepare("INSERT INTO league (name, created_at) VALUES (?, ?)")
        .run(input.name, new Date().toISOString()).lastInsertRowid,
    );
    const seasonId = Number(
      db
        .prepare(
          `INSERT INTO season (league_id, sequence, label, xp_kick_distance, status, team_count)
           VALUES (?, 1, ?, ?, 'setup', ?)`,
        )
        .run(leagueId, input.seasonLabel, input.xpKickDistance, input.teamCount)
        .lastInsertRowid,
    );

    const insertConference = db.prepare(
      "INSERT INTO conference (season_id, name, position) VALUES (?, ?, ?)",
    );
    const insertDivision = db.prepare(
      `INSERT INTO division (season_id, conference_id, name, position, team_count)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const addDivisions = (divisions: DivisionInput[], conferenceId: number | null) => {
      divisions.forEach((division, position) => {
        insertDivision.run(seasonId, conferenceId, division.name, position, division.teamCount);
      });
    };

    if (input.structure.kind === "divisions") {
      addDivisions(input.structure.divisions, null);
    } else if (input.structure.kind === "conferences") {
      input.structure.conferences.forEach((conference, position) => {
        const conferenceId = Number(
          insertConference.run(seasonId, conference.name, position).lastInsertRowid,
        );
        addDivisions(conference.divisions, conferenceId);
      });
    }

    insertTeams(db, leagueId, seasonId, rng);

    return leagueId;
  });
}

const SUMMARY_SELECT = `
  SELECT league.id AS id, league.name AS name, season.id AS seasonId,
         season.label AS seasonLabel, season.team_count AS teamCount,
         season.xp_kick_distance AS xpKickDistance, season.status AS status
  FROM league
  JOIN season ON season.league_id = league.id AND season.sequence = 1
`;

type SummaryRow = LeagueSummary & {
  seasonId: number;
  xpKickDistance: XpKickDistance;
  status: SeasonStatus;
};

export function listLeagues(db: DatabaseSync): LeagueSummary[] {
  const rows = db
    .prepare(`${SUMMARY_SELECT} ORDER BY league.created_at DESC, league.id DESC`)
    .all() as SummaryRow[];
  return rows.map(({ id, name, seasonLabel, teamCount }) => ({
    id,
    name,
    seasonLabel,
    teamCount,
  }));
}

export function getLeague(db: DatabaseSync, id: number): LeagueDetail | null {
  const row = db.prepare(`${SUMMARY_SELECT} WHERE league.id = ?`).get(id) as
    | SummaryRow
    | undefined;
  if (!row) return null;

  const conferences = db
    .prepare("SELECT id, name FROM conference WHERE season_id = ? ORDER BY position")
    .all(row.seasonId) as { id: number; name: string }[];
  const divisions = db
    .prepare(
      `SELECT id, conference_id AS conferenceId, name, team_count AS teamCount
       FROM division WHERE season_id = ? ORDER BY position`,
    )
    .all(row.seasonId) as (DivisionDetail & { conferenceId: number | null })[];

  const divisionsOf = (conferenceId: number | null): DivisionDetail[] =>
    divisions
      .filter((division) => division.conferenceId === conferenceId)
      .map(({ id, name, teamCount }) => ({ id, name, teamCount }));

  return {
    id: row.id,
    name: row.name,
    seasonLabel: row.seasonLabel,
    teamCount: row.teamCount,
    xpKickDistance: row.xpKickDistance,
    status: row.status,
    conferences: conferences.map((conference) => ({
      ...conference,
      divisions: divisionsOf(conference.id),
    })),
    divisions: divisionsOf(null),
  };
}

// Both return false when the league does not exist.
export function updateLeagueName(db: DatabaseSync, leagueId: number, name: string): boolean {
  const result = db.prepare("UPDATE league SET name = ? WHERE id = ?").run(name, leagueId);
  return Number(result.changes) > 0;
}

export function updateSeasonLabel(db: DatabaseSync, leagueId: number, label: string): boolean {
  const result = db
    .prepare("UPDATE season SET label = ? WHERE league_id = ? AND sequence = 1")
    .run(label, leagueId);
  return Number(result.changes) > 0;
}

// Both return false when the conference or division does not exist.
export function renameConference(db: DatabaseSync, id: number, name: string): boolean {
  const result = db.prepare("UPDATE conference SET name = ? WHERE id = ?").run(name, id);
  return Number(result.changes) > 0;
}

export function renameDivision(db: DatabaseSync, id: number, name: string): boolean {
  const result = db.prepare("UPDATE division SET name = ? WHERE id = ?").run(name, id);
  return Number(result.changes) > 0;
}

export function deleteLeague(db: DatabaseSync, id: number): void {
  db.prepare("DELETE FROM league WHERE id = ?").run(id);
}
