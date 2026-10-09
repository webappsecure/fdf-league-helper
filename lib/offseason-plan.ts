import type { DatabaseSync } from "node:sqlite";
import { transaction } from "@/lib/db";
import type { Rng } from "@/lib/dice";
import { pickCity, rollIdentity, type Identity } from "@/lib/identity";
import { MAX_TEAMS, MIN_TEAMS } from "@/lib/league-setup";
import type { Grade, OwnershipLoyalty, OwnershipStyle } from "@/lib/reference/management-tables";
import { rollManagement } from "@/lib/rules/management";

export type PlanFailure =
  | "not-found"
  | "not-accepted"
  | "team-not-found"
  | "too-many"
  | "too-few"
  | "division-required"
  | "division-empty"
  | "no-pending-move"
  | "team-removed"
  | "offseason-started";

export type PlanResult = { ok: true } | { ok: false; reason: PlanFailure };

export type ExpansionTeam = Identity & {
  id: number;
  divisionId: number | null;
  ownershipStyle: OwnershipStyle | null;
  ownershipLoyalty: OwnershipLoyalty | null;
  frontOfficeGrade: Grade;
  headCoachGrade: Grade;
};

export type OffseasonPlan = {
  expansionTeams: ExpansionTeam[];
  // Ids of the current teams marked for contraction.
  removedTeamIds: number[];
  // Teams with a pending move; the city is null until the move is planned.
  moves: { teamId: number; city: string | null }[];
  plannedTeamCount: number;
};

// Thrown to roll a mutation back when it breaks a plan limit.
class Refusal extends Error {
  constructor(readonly reason: PlanFailure) {
    super(reason);
  }
}

type SeasonRow = { id: number; status: string };

function findSeason(db: DatabaseSync, leagueId: number): SeasonRow | undefined {
  return db
    .prepare("SELECT id, status FROM season WHERE league_id = ? AND sequence = 1")
    .get(leagueId) as SeasonRow | undefined;
}

// True when the league already has a season after this one: the off-season
// draft. The plan and the results are locked while it exists.
export function hasLaterSeason(db: DatabaseSync, seasonId: number): boolean {
  return (
    db
      .prepare(
        `SELECT 1 FROM season later JOIN season this ON this.league_id = later.league_id
         WHERE this.id = ? AND later.sequence > this.sequence`,
      )
      .get(seasonId) !== undefined
  );
}

function requireAccepted(db: DatabaseSync, season: SeasonRow | undefined): number {
  if (!season) throw new Refusal("not-found");
  if (season.status !== "accepted") throw new Refusal("not-accepted");
  if (hasLaterSeason(db, season.id)) throw new Refusal("offseason-started");
  return season.id;
}

// Runs a change and its limit check as one unit: a refusal rolls it back.
function change(db: DatabaseSync, work: () => void): PlanResult {
  try {
    transaction(db, work);
    return { ok: true };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, reason: error.reason };
    throw error;
  }
}

