import { ascendingKey, rollD6, shuffle, type Rng } from "@/lib/dice";
import type { DefenseProfile, DefenseQualityName } from "@/lib/reference/defense-tables";
import type { Grade } from "@/lib/reference/management-tables";
import {
  qvCdvFor,
  type OffenseProfile,
  type OffenseQuality,
} from "@/lib/reference/offense-tables";
import {
  qualityLabel,
  type Footnote,
  type Pair,
  type ProfileRow,
  type Quality,
  type Strength,
} from "@/lib/reference/profile-tables";
import type { ReturnQuality } from "@/lib/reference/special-teams-tables";

// The inaugural draft, CE "Create A New League" steps 8 to 14, in order.
export const DRAFT_STEPS = [
  "qv-cdv",
  "offense-profile",
  "offense-qualities",
  "efficiency",
  "defense-profile",
  "defense-qualities",
  "special-teams",
] as const;
export type DraftStep = (typeof DRAFT_STEPS)[number];

export const DRAFT_STEP_HEADINGS: Record<DraftStep, string> = {
  "qv-cdv": "Step 8: QV and CDV",
  "offense-profile": "Step 9: Offense profile",
  "offense-qualities": "Step 10: Remaining offense qualities",
  efficiency: "Step 11: EFFICIENT and INEFFICIENT",
  "defense-profile": "Step 12: Defense profile",
  "defense-qualities": "Step 13: Remaining defense qualities",
  "special-teams": "Step 14: Special teams",
};

export type DraftTeam = {
  franchiseId: number;
  teamName: string;
  headCoachGrade: Grade;
  points: number;
};

// A line with no franchise describes the league or a draw that found no team.
export type DraftLogEntry = { step: DraftStep; franchiseId: number | null; message: string };

export type SpecialTeams = {
  kickReturn: ReturnQuality | null;
  puntReturn: ReturnQuality | null;
  fgRange: string;
  xpRange: string;
};

// One side of the ball on a card, for the profiles the draft hands out on
// that side and its quality names. The profile is AVERAGE until a team is
// drawn for another.
type SideCard<Profile extends string, Name extends string> = {
  profile: Profile | "AVERAGE";
  qualities: Quality<Name>[];
};

// A team's card as the draft fills it in.
export type Card = DraftTeam & {
  offense: SideCard<Exclude<OffenseProfile, "AVERAGE">, OffenseQuality>;
  defense: SideCard<Exclude<DefenseProfile, "AVERAGE">, DefenseQualityName>;
  specialTeams: SpecialTeams | null;
};

export type Draft = {
  cards: Card[];
  qv: number;
  cdv: number;
  rng: Rng;
  log: DraftLogEntry[];
};

export function openDraft(teams: DraftTeam[], rng: Rng): Draft {
  return {
    cards: teams.map((team) => ({
      ...team,
      offense: { profile: "AVERAGE", qualities: [] },
      defense: { profile: "AVERAGE", qualities: [] },
      specialTeams: null,
    })),
    ...qvCdvFor(teams.length),
    rng,
    log: [],
  };
}

// What differs between the offense draft (steps 9 and 10) and the defense
// draft (steps 12 and 13). The procedure itself is the same. The two type
// parameters tie a side's part of the card to its own profiles, table, labels,
// footnote awards and pairs.
export type Side<Profile extends string, Name extends string> = {
  // The side's part of a card.
  of: (card: Card) => SideCard<Profile, Name>;
  profileStep: DraftStep;
  qualitiesStep: DraftStep;
  // The rulebook's number for the profile step, as the log names it.
  profileStepNumber: number;
  // The four profiles handed out, in sub-step order A to D. Teams may pay to
  // avoid the last two.
  profiles: readonly Profile[];
  labels: Record<Profile | "AVERAGE", string>;
  table: Record<Profile, Record<string, ProfileRow<Name>>>;
  footnoteAwards: Record<Footnote, Quality<Name>[]>;
  // The three pairs dealt after the profiles.
  remainingPairs: readonly Pair<Name>[];
};

function listed(qualities: Quality[]): string {
  return qualities.map(qualityLabel).join(", ");
}

// What a drawn team may pay to avoid, and what happens to its card if it does.
type Avoidance = { cost: number; what: string; then: string };

// Draws from the top of the deck until a team takes the result. A team that
// can afford the avoidance pays it and the next card is drawn in its place.
// Returns the taker, or null when the deck runs out, and everyone who avoided.
function draw(
  draft: Draft,
  step: DraftStep,
  deck: Card[],
  label: string,
  avoidance?: Avoidance,
): { taker: Card | null; avoiders: Card[] } {
  const avoiders: Card[] = [];
  for (let card = deck.shift(); card; card = deck.shift()) {
    if (!avoidance || card.points < avoidance.cost) return { taker: card, avoiders };
    card.points -= avoidance.cost;
    avoiders.push(card);
    draft.log.push({
      step,
      franchiseId: card.franchiseId,
      message:
        `${label}: drew ${card.teamName}. Spends ${avoidance.cost} FP to avoid ` +
        `${avoidance.what}, ${card.points} FP left. ${avoidance.then}`,
    });
  }
  draft.log.push({ step, franchiseId: null, message: `${label}: no teams remain to draw.` });
  return { taker: null, avoiders };
}

