import type { DatabaseSync } from "node:sqlite";

// The season the app shows and edits: a league's highest sequence season that is
// accepted, or its first season while that is not yet accepted. An off-season
// draft has a higher sequence but is never current until it is accepted.
// `season` must be the table (or alias) the condition is added to.
export const CURRENT_SEASON = `season.id = (
  SELECT c.id FROM season c
  WHERE c.league_id = season.league_id AND (c.sequence = 1 OR c.status = 'accepted')
  ORDER BY c.sequence DESC LIMIT 1)`;

export function currentSeasonId(db: DatabaseSync, leagueId: number): number | undefined {
  const row = db
    .prepare(`SELECT season.id AS id FROM season WHERE season.league_id = ? AND ${CURRENT_SEASON}`)
    .get(leagueId) as { id: number } | undefined;
  return row?.id;
}