function plannedCount(db: DatabaseSync, seasonId: number): number {
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM team_season WHERE season_id = ?1 AND pending_removal = 0) +
         (SELECT COUNT(*) FROM expansion_team WHERE season_id = ?1) AS total`,
    )
    .get(seasonId) as { total: number };
  return row.total;
}

// The limits every plan must keep: 8 to 56 teams, and a team in every division.
function checkLimits(db: DatabaseSync, seasonId: number): void {
  const total = plannedCount(db, seasonId);
  if (total > MAX_TEAMS) throw new Refusal("too-many");
  if (total < MIN_TEAMS) throw new Refusal("too-few");

  const empty = db
    .prepare(
      `SELECT division.id FROM division
       WHERE division.season_id = ?1
         AND NOT EXISTS (SELECT 1 FROM team_season
                         WHERE team_season.division_id = division.id AND pending_removal = 0)
         AND NOT EXISTS (SELECT 1 FROM expansion_team WHERE expansion_team.division_id = division.id)
       LIMIT 1`,
    )
    .get(seasonId);
  if (empty) throw new Refusal("division-empty");
}

// The limit the plan breaks, or null. Callers own the transaction.
export function planLimitFailure(db: DatabaseSync, seasonId: number): PlanFailure | null {
  try {
    checkLimits(db, seasonId);
    return null;
  } catch (error) {
    if (error instanceof Refusal) return error.reason;
    throw error;
  }
}

function heldIdentities(db: DatabaseSync, seasonId: number): Identity[] {
  const select = (table: string) =>
    db
      .prepare(
        `SELECT city, nickname, head_coach_name AS headCoachName,
                primary_color AS primaryColor, secondary_color AS secondaryColor
         FROM ${table} WHERE season_id = ?`,
      )
      .all(seasonId) as Identity[];
  return [...select("team_season"), ...select("expansion_team")];
}

function rollTeam(held: Identity[], rng: Rng) {
  const identity = rollIdentity(held, rng);
  const [management] = rollManagement(
    [
      {
        franchiseId: 0,
        teamName: `${identity.city} ${identity.nickname}`,
        coachName: identity.headCoachName,
      },
    ],
    rng,
  ).teams;
  return { identity, management };
}

export function addExpansionTeam(
  db: DatabaseSync,
  leagueId: number,
  divisionId: number | null,
  rng: Rng,
): PlanResult {
  return change(db, () => {
    const seasonId = requireAccepted(db, findSeason(db, leagueId));

    const divisions = db.prepare("SELECT id FROM division WHERE season_id = ?").all(seasonId) as {
      id: number;
    }[];
    if (divisions.length > 0) {
      if (divisionId === null || !divisions.some((division) => division.id === divisionId)) {
        throw new Refusal("division-required");
      }
    } else if (divisionId !== null) {
      throw new Refusal("division-required");
    }

    const { identity, management } = rollTeam(heldIdentities(db, seasonId), rng);
    const { next } = db
      .prepare(
        "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM expansion_team WHERE season_id = ?",
      )
      .get(seasonId) as { next: number };
    db.prepare(
      `INSERT INTO expansion_team (season_id, division_id, position, city, nickname,
         head_coach_name, primary_color, secondary_color, ownership_style,
         ownership_loyalty, front_office_grade, head_coach_grade)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      seasonId,
      divisionId,
      next,
      identity.city,
      identity.nickname,
      identity.headCoachName,
      identity.primaryColor,
      identity.secondaryColor,
      management.ownershipStyle,
      management.ownershipLoyalty,
      management.frontOfficeGrade,
      management.headCoachGrade,
    );
    checkLimits(db, seasonId);
  });
}

function findExpansionSeason(db: DatabaseSync, expansionTeamId: number): number {
  const row = db
    .prepare(
      `SELECT season.id AS id, season.status AS status
       FROM expansion_team JOIN season ON season.id = expansion_team.season_id
       WHERE expansion_team.id = ?`,
    )
    .get(expansionTeamId) as SeasonRow | undefined;
  if (!row) throw new Refusal("team-not-found");
  return requireAccepted(db, row);
}

// Rolls a planned team again in full. It keeps its division.
export function rerollExpansionTeam(db: DatabaseSync, id: number, rng: Rng): PlanResult {
  return change(db, () => {
    const seasonId = findExpansionSeason(db, id);
    // The team's own values stay held, so the roll really changes them.
    const { identity, management } = rollTeam(heldIdentities(db, seasonId), rng);
    db.prepare(
      `UPDATE expansion_team
       SET city = ?, nickname = ?, head_coach_name = ?, primary_color = ?, secondary_color = ?,
           ownership_style = ?, ownership_loyalty = ?, front_office_grade = ?, head_coach_grade = ?
       WHERE id = ?`,
    ).run(
      identity.city,
      identity.nickname,
      identity.headCoachName,
      identity.primaryColor,
      identity.secondaryColor,
      management.ownershipStyle,
      management.ownershipLoyalty,
      management.frontOfficeGrade,
      management.headCoachGrade,
      id,
    );
  });
}

export function removeExpansionTeam(db: DatabaseSync, id: number): PlanResult {
  return change(db, () => {
    const seasonId = findExpansionSeason(db, id);
    db.prepare("DELETE FROM expansion_team WHERE id = ?").run(id);
    checkLimits(db, seasonId);
  });
}

type TeamRow = {
  id: number;
  seasonId: number;
  status: string;
  pendingMove: number;
  pendingRemoval: number;
};

