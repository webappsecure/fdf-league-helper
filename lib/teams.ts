import type { DatabaseSync } from "node:sqlite";
import { transaction } from "@/lib/db";
import type { Rng } from "@/lib/dice";
import {
  generateIdentities,
  rerollField,
  type EditField,
  type Identity,
  type RerollField,
} from "@/lib/identity";
import type {
  Grade,
  OwnershipLoyalty,
  OwnershipStyle,
} from "@/lib/reference/management-tables";

export type Team = Identity & {
  id: number;
  franchiseId: number;
  divisionId: number | null;
  position: number;
  // Rule-generated. All four are null until the league is generated, and the
  // ownership pair stays null for a team that rolled no quality.
  ownershipStyle: OwnershipStyle | null;
  ownershipLoyalty: OwnershipLoyalty | null;
  frontOfficeGrade: Grade | null;
  headCoachGrade: Grade | null;
};

const TEAM_SELECT = `
  SELECT team_season.id AS id, team_season.franchise_id AS franchiseId,
         team_season.division_id AS divisionId,
         team_season.position AS position, team_season.city AS city,
         team_season.nickname AS nickname, team_season.head_coach_name AS headCoachName,
         team_season.primary_color AS primaryColor,
         team_season.secondary_color AS secondaryColor,
         team_season.ownership_style AS ownershipStyle,
         team_season.ownership_loyalty AS ownershipLoyalty,
         team_season.front_office_grade AS frontOfficeGrade,
         team_season.head_coach_grade AS headCoachGrade
  FROM team_season
`;

const COLUMNS: Record<EditField, string> = {
  city: "city",
  nickname: "nickname",
  headCoachName: "head_coach_name",
  primaryColor: "primary_color",
  secondaryColor: "secondary_color",
};

// Creates a franchise and a team for every slot in the season. The caller owns
// the transaction, because transaction() does not nest.
export function insertTeams(
  db: DatabaseSync,
  leagueId: number,
  seasonId: number,
  rng: Rng,
): number {
  const season = db.prepare("SELECT team_count AS teamCount FROM season WHERE id = ?").get(
    seasonId,
  ) as { teamCount: number };
  const divisions = db
    .prepare(
      `SELECT division.id AS id, division.team_count AS teamCount
       FROM division
       LEFT JOIN conference ON conference.id = division.conference_id
       WHERE division.season_id = ?
       ORDER BY COALESCE(conference.position, 0), division.position`,
    )
    .all(seasonId) as { id: number; teamCount: number }[];

  // One entry per team, in display order.
  const slots: (number | null)[] =
    divisions.length > 0
      ? divisions.flatMap((division) => Array<number>(division.teamCount).fill(division.id))
      : Array<null>(season.teamCount).fill(null);

  const insertFranchise = db.prepare("INSERT INTO franchise (league_id) VALUES (?)");
  const insertTeam = db.prepare(
    `INSERT INTO team_season (season_id, franchise_id, division_id, position, city, nickname,
                              head_coach_name, primary_color, secondary_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  generateIdentities(slots.length, rng).forEach((identity, position) => {
    const franchiseId = Number(insertFranchise.run(leagueId).lastInsertRowid);
    insertTeam.run(
      seasonId,
      franchiseId,
      slots[position],
      position,
      identity.city,
      identity.nickname,
      identity.headCoachName,
      identity.primaryColor,
      identity.secondaryColor,
    );
  });

  return slots.length;
}

// Fills a league that has no teams. Returns how many teams it created, which
// is 0 when the league is unknown or already has teams.
export function fillTeams(db: DatabaseSync, leagueId: number, rng: Rng): number {
  return transaction(db, () => {
    const season = db
      .prepare("SELECT id FROM season WHERE league_id = ? AND sequence = 1")
      .get(leagueId) as { id: number } | undefined;
    if (!season) return 0;

    const { total } = db
      .prepare("SELECT COUNT(*) AS total FROM team_season WHERE season_id = ?")
      .get(season.id) as { total: number };
    if (total > 0) return 0;

    return insertTeams(db, leagueId, season.id, rng);
  });
}

export function listTeams(db: DatabaseSync, leagueId: number): Team[] {
  return db
    .prepare(
      `${TEAM_SELECT}
       JOIN season ON season.id = team_season.season_id
       WHERE season.league_id = ? AND season.sequence = 1
       ORDER BY team_season.position`,
    )
    .all(leagueId) as Team[];
}

// Returns false when the team does not exist.
export function updateTeamField(
  db: DatabaseSync,
  teamId: number,
  field: EditField,
  value: string,
): boolean {
  const result = db
    .prepare(`UPDATE team_season SET ${COLUMNS[field]} = ? WHERE id = ?`)
    .run(value, teamId);
  return Number(result.changes) > 0;
}

// Re-rolls one field against the season's other teams and saves it. Returns
// the updated team, or null when the team does not exist.
export function rerollTeamField(
  db: DatabaseSync,
  teamId: number,
  field: RerollField,
  rng: Rng,
): Team | null {
  return transaction(db, () => {
    const row = db
      .prepare("SELECT season_id AS seasonId FROM team_season WHERE id = ?")
      .get(teamId) as { seasonId: number } | undefined;
    if (!row) return null;

    const teams = db
      .prepare(`${TEAM_SELECT} WHERE team_season.season_id = ?`)
      .all(row.seasonId) as Team[];
    const current = teams.find((team) => team.id === teamId)!;
    const others = teams.filter((team) => team.id !== teamId);

    const changes = rerollField(field, current, others, rng);
    for (const [changed, value] of Object.entries(changes)) {
      updateTeamField(db, teamId, changed as EditField, value);
    }
    return { ...current, ...changes };
  });
}
