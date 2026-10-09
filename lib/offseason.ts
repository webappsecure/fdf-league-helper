import type { DatabaseSync } from "node:sqlite";
import { transaction } from "@/lib/db";
import { seededRng, type Rng } from "@/lib/dice";
import {
  planLimitFailure,
  rollMoveCity,
  hasLaterSeason,
  type PlanFailure,
} from "@/lib/offseason-plan";
import type { Grade, OwnershipLoyalty, OwnershipStyle } from "@/lib/reference/management-tables";
import type { DefenseProfile, DefenseQuality } from "@/lib/reference/defense-tables";
import type { OffenseProfile, Quality } from "@/lib/reference/offense-tables";
import { runAnnualDraft, type AnnualLogEntry, type AnnualTeam } from "@/lib/rules/annual-draft";
import { runCoaches, type CoachInput, type CoachLogEntry } from "@/lib/rules/coaches";
import { runTrainingCamp, type CampLogEntry, type CampTeam } from "@/lib/rules/training-camp";

export type OffseasonFailure =
  | "not-found"
  | "not-accepted"
  | "results-missing"
  | "already-started"
  | "not-started"
  | Extract<PlanFailure, "too-many" | "too-few" | "division-empty">;

// A line of the off-season log: the coach steps, the annual draft, then
// training camp.
export type OffseasonLogEntry = CoachLogEntry | AnnualLogEntry | CampLogEntry;

export type OffseasonResult = { ok: true } | { ok: false; reason: OffseasonFailure };

// Thrown to roll the whole transaction back, so a refusal after a delete leaves
// the earlier draft as it was.
class Refusal extends Error {
  constructor(readonly reason: OffseasonFailure) {
    super(reason);
  }
}

function attempt(db: DatabaseSync, work: () => void): OffseasonResult {
  try {
    transaction(db, work);
    return { ok: true };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, reason: error.reason };
    throw error;
  }
}

type SeasonRow = {
  id: number;
  status: string;
  label: string;
  sequence: number;
  xpKickDistance: number;
};

function findSeason(db: DatabaseSync, leagueId: number): SeasonRow | undefined {
  return db
    .prepare(
      `SELECT id, status, label, sequence, xp_kick_distance AS xpKickDistance
       FROM season WHERE league_id = ? AND sequence = 1`,
    )
    .get(leagueId) as SeasonRow | undefined;
}

function findDraftId(db: DatabaseSync, leagueId: number): number | undefined {
  const row = db
    .prepare(
      "SELECT id FROM season WHERE league_id = ? AND sequence > 1 AND status = 'draft' ORDER BY sequence DESC LIMIT 1",
    )
    .get(leagueId) as { id: number } | undefined;
  return row?.id;
}

// "Season 1" becomes "Season 2" and "2016" becomes "2017". A label that does not
// end in a number becomes "Season N".
export function nextSeasonLabel(label: string, sequence: number): string {
  const match = label.trim().match(/^(.*\s)?(\d+)$/);
  if (!match) return `Season ${sequence}`;
  return `${match[1] ?? ""}${Number(match[2]) + 1}`;
}

type TeamRow = {
  id: number;
  franchiseId: number;
  divisionId: number | null;
  city: string;
  nickname: string;
  headCoachName: string;
  primaryColor: string;
  secondaryColor: string;
  offenseTag: string | null;
  ownershipStyle: OwnershipStyle | null;
  ownershipLoyalty: OwnershipLoyalty | null;
  frontOfficeGrade: Grade | null;
  headCoachGrade: Grade | null;
  offenseProfile: OffenseProfile | null;
  defenseProfile: DefenseProfile | null;
  hotSeat: number;
  pendingMove: number;
  pendingMoveCity: string | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  madePlayoffs: number | null;
  isChampion: number | null;
};

type ExpansionRow = {
  divisionId: number | null;
  city: string;
  nickname: string;
  headCoachName: string;
  primaryColor: string;
  secondaryColor: string;
  ownershipStyle: OwnershipStyle | null;
  ownershipLoyalty: OwnershipLoyalty | null;
  frontOfficeGrade: Grade;
  headCoachGrade: Grade;
};

// One team of the new season, before it is saved.
type Entry = {
  franchiseId: number;
  oldDivisionId: number | null;
  city: string;
  nickname: string;
  primaryColor: string;
  secondaryColor: string;
  offenseTag: string | null;
};

