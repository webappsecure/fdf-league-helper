import { ascendingKey, rollD6 } from "@/lib/dice";
import type { XpKickDistance } from "@/lib/league-setup";
import {
  TABLE_E,
  isBetter,
  resultLabel,
  waysToImprove,
  type SpecialTeamsResult,
} from "@/lib/reference/special-teams-tables";
import type { Draft, SpecialTeams } from "@/lib/rules/draft";

// One of a team's four results, as the re-roll loop sees it: what the team
// holds, its chance of improving, and how to look a new roll up and keep it.
type Slot = {
  label: string;
  held: () => SpecialTeamsResult;
  ways: () => number;
  lookUp: (key: string) => SpecialTeamsResult;
  keep: (key: string) => void;
};

// Ties a slot to one column, so it is scored on the rows it re-rolls on, and a
// return quality can only be kept as a return quality and a range as a range.
function slot<Result extends SpecialTeamsResult>(
  label: string,
  rows: Record<string, Result>,
  held: () => Result,
  set: (result: Result) => void,
): Slot {
  return {
    label,
    held,
    ways: () => waysToImprove(rows, held()),
    lookUp: (key) => rows[key],
    keep: (key) => set(rows[key]),
  };
}

// Step 14. Each team rolls on four Table E columns, then spends leftover
// Franchise Points one at a time on re-rolls, always of the result with the
// best chance of improving, and keeps the better of the old and new result.
// Points still unspent when nothing can improve are lost. Returns each team's
// results in card order.
export function rollSpecialTeams(draft: Draft, xpKickDistance: XpKickDistance): SpecialTeams[] {
  const xpColumn = xpKickDistance === 2 ? "xp2" : "xp15";

  return draft.cards.map((card) => {
    const say = (message: string) =>
      draft.log.push({ step: "special-teams", franchiseId: card.franchiseId, message });
    const roll = () => ascendingKey(rollD6(draft.rng), rollD6(draft.rng));
    const first = <Result extends SpecialTeamsResult>(
      label: string,
      rows: Record<string, Result>,
    ): Result => {
      const key = roll();
      say(`${card.teamName}: ${label} roll ${key}, ${resultLabel(rows[key])}.`);
      return rows[key];
    };

    // Rolled in this order.
    const special: SpecialTeams = {
      kickReturn: first("Kickoff return", TABLE_E.kickReturn),
      puntReturn: first("Punt return", TABLE_E.puntReturn),
      fgRange: first("FG", TABLE_E.fg),
      xpRange: first("XP", TABLE_E[xpColumn]),
    };
    const slots = [
      slot("Kickoff return", TABLE_E.kickReturn, () => special.kickReturn, (result) => {
        special.kickReturn = result;
      }),
      slot("Punt return", TABLE_E.puntReturn, () => special.puntReturn, (result) => {
        special.puntReturn = result;
      }),
      slot("FG", TABLE_E.fg, () => special.fgRange, (result) => {
        special.fgRange = result;
      }),
      slot("XP", TABLE_E[xpColumn], () => special.xpRange, (result) => {
        special.xpRange = result;
      }),
    ];

    while (card.points > 0) {
      const ways = slots.map((each) => each.ways());
      const most = Math.max(...ways);
      if (most === 0) break;
      const weakest = slots[ways.indexOf(most)];
      const held = weakest.held();

      card.points -= 1;
      const key = roll();
      const rolled = weakest.lookUp(key);
      const improved = isBetter(rolled, held);
      if (improved) weakest.keep(key);
      say(
        `${card.teamName}: Spends 1 FP to re-roll ${weakest.label} (${resultLabel(held)}). ` +
          `Roll ${key}, ${resultLabel(rolled)}: ` +
          `${improved ? "kept" : `keeps ${resultLabel(held)}`}. ${card.points} FP left.`,
      );
    }

    if (card.points > 0) say(`${card.teamName}: ${card.points} FP unused and lost.`);
    return special;
  });
}
