import { ascendingKey, rollD6, shuffle, type Rng } from "@/lib/dice";
import {
  DEFENSE_RANK,
  OFFENSE_RANK,
  TABLE_G_SEASON,
  TABLE_J,
  TABLE_L,
  type ProfileMove,
  type SpecialColumn,
} from "@/lib/reference/annual-draft-tables";
import {
  inDefensePairOrder,
  type DefenseProfile,
  type DefenseQuality,
} from "@/lib/reference/defense-tables";
import {
  inPairOrder,
  qualityLabel,
  type OffenseProfile,
  type Quality,
} from "@/lib/reference/offense-tables";
import { DEFENSE } from "@/lib/rules/defense";
import {
  drawForFootnote,
  openDraft,
  type Card,
  type Draft,
  type DraftTeam,
  type Side,
} from "@/lib/rules/draft";
import { OFFENSE } from "@/lib/rules/offense";

// CE "Season Progression" off-season steps 7 and 8: new offense and defense
// profiles, with the log steps they write under.
export const ANNUAL_STEPS = ["offense-profile", "defense-profile"] as const;
export type AnnualStep = (typeof ANNUAL_STEPS)[number];

export const ANNUAL_STEP_HEADINGS: Record<AnnualStep, string> = {
  "offense-profile": "Step 7: Annual draft and free agency, offense",
  "defense-profile": "Step 8: Annual draft and free agency, defense",
};

export type AnnualTeam = DraftTeam & {
  // The profiles the team had last season. A new team is AVERAGE on both sides.
  previousOffense: OffenseProfile;
  previousDefense: DefenseProfile;
};

export type AnnualResult = {
  franchiseId: number;
  offenseProfile: OffenseProfile;
  offenseQualities: Quality[];
  offenseSpecialResult: string | null;
  defenseProfile: DefenseProfile;
  defenseQualities: DefenseQuality[];
  defenseSpecialResult: string | null;
  pointsLeft: number;
};

export type AnnualLogEntry = { step: AnnualStep; franchiseId: number | null; message: string };

// What differs between step 7 and step 8: the tables, ranks and special
// columns. The inaugural draft's side supplies the profile table (K or M, the
// same rows as Table C or D), the labels and the footnote draw. Profiles are
// plain strings here because a side's profile type only differs by name.
type AnnualSide = {
  side: Side<string, string>;
  moves: Record<string, Record<string, ProfileMove<string>>>;
  rank: string[];
  specialColumns: { "*": SpecialColumn; "**": SpecialColumn };
  tableName: string;
  profileTable: string;
};

// Steps B and C for one side of the ball, for every team in the league.
function annualSide(
  draft: Draft,
  config: AnnualSide,
  previous: Map<number, string>,
  specials: Map<number, string>,
): void {
  const { side, moves, rank } = config;
  const step = side.profileStep;
  const label = (profile: string) => side.labels[profile];
  const say = (card: Card | null, message: string) =>
    draft.log.push({ step, franchiseId: card?.franchiseId ?? null, message });

  // Step B: every team rolls in the column of its previous profile. A team that
  // rolls lower than it was pays 1 FP to roll again, and keeps the best roll.
  for (const card of draft.cards) {
    const before = previous.get(card.franchiseId) as string;
    const column = moves[before];
    let best: ProfileMove<string> | null = null;
    for (let attempt = 1; ; attempt++) {
      const key = ascendingKey(rollD6(draft.rng), rollD6(draft.rng));
      const move = column[key];
      const lower = rank.indexOf(move.to) < rank.indexOf(before);
      say(
        card,
        `${config.tableName}, ${card.teamName} (was ${label(before)}): roll ${key}, ` +
          `${label(move.to)}${move.special ? ` (${move.special})` : ""}.`,
      );
      if (best === null || rank.indexOf(move.to) > rank.indexOf(best.to)) best = move;
      if (!lower || card.points < 1) break;
      card.points -= 1;
      say(
        card,
        `${card.teamName} spends 1 FP to re-roll a result that lowers the profile, ` +
          `${card.points} FP left.`,
      );
    }
    side.of(card).profile = best.to;
    if (best.special) {
      const column = config.specialColumns[best.special];
      const roll = rollD6(draft.rng);
      const text = TABLE_G_SEASON[column][roll - 1];
      specials.set(card.franchiseId, text);
      say(card, `${card.teamName}: Table G ${column.replace("_", " ")}, roll ${roll}: ${text}.`);
    }
  }

  // Step C: the teams that are now PROLIFIC, PROLIFIC•, DULL or DULL• (or the
  // defense equivalents) roll on the profile table, one profile at a time.
  // Average teams are the pool for footnote draws.
  const deck = shuffle(
    draft.cards.filter((card) => side.of(card).profile === "AVERAGE"),
    draft.rng,
  );
  for (const profile of side.profiles) {
    for (const card of draft.cards.filter((entry) => side.of(entry).profile === profile)) {
      const key = ascendingKey(rollD6(draft.rng), rollD6(draft.rng));
      const row = side.table[profile][key];
      side.of(card).qualities.push(...row.qualities);
      const text = [label(profile), ...row.qualities.map(qualityLabel)].join(", ");
      say(
        card,
        `${config.profileTable}, ${card.teamName} (${label(profile)}): roll ${key}, ${text}` +
          `${row.footnote ? `, footnote ${row.footnote}` : ""}.`,
      );
      if (row.footnote) {
        drawForFootnote(
          draft,
          side,
          deck,
          `${config.profileTable}, ${card.teamName}`,
          row.footnote,
        );
      }
    }
  }
}

// Steps 7 and 8 for the whole league. `teams` carry the FP the coach steps left
// them, and the FP left after step 7 are the budget for step 8.
export function runAnnualDraft(
  teams: AnnualTeam[],
  rng: Rng,
): { results: AnnualResult[]; log: AnnualLogEntry[] } {
  const draft = openDraft(teams, rng);
  const offenseBefore = new Map(teams.map((team) => [team.franchiseId, team.previousOffense]));
  const defenseBefore = new Map(teams.map((team) => [team.franchiseId, team.previousDefense]));
  const offenseSpecials = new Map<number, string>();
  const defenseSpecials = new Map<number, string>();

  annualSide(
    draft,
    {
      side: OFFENSE,
      moves: TABLE_J,
      rank: OFFENSE_RANK,
      specialColumns: { "*": "PROLIFIC_OFFENSE", "**": "DULL_OFFENSE" },
      tableName: "Table J",
      profileTable: "Table K",
    },
    offenseBefore,
    offenseSpecials,
  );
  annualSide(
    draft,
    {
      side: DEFENSE,
      moves: TABLE_L,
      rank: DEFENSE_RANK,
      specialColumns: { "*": "STAUNCH_DEFENSE", "**": "INEPT_DEFENSE" },
      tableName: "Table L",
      profileTable: "Table M",
    },
    defenseBefore,
    defenseSpecials,
  );

  return {
    results: draft.cards.map((card) => ({
      franchiseId: card.franchiseId,
      offenseProfile: card.offense.profile,
      offenseQualities: inPairOrder(card.offense.qualities),
      offenseSpecialResult: offenseSpecials.get(card.franchiseId) ?? null,
      defenseProfile: card.defense.profile,
      defenseQualities: inDefensePairOrder(card.defense.qualities),
      defenseSpecialResult: defenseSpecials.get(card.franchiseId) ?? null,
      pointsLeft: card.points,
    })),
    log: draft.log.filter(
      (entry): entry is AnnualLogEntry =>
        entry.step === "offense-profile" || entry.step === "defense-profile",
    ),
  };
}