function findTeam(db: DatabaseSync, teamId: number): TeamRow {
  const row = db
    .prepare(
      `SELECT team_season.id AS id, season.id AS seasonId, season.status AS status,
              team_season.pending_move AS pendingMove,
              team_season.pending_removal AS pendingRemoval
       FROM team_season JOIN season ON season.id = team_season.season_id
       WHERE team_season.id = ?`,
    )
    .get(teamId) as TeamRow | undefined;
  if (!row) throw new Refusal("team-not-found");
  requireAccepted(db, { id: row.seasonId, status: row.status });
  return row;
}

// Marks a current team for contraction, or keeps it. Marking drops any
// planned city for its move.
export function setTeamRemoval(db: DatabaseSync, teamId: number, removed: boolean): PlanResult {
  return change(db, () => {
    const team = findTeam(db, teamId);
    db.prepare(
      `UPDATE team_season
       SET pending_removal = ?, pending_move_city = CASE WHEN ? = 1 THEN NULL ELSE pending_move_city END
       WHERE id = ?`,
    ).run(removed ? 1 : 0, removed ? 1 : 0, teamId);
    checkLimits(db, team.seasonId);
  });
}

// Picks a city for a team's pending move that no team or planned move holds, this
// team's own planned city included, so a re-roll always changes it. Callers own
// the transaction.
export function rollMoveCity(db: DatabaseSync, teamId: number, seasonId: number, rng: Rng): void {
  const taken = heldIdentities(db, seasonId).map((held) => held.city);
  const others = db
    .prepare(
      `SELECT pending_move_city AS city FROM team_season
       WHERE season_id = ? AND pending_move_city IS NOT NULL`,
    )
    .all(seasonId) as { city: string }[];
  const city = pickCity([...taken, ...others.map((other) => other.city)], rng);
  db.prepare("UPDATE team_season SET pending_move_city = ? WHERE id = ?").run(city, teamId);
}

// Plans the new city of a team with a pending move, or rolls it again.
export function planMove(db: DatabaseSync, teamId: number, rng: Rng): PlanResult {
  return change(db, () => {
    const team = findTeam(db, teamId);
    if (team.pendingMove !== 1) throw new Refusal("no-pending-move");
    if (team.pendingRemoval === 1) throw new Refusal("team-removed");

    rollMoveCity(db, team.id, team.seasonId, rng);
  });
}

export function cancelMove(db: DatabaseSync, teamId: number): PlanResult {
  return change(db, () => {
    const team = findTeam(db, teamId);
    if (team.pendingMove !== 1) throw new Refusal("no-pending-move");
    db.prepare(
      "UPDATE team_season SET pending_move = 0, pending_move_city = NULL WHERE id = ?",
    ).run(teamId);
  });
}

export function getOffseasonPlan(db: DatabaseSync, leagueId: number): OffseasonPlan {
  const season = findSeason(db, leagueId);
  if (!season) return { expansionTeams: [], removedTeamIds: [], moves: [], plannedTeamCount: 0 };

  const expansionTeams = db
    .prepare(
      `SELECT id, division_id AS divisionId, city, nickname, head_coach_name AS headCoachName,
              primary_color AS primaryColor, secondary_color AS secondaryColor,
              ownership_style AS ownershipStyle, ownership_loyalty AS ownershipLoyalty,
              front_office_grade AS frontOfficeGrade, head_coach_grade AS headCoachGrade
       FROM expansion_team WHERE season_id = ? ORDER BY position`,
    )
    .all(season.id) as ExpansionTeam[];
  const removed = db
    .prepare(
      "SELECT id FROM team_season WHERE season_id = ? AND pending_removal = 1 ORDER BY position",
    )
    .all(season.id) as { id: number }[];
  const moves = db
    .prepare(
      `SELECT id AS teamId, pending_move_city AS city FROM team_season
       WHERE season_id = ? AND pending_move = 1 ORDER BY position`,
    )
    .all(season.id) as OffseasonPlan["moves"];

  return {
    expansionTeams,
    removedTeamIds: removed.map((team) => team.id),
    moves,
    plannedTeamCount: plannedCount(db, season.id),
  };
}
