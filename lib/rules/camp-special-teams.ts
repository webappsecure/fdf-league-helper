import { shuffle, type Rng } from "@/lib/dice";
import type { XpKickDistance } from "@/lib/league-setup";
import { qvCdvFor } from "@/lib/reference/offense-tables";
import {
  TABLE_E,
  isBetter,
  resultLabel,
  type SpecialTeamsResult,
} from "@/lib/reference/special-teams-tables";
import type { SpecialTeams } from "@/lib/rules/draft";
import { rollKey, slot, spendPoints, type Slot } from "@/lib/rules/special-teams";
import type { CampLogEntry } from "@/lib/rules/training-camp";

export type CampSpecialInput = {
  franchiseId: number;
  teamName: string;
  points: number;
  // Last season's special teams; null for an expansion team.
  previous: SpecialTeams | null;
};

type Column = keyof SpecialTeams;

const LABELS: Record<Column, string> = {
  kickReturn: "Kickoff return",
  puntReturn: "Punt return",
  fgRange: "FG",
  xpRange: "XP",
};

type State = {
  team: CampSpecialInput;
  special: SpecialTeams;
  // Columns the team rolled this camp; a kept quality may not be re-rolled with FP.
  rolled: Set<Column>;
};

// Step 7 for the whole league. Expansion teams have nothing to keep, so they roll
// every column and sit out the draws. Each draw shuffles the teams that hold a
// result; the rest of the league, and expansion teams, roll.
export function runCampSpecialTeams(
  teams: CampSpecialInput[],
  xpKickDistance: XpKickDistance,
  rng: Rng,
): { results: SpecialTeams[]; log: CampLogEntry[] } {
  const log: CampLogEntry[] = [];
  const say = (state: State, message: string) =>
    log.push({
      step: "camp-special-teams",
      franchiseId: state.team.franchiseId,
      message,
    });
  const xpRows = TABLE_E[xpKickDistance === 2 ? "xp2" : "xp15"];
  const rows: Record<Column, Record<string, SpecialTeamsResult>> = {
    kickReturn: TABLE_E.kickReturn,
    puntReturn: TABLE_E.puntReturn,
    fgRange: TABLE_E.fg,
    xpRange: xpRows,
  };

  const states: State[] = teams.map((team) => ({
    team: { ...team },
    special: team.previous
      ? { ...team.previous }
      : { kickReturn: null, puntReturn: null, fgRange: "", xpRange: "" },
    rolled: new Set<Column>(),
  }));
  const holders = states.filter((state) => state.team.previous);
  const { cdv } = qvCdvFor(teams.length);

  const roll = (state: State, column: Column, onlyIfBetter: boolean) => {
    const key = rollKey(rng);
    const result = rows[column][key];
    const held = state.special[column];
    const take = !onlyIfBetter || isBetter(result, held);
    if (take) (state.special as Record<Column, SpecialTeamsResult>)[column] = result;
    state.rolled.add(column);
    say(
      state,
      `${state.team.teamName}: ${LABELS[column]} roll ${key}, ${resultLabel(result)}. ` +
        (onlyIfBetter && !take
          ? `Keeps ${resultLabel(held)}.`
          : `Now ${resultLabel(take ? result : held)}.`),
    );
  };

  // Steps A and B: teams drawn with an ELECTRIC quality keep it, up to CDV of them.
  for (const column of ["kickReturn", "puntReturn"] as const) {
    const kept = new Set<State>();
    for (const state of shuffle(holders, rng)) {
      if (kept.size >= cdv) break;
      if (state.special[column] === null) continue;
      kept.add(state);
      say(
        state,
        `${state.team.teamName}: ${LABELS[column]} stays ${resultLabel(state.special[column])}.`,
      );
    }
    for (const state of states) if (!kept.has(state)) roll(state, column, false);
  }

  // Steps C and D: half keep, half of the rest may improve, the rest roll anew.
  for (const column of ["fgRange", "xpRange"] as const) {
    const drawn = shuffle(holders, rng);
    const keepCount = Math.ceil(drawn.length / 2);
    const rest = drawn.slice(keepCount);
    const improveCount = Math.ceil(rest.length / 2);
    for (const state of drawn.slice(0, keepCount)) {
      say(state, `${state.team.teamName}: ${LABELS[column]} stays ${state.special[column]}.`);
    }
    for (const state of rest.slice(0, improveCount)) roll(state, column, true);
    const fresh = new Set([...rest.slice(improveCount), ...states.filter((s) => !s.team.previous)]);
    for (const state of states) if (fresh.has(state)) roll(state, column, false);
  }

  for (const state of states) {
    const slots: Slot[] = [...state.rolled].map((column) =>
      slot(
        LABELS[column],
        rows[column],
        () => state.special[column],
        (result) => {
          (state.special as Record<Column, SpecialTeamsResult>)[column] = result;
        },
      ),
    );
    spendPoints(state.team, slots, rng, (message) => say(state, message));
  }
  return { results: states.map((state) => state.special), log };
}