function loadKeptTeams(db: DatabaseSync, seasonId: number): TeamRow[] {
  return db
    .prepare(
      `SELECT team_season.id AS id, franchise_id AS franchiseId, division_id AS divisionId,
              city, nickname, head_coach_name AS headCoachName,
              primary_color AS primaryColor, secondary_color AS secondaryColor,
              offense_tag AS offenseTag, ownership_style AS ownershipStyle,
              ownership_loyalty AS ownershipLoyalty, front_office_grade AS frontOfficeGrade,
              head_coach_grade AS headCoachGrade, hot_seat AS hotSeat,
              offense_profile AS offenseProfile, defense_profile AS defenseProfile,
              pending_move AS pendingMove, pending_move_city AS pendingMoveCity,
              wins, losses, ties, made_playoffs AS madePlayoffs, is_champion AS isChampion
       FROM team_season
       LEFT JOIN season_result ON season_result.team_season_id = team_season.id
       WHERE season_id = ? AND pending_removal = 0
       ORDER BY position`,
    )
    .all(seasonId) as TeamRow[];
}

// Refuses to start unless every team has results and the plan meets the limits.
function requireStartable(db: DatabaseSync, seasonId: number): void {
  const results = db
    .prepare(
      `SELECT COUNT(*) AS missing FROM team_season
       WHERE season_id = ?
         AND NOT EXISTS (SELECT 1 FROM season_result WHERE team_season_id = team_season.id)`,
    )
    .get(seasonId) as { missing: number };
  if (results.missing > 0) throw new Refusal("results-missing");

  const limit = planLimitFailure(db, seasonId);
  if (limit === "too-many" || limit === "too-few" || limit === "division-empty") {
    throw new Refusal(limit);
  }
}

// A pending move that was never planned gets its city now.
function rollUnplannedMoves(db: DatabaseSync, kept: TeamRow[], seasonId: number, rng: Rng): void {
  for (const team of kept) {
    if (team.pendingMove === 1 && team.pendingMoveCity === null) {
      rollMoveCity(db, team.id, seasonId, rng);
      team.pendingMoveCity = (
        db
          .prepare("SELECT pending_move_city AS city FROM team_season WHERE id = ?")
          .get(team.id) as {
          city: string;
        }
      ).city;
    }
  }
}

function loadExpansionTeams(db: DatabaseSync, seasonId: number): ExpansionRow[] {
  return db
    .prepare(
      `SELECT division_id AS divisionId, city, nickname, head_coach_name AS headCoachName,
              primary_color AS primaryColor, secondary_color AS secondaryColor,
              ownership_style AS ownershipStyle, ownership_loyalty AS ownershipLoyalty,
              front_office_grade AS frontOfficeGrade, head_coach_grade AS headCoachGrade
       FROM expansion_team WHERE season_id = ? ORDER BY position`,
    )
    .all(seasonId) as ExpansionRow[];
}

// What the coach steps need for every team: the kept teams, then expansion teams.
function coachInputs(
  kept: TeamRow[],
  expansion: ExpansionRow[],
  expansionIds: number[],
): CoachInput[] {
  return [
    ...kept.map((team): CoachInput => {
      if (team.frontOfficeGrade === null || team.headCoachGrade === null) {
        throw new Error("An accepted team has no grades.");
      }
      return {
        franchiseId: team.franchiseId,
        teamName: `${team.city} ${team.nickname}`,
        coachName: team.headCoachName,
        frontOfficeGrade: team.frontOfficeGrade,
        headCoachGrade: team.headCoachGrade,
        hotSeat: team.hotSeat === 1,
        ownershipStyle: team.ownershipStyle,
        ownershipLoyalty: team.ownershipLoyalty,
        previous: {
          wins: team.wins ?? 0,
          losses: team.losses ?? 0,
          ties: team.ties ?? 0,
          madePlayoffs: team.madePlayoffs === 1,
          isChampion: team.isChampion === 1,
        },
      };
    }),
    ...expansion.map((team, index): CoachInput => ({
      franchiseId: expansionIds[index],
      teamName: `${team.city} ${team.nickname}`,
      coachName: team.headCoachName,
      frontOfficeGrade: team.frontOfficeGrade,
      headCoachGrade: team.headCoachGrade,
      hotSeat: false,
      ownershipStyle: team.ownershipStyle,
      ownershipLoyalty: team.ownershipLoyalty,
      previous: null,
    })),
  ];
}