// A profile table footnote: one more team from the pool receives its
// qualities. Footnotes d, e and f are negative and cost 1 FP per quality to
// avoid.
function drawForFootnote<Profile extends string, Name extends string>(
  draft: Draft,
  side: Side<Profile, Name>,
  deck: Card[],
  label: string,
  footnote: Footnote,
): void {
  const award = side.footnoteAwards[footnote];
  const noteLabel = `${label}, footnote ${footnote}`;
  const negative = "def".includes(footnote);
  const { taker } = draw(
    draft,
    side.profileStep,
    deck,
    noteLabel,
    negative
      ? {
          cost: award.length,
          what: listed(award),
          then: `Set aside for the rest of step ${side.profileStepNumber}.`,
        }
      : undefined,
  );
  if (!taker) return;
  side.of(taker).qualities.push(...award);
  draft.log.push({
    step: side.profileStep,
    franchiseId: taker.franchiseId,
    message: `${noteLabel}: drew ${taker.teamName}, who receives ${listed(award)}.`,
  });
}

// Steps 9 and 12. Teams leave the pool when they roll for a profile, receive
// a footnote's qualities or pay to avoid them. A team that pays to avoid a
// negative profile goes back into the pool once its replacement has been drawn.
export function draftProfiles<Profile extends string, Name extends string>(
  draft: Draft,
  side: Side<Profile, Name>,
): void {
  const step = side.profileStep;
  let pool = draft.cards;

  side.profiles.forEach((profile, index) => {
    const name = side.labels[profile];
    const label = `Step ${"ABCD"[index]}, ${name}`;
    let deck = shuffle(pool, draft.rng);

    const rolling: Card[] = [];
    for (let slot = 0; slot < draft.cdv; slot++) {
      const { taker, avoiders } = draw(
        draft,
        step,
        deck,
        label,
        index >= 2
          ? {
              cost: 2,
              what: `${/^[AEIOU]/.test(name) ? "an" : "a"} ${name} profile`,
              then: "The card is shuffled back in.",
            }
          : undefined,
      );
      if (avoiders.length > 0) deck = shuffle([...deck, ...avoiders], draft.rng);
      if (!taker) break;
      rolling.push(taker);
    }

    for (const card of rolling) {
      const key = ascendingKey(rollD6(draft.rng), rollD6(draft.rng));
      const row = side.table[profile][key];
      side.of(card).profile = profile;
      side.of(card).qualities.push(...row.qualities);
      draft.log.push({
        step,
        franchiseId: card.franchiseId,
        message:
          `${label}: drew ${card.teamName}. Roll ${key}: ` +
          `${[name, ...row.qualities.map(qualityLabel)].join(", ")}` +
          `${row.footnote ? `, footnote ${row.footnote}` : ""}.`,
      });
      if (row.footnote) drawForFootnote(draft, side, deck, label, row.footnote);
    }

    pool = deck;
  });
}

// Steps 10 and 13. For each pair every team starts in the deck, and a team
// that is drawn, whether it takes a quality or pays to avoid one, is out for
// that pair.
export function draftRemainingQualities<Profile extends string, Name extends string>(
  draft: Draft,
  side: Side<Profile, Name>,
): void {
  const step = side.qualitiesStep;
  const then = "Set aside for the rest of this pair.";

  side.remainingPairs.forEach(([positive, negative], index) => {
    const deck = shuffle(draft.cards, draft.rng);
    const slots: { quality: Name; strength: Strength; cost: number }[] = [
      { quality: positive, strength: "FULL", cost: 0 },
      { quality: positive, strength: "SEMI", cost: 0 },
      { quality: negative, strength: "FULL", cost: 2 },
      { quality: negative, strength: "SEMI", cost: 1 },
    ];

    for (const { quality, strength, cost } of slots) {
      const name = qualityLabel({ quality, strength });
      const label = `Pair #${index + 1}, ${name}`;
      for (let slot = 0; slot < draft.cdv; slot++) {
        const { taker } = draw(
          draft,
          step,
          deck,
          label,
          cost > 0 ? { cost, what: name, then } : undefined,
        );
        // An empty deck ends the pair: nobody is left for the later slots.
        if (!taker) return;
        side.of(taker).qualities.push({ quality, strength });
        draft.log.push({
          step,
          franchiseId: taker.franchiseId,
          message: `${label}: drew ${taker.teamName}.`,
        });
      }
    }
  });
}
