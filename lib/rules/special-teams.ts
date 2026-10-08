import { ascendingKey, rollD6 } from "@/lib/dice";
import type { XpKickDistance } from "@/lib/league-setup";
import {
  TABLE_E,
  isBetter,
  resultLabel,
  waysToImprove,
  type SpecialTeamsColumn,
  type SpecialTeamsResult,
} from "@/lib/reference/special-teams-tables";
import type { Draft, SpecialTeams } from "@/lib/rules/draft";

// One of a team's four results, as the re-roll loop sees it: which column it
// came from, what the team holds, and how to look a new roll up and keep it.
type Slot = {
  name: SpecialTeamsColumn;
  label: string;
  held: () => SpecialTeamsResult;
  lookUp: (key: string) => SpecialTeamsResult;
  keep: (key: string) => void;
};

// Ties a slot to one column, so a return quality can only be kept as a return
// quality and a range as a range.
function slot<Result extends SpecialTeamsResult>(
  name: SpecialTeamsColumn,
  label: string,
  rows: Record<string, Result>,
  held: () => Result,
  set: (result: Result) => void,
): Slot {
  return { name, label, held, lookUp: (key) => rows[key], keep: (key) => set(rows[key]) };
}

// Step 14. Each team rolls on four Table E columns, then spends leftover
// Franchise Points one at a time on re-rolls, always of the result with the
// best chance of improving, and keeps the better of the old and new result.
// Points still unspent when nothing can improve are lost.
export function rollSpecialTeams(draft: Draft, xpKickDistance: XpKickDistance): void {
  const xpColumn = xpKickDistance === 2 ? "xp2" : "xp15";

  for (const card of draft.cards) {
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
      slot("kickReturn", "Kickoff return", TABLE_E.kickReturn, () => special.kickReturn, (result) => {
        special.kickReturn = result;
      }),
      slot("puntReturn", "Punt return", TABLE_E.puntReturn, () => special.puntReturn, (result) => {
        special.puntReturn = result;
      }),
      slot("fg", "FG", TABLE_E.fg, () => special.fgRange, (result) => {
        special.fgRange = result;
      }),
      slot(xpColumn, "XP", TABLE_E[xpColumn], () => special.xpRange, (result) => {
        special.xpRange = result;
      }),
    ];

    while (card.points > 0) {
      const ways = slots.map(({ name, held }) => waysToImprove(name, held()));
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
    card.specialTeams = special;
  }
}