// Runs the off-season rules: the coach steps, then steps 7 and 8 with the FP the
// coach steps left, then training camp steps 1 to 6. An expansion team has no
// previous profile, so it is average.
function runRules(kept: TeamRow[], inputs: CoachInput[], taken: string[], rng: Rng) {
  const { teams: coached, log: coachLog } = runCoaches(inputs, taken, rng);
  const annualTeams: AnnualTeam[] = inputs.map((input, index) => {
    const old = kept[index];
    return {
      franchiseId: input.franchiseId,
      teamName: input.teamName,
      headCoachGrade: coached[index].headCoachGrade,
      points: coached[index].franchisePoints,
      previousOffense: old?.offenseProfile ?? "AVERAGE",
      previousDefense: old?.defenseProfile ?? "AVERAGE",
    };
  });
  const { results: annual, log: annualLog } = runAnnualDraft(annualTeams, rng);
  const campTeams: CampTeam[] = annualTeams.map((team, index) => ({
    ...team,
    points: annual[index].pointsLeft,
    frontOfficeGrade: coached[index].frontOfficeGrade,
    offenseProfile: annual[index].offenseProfile,
    defenseProfile: annual[index].defenseProfile,
    offenseQualities: annual[index].offenseQualities,
    defenseQualities: annual[index].defenseQualities,
  }));
  const { results: camp, log: campLog } = runTrainingCamp(campTeams, rng);
  const log: OffseasonLogEntry[] = [...coachLog, ...annualLog, ...campLog];
  return { coached, annual, camp, log };
}

type OldDivision = { id: number; conferenceId: number | null; name: string; position: number };

// Copies the conferences and divisions to the new season in display order.
// Returns the old divisions and the new id of each.
function copyStructure(
  db: DatabaseSync,
  oldSeasonId: number,
  seasonId: number,
  entries: Entry[],
): { divisions: OldDivision[]; divisionIds: Map<number, number> } {
  const conferenceIds = new Map<number, number>();
  const conferences = db
    .prepare("SELECT id, name, position FROM conference WHERE season_id = ? ORDER BY position")
    .all(oldSeasonId) as { id: number; name: string; position: number }[];
  for (const conference of conferences) {
    const id = Number(
      db
        .prepare("INSERT INTO conference (season_id, name, position) VALUES (?, ?, ?)")
        .run(seasonId, conference.name, conference.position).lastInsertRowid,
    );
    conferenceIds.set(conference.id, id);
  }
  const divisions = db
    .prepare(
      `SELECT division.id AS id, division.conference_id AS conferenceId, division.name AS name,
              division.position AS position
       FROM division
       LEFT JOIN conference ON conference.id = division.conference_id
       WHERE division.season_id = ?
       ORDER BY COALESCE(conference.position, 0), division.position`,
    )
    .all(oldSeasonId) as OldDivision[];
  const divisionIds = new Map<number, number>();
  for (const division of divisions) {
    const count = entries.filter((entry) => entry.oldDivisionId === division.id).length;
    const id = Number(
      db
        .prepare(
          `INSERT INTO division (season_id, conference_id, name, position, team_count)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          seasonId,
          division.conferenceId === null
            ? null
            : (conferenceIds.get(division.conferenceId) ?? null),
          division.name,
          division.position,
          count,
        ).lastInsertRowid,
    );
    divisionIds.set(division.id, id);
  }
  return { divisions, divisionIds };
}

// Saves the teams in division order; within a division kept teams first, then new ones.
function insertTeams(
  db: DatabaseSync,
  seasonId: number,
  entries: Entry[],
  divisions: OldDivision[],
  divisionIds: Map<number, number>,
  rules: ReturnType<typeof runRules>,
): void {
  const divisionOrder = (entry: Entry) =>
    divisions.findIndex((division) => division.id === entry.oldDivisionId);
  const order = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => divisionOrder(a.entry) - divisionOrder(b.entry) || a.index - b.index);

  const insertTeam = db.prepare(
    `INSERT INTO team_season (season_id, franchise_id, division_id, position, city, nickname,
       head_coach_name, primary_color, secondary_color, offense_tag, ownership_style,
       ownership_loyalty, front_office_grade, head_coach_grade, hot_seat, franchise_points,
       offense_profile, offense_qualities, offense_special_result,
       defense_profile, defense_qualities, defense_special_result)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  order.forEach(({ entry, index }, position) => {
    const hired = rules.coached[index];
    const drafted = rules.annual[index];
    const camp = rules.camp[index];
    insertTeam.run(
      seasonId,
      entry.franchiseId,
      entry.oldDivisionId === null ? null : (divisionIds.get(entry.oldDivisionId) ?? null),
      position,
      entry.city,
      entry.nickname,
      hired.headCoachName,
      entry.primaryColor,
      entry.secondaryColor,
      entry.offenseTag,
      hired.ownershipStyle,
      hired.ownershipLoyalty,
      camp.frontOfficeGrade,
      hired.headCoachGrade,
      hired.hotSeat ? 1 : 0,
      camp.pointsLeft,
      drafted.offenseProfile,
      JSON.stringify(camp.offenseQualities),
      drafted.offenseSpecialResult,
      drafted.defenseProfile,
      JSON.stringify(camp.defenseQualities),
      drafted.defenseSpecialResult,
    );
  });
}

function insertRun(db: DatabaseSync, seasonId: number, seed: number, log: OffseasonLogEntry[]) {
  const runId = Number(
    db
      .prepare("INSERT INTO run (season_id, kind, seed, created_at) VALUES (?, 'offseason', ?, ?)")
      .run(seasonId, seed, new Date().toISOString()).lastInsertRowid,
  );
  const insertEntry = db.prepare(
    `INSERT INTO run_log_entry (run_id, position, step, franchise_id, message)
     VALUES (?, ?, ?, ?, ?)`,
  );
  log.forEach((line, position) => {
    insertEntry.run(runId, position, line.step, line.franchiseId, line.message);
  });
}

// Builds the next season as a draft from the accepted one and its plan, with
// the run and its log. The caller owns the transaction and checks the season.
function buildDraft(db: DatabaseSync, season: SeasonRow, leagueId: number, seed: number): void {
  const rng = seededRng(seed);

  const kept = loadKeptTeams(db, season.id);
  requireStartable(db, season.id);
  rollUnplannedMoves(db, kept, season.id, rng);
  const expansion = loadExpansionTeams(db, season.id);

  // Expansion teams become franchises now, so the log can name them.
  const insertFranchise = db.prepare("INSERT INTO franchise (league_id) VALUES (?)");
  const expansionIds = expansion.map(() => Number(insertFranchise.run(leagueId).lastInsertRowid));

  const taken = [...kept, ...expansion].map((team) => team.headCoachName);
  const rules = runRules(kept, coachInputs(kept, expansion, expansionIds), taken, rng);

  const entries: Entry[] = [
    ...kept.map((team) => ({
      franchiseId: team.franchiseId,
      oldDivisionId: team.divisionId,
      city: team.pendingMove === 1 && team.pendingMoveCity ? team.pendingMoveCity : team.city,
      nickname: team.nickname,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      offenseTag: team.offenseTag,
    })),
    ...expansion.map((team, index) => ({
      franchiseId: expansionIds[index],
      oldDivisionId: team.divisionId,
      city: team.city,
      nickname: team.nickname,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      offenseTag: null,
    })),
  ];

  const sequence =
    (
      db.prepare("SELECT MAX(sequence) AS last FROM season WHERE league_id = ?").get(leagueId) as {
        last: number;
      }
    ).last + 1;
  const seasonId = Number(
    db
      .prepare(
        `INSERT INTO season (league_id, sequence, label, xp_kick_distance, status, team_count)
         VALUES (?, ?, ?, ?, 'draft', ?)`,
      )
      .run(
        leagueId,
        sequence,
        nextSeasonLabel(season.label, sequence),
        season.xpKickDistance,
        entries.length,
      ).lastInsertRowid,
  );

  const { divisions, divisionIds } = copyStructure(db, season.id, seasonId, entries);
  insertTeams(db, seasonId, entries, divisions, divisionIds, rules);
  insertRun(db, seasonId, seed, rules.log);
}

// Removes the draft season with its divisions, teams and run, and the franchises
// only it used (the expansion teams).
function deleteDraft(db: DatabaseSync, draftId: number): void {
  const orphans = db
    .prepare(
      `SELECT franchise_id AS id FROM team_season
       WHERE season_id = ?1
         AND NOT EXISTS (SELECT 1 FROM team_season other
                         WHERE other.franchise_id = team_season.franchise_id
                           AND other.season_id <> ?1)`,
    )
    .all(draftId) as { id: number }[];
  db.prepare("DELETE FROM season WHERE id = ?").run(draftId);
  const remove = db.prepare("DELETE FROM franchise WHERE id = ?");
  for (const orphan of orphans) remove.run(orphan.id);
}

function requireAccepted(season: SeasonRow | undefined): SeasonRow {
  if (!season) throw new Refusal("not-found");
  if (season.status !== "accepted") throw new Refusal("not-accepted");
  return season;
}

// Runs the off-season for an accepted season, saving the next season as a draft.
export function startOffseason(db: DatabaseSync, leagueId: number, seed: number): OffseasonResult {
  return attempt(db, () => {
    const season = requireAccepted(findSeason(db, leagueId));
    if (hasLaterSeason(db, season.id)) throw new Refusal("already-started");
    buildDraft(db, season, leagueId, seed);
  });
}

// Runs the off-season again from the same inputs, replacing the draft in full.
export function rerollOffseason(db: DatabaseSync, leagueId: number, seed: number): OffseasonResult {
  return attempt(db, () => {
    const season = requireAccepted(findSeason(db, leagueId));
    const draftId = findDraftId(db, leagueId);
    if (draftId === undefined) throw new Refusal("not-started");
    deleteDraft(db, draftId);
    buildDraft(db, season, leagueId, seed);
  });
}

// Deletes the draft so the plan can be edited again.
export function discardOffseason(db: DatabaseSync, leagueId: number): OffseasonResult {
  return attempt(db, () => {
    requireAccepted(findSeason(db, leagueId));
    const draftId = findDraftId(db, leagueId);
    if (draftId === undefined) throw new Refusal("not-started");
    deleteDraft(db, draftId);
  });
}

export type DraftTeam = {
  id: number;
  franchiseId: number;
  divisionName: string | null;
  city: string;
  nickname: string;
  isNew: boolean;
  headCoachName: string;
  headCoachGrade: Grade;
  hotSeat: boolean;
  ownershipStyle: OwnershipStyle | null;
  ownershipLoyalty: OwnershipLoyalty | null;
  frontOfficeGrade: Grade;
  franchisePoints: number;
  offenseProfile: OffenseProfile;
  offenseQualities: Quality[];
  offenseSpecialResult: string | null;
  defenseProfile: DefenseProfile;
  defenseQualities: DefenseQuality[];
  defenseSpecialResult: string | null;
};

export type OffseasonDraft = {
  seasonLabel: string;
  seed: number;
  teams: DraftTeam[];
  log: OffseasonLogEntry[];
};

export function getOffseasonDraft(db: DatabaseSync, leagueId: number): OffseasonDraft | null {
  const draftId = findDraftId(db, leagueId);
  if (draftId === undefined) return null;

  const season = db.prepare("SELECT label FROM season WHERE id = ?").get(draftId) as {
    label: string;
  };
  const run = db
    .prepare("SELECT id, seed FROM run WHERE season_id = ? AND kind = 'offseason' ORDER BY id DESC")
    .get(draftId) as { id: number; seed: number };
  const teams = db
    .prepare(
      `SELECT team_season.id AS id, team_season.franchise_id AS franchiseId,
              division.name AS divisionName, city, nickname,
              NOT EXISTS (SELECT 1 FROM team_season other
                          WHERE other.franchise_id = team_season.franchise_id
                            AND other.season_id <> team_season.season_id) AS isNew,
              head_coach_name AS headCoachName, head_coach_grade AS headCoachGrade,
              hot_seat AS hotSeat, ownership_style AS ownershipStyle,
              ownership_loyalty AS ownershipLoyalty, front_office_grade AS frontOfficeGrade,
              franchise_points AS franchisePoints,
              offense_profile AS offenseProfile, offense_qualities AS offenseQualities,
              offense_special_result AS offenseSpecialResult,
              defense_profile AS defenseProfile, defense_qualities AS defenseQualities,
              defense_special_result AS defenseSpecialResult
       FROM team_season
       LEFT JOIN division ON division.id = team_season.division_id
       WHERE team_season.season_id = ?
       ORDER BY team_season.position`,
    )
    .all(draftId) as (Omit<
    DraftTeam,
    "isNew" | "hotSeat" | "offenseQualities" | "defenseQualities"
  > & { isNew: number; hotSeat: number; offenseQualities: string; defenseQualities: string })[];
  const log = db
    .prepare(
      `SELECT step, franchise_id AS franchiseId, message
       FROM run_log_entry WHERE run_id = ? ORDER BY position`,
    )
    .all(run.id) as OffseasonLogEntry[];

  return {
    seasonLabel: season.label,
    seed: run.seed,
    teams: teams.map((team) => ({
      ...team,
      isNew: team.isNew === 1,
      hotSeat: team.hotSeat === 1,
      offenseQualities: JSON.parse(team.offenseQualities) as Quality[],
      defenseQualities: JSON.parse(team.defenseQualities) as DefenseQuality[],
    })),
    log,
  };
}
