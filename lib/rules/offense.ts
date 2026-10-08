import { ascendingKey, rollD6, shuffle, type Rng } from "@/lib/dice";
import type { Grade } from "@/lib/reference/management-tables";
import {
  DRAFT_PROFILES,
  FOOTNOTE_AWARDS,
  OFFENSE_PAIRS,
  PROFILE_LABELS,
  TABLE_C,
  inPairOrder,
  qualityLabel,
  qvCdvFor,
  type Footnote,
  type OffenseProfile,
  type OffenseQuality,
  type Quality,
  type Strength,
} from "@/lib/reference/offense-tables";

export const OFFENSE_STEPS = [
  "qv-cdv",
  "offense-profile",
  "offense-qualities",
  "efficiency",
] as const;
export type OffenseStep = (typeof OFFENSE_STEPS)[number];

export const OFFENSE_STEP_HEADINGS: Record<OffenseStep, string> = {
  "qv-cdv": "Step 8: QV and CDV",
  "offense-profile": "Step 9: Offense profile",
  "offense-qualities": "Step 10: Remaining offense qualities",
  efficiency: "Step 11: EFFICIENT and INEFFICIENT",
};

export type DraftTeam = {
  franchiseId: number;
  teamName: string;
  headCoachGrade: Grade;
  points: number;
};

export type OffenseResult = {
  franchiseId: number;
  offenseProfile: OffenseProfile;
  offenseQualities: Quality[];
  pointsLeft: number;
};

// A line with no franchise describes the league or a draw that found no team.
export type OffenseLogEntry = { step: OffenseStep; franchiseId: number | null; message: string };

// A team's card as the draft fills it in.
type Card = DraftTeam & { profile: OffenseProfile; qualities: Quality[] };

export type Draft = {
  cards: Card[];
  qv: number;
  cdv: number;
  rng: Rng;
  log: OffenseLogEntry[];
};

export function openDraft(teams: DraftTeam[], rng: Rng): Draft {
  return {
    cards: teams.map((team) => ({ ...team, profile: "AVERAGE", qualities: [] })),
    ...qvCdvFor(teams.length),
    rng,
    log: [],
  };
}

export function draftResults(draft: Draft): OffenseResult[] {
  return draft.cards.map((card) => ({
    franchiseId: card.franchiseId,
    offenseProfile: card.profile,
    offenseQualities: inPairOrder(card.qualities),
    pointsLeft: card.points,
  }));
}

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
  step: OffenseStep,
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

// A Table C footnote: one more team from the pool receives its qualities.
// Footnotes d, e and f are negative and cost 1 FP per quality to avoid.
function drawForFootnote(draft: Draft, deck: Card[], label: string, footnote: Footnote): void {
  const step = "offense-profile";
  const award = FOOTNOTE_AWARDS[footnote];
  const noteLabel = `${label}, footnote ${footnote}`;
  const negative = "def".includes(footnote);
  const { taker } = draw(
    draft,
    step,
    deck,
    noteLabel,
    negative
      ? { cost: award.length, what: listed(award), then: "Set aside for the rest of step 9." }
      : undefined,
  );
  if (!taker) return;
  taker.qualities.push(...award);
  draft.log.push({
    step,
    franchiseId: taker.franchiseId,
    message: `${noteLabel}: drew ${taker.teamName}, who receives ${listed(award)}.`,
  });
}

// Step 9. Teams leave the pool when they roll for a profile, receive a
// footnote's qualities or pay to avoid them. A team that pays to avoid a DULL
// profile goes back into the pool once its replacement has been drawn.
export function draftProfiles(draft: Draft): void {
  const step = "offense-profile";
  let pool = draft.cards;

  DRAFT_PROFILES.forEach((profile, index) => {
    const name = PROFILE_LABELS[profile];
    const label = `Step ${"ABCD"[index]}, ${name}`;
    const dull = profile === "DULL" || profile === "DULL_SEMI";
    let deck = shuffle(pool, draft.rng);

    const rolling: Card[] = [];
    for (let slot = 0; slot < draft.cdv; slot++) {
      const { taker, avoiders } = draw(
        draft,
        step,
        deck,
        label,
        dull
          ? { cost: 2, what: `a ${name} profile`, then: "The card is shuffled back in." }
          : undefined,
      );
      if (avoiders.length > 0) deck = shuffle([...deck, ...avoiders], draft.rng);
      if (!taker) break;
      rolling.push(taker);
    }

    for (const card of rolling) {
      const key = ascendingKey(rollD6(draft.rng), rollD6(draft.rng));
      const row = TABLE_C[profile][key];
      card.profile = profile;
      card.qualities.push(...row.qualities);
      draft.log.push({
        step,
        franchiseId: card.franchiseId,
        message:
          `${label}: drew ${card.teamName}. Roll ${key}: ` +
          `${[name, ...row.qualities.map(qualityLabel)].join(", ")}` +
          `${row.footnote ? `, footnote ${row.footnote}` : ""}.`,
      });
      if (row.footnote) drawForFootnote(draft, deck, label, row.footnote);
    }

    pool = deck;
  });
}

// Step 10. For each pair every team starts in the deck, and a team that is
// drawn, whether it takes a quality or pays to avoid one, is out for that pair.
export function draftRemainingQualities(draft: Draft): void {
  const step = "offense-qualities";
  const then = "Set aside for the rest of this pair.";

  OFFENSE_PAIRS.slice(2, 5).forEach(([positive, negative], index) => {
    const deck = shuffle(draft.cards, draft.rng);
    const slots: { quality: OffenseQuality; strength: Strength; cost: number }[] = [
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
        taker.qualities.push({ quality, strength });
        draft.log.push({
          step,
          franchiseId: taker.franchiseId,
          message: `${label}: drew ${taker.teamName}.`,
        });
      }
    }
  });
}

// Step 11. No Franchise Points may be spent here.
export function draftEfficiency(draft: Draft): void {
  const step = "efficiency";
  const say = (card: Card, message: string) =>
    draft.log.push({ step, franchiseId: card.franchiseId, message });

  // Steps A to C, then D to F: draw 2 x QV at random, add every undrawn team
  // whose coach has the grade, shuffle that stack and deal QV full then QV semi.
  const assign = (
    pool: Card[],
    [first, second, third]: string,
    grade: Grade,
    quality: OffenseQuality,
  ) => {
    const deck = shuffle(pool, draft.rng);
    const drawn = deck.splice(0, 2 * draft.qv);
    for (const card of drawn) say(card, `Step ${first}: drew ${card.teamName}.`);

    const graded = deck.filter((card) => card.headCoachGrade === grade);
    for (const card of graded) {
      say(card, `Step ${second}: ${card.teamName} joins the stack with a Head Coach Grade ${grade}.`);
    }

    const stack = shuffle([...drawn, ...graded], draft.rng);
    const deal = (letter: string, strength: Strength) => {
      for (const card of stack.splice(0, draft.qv)) {
        card.qualities.push({ quality, strength });
        say(card, `Step ${letter}: ${card.teamName} receives ${qualityLabel({ quality, strength })}.`);
      }
    };
    deal(second, "FULL");
    deal(third, "SEMI");
  };

  assign(draft.cards, "ABC", "A", "EFFICIENT");
  const remaining = draft.cards.filter(
    (card) => !card.qualities.some((entry) => entry.quality === "EFFICIENT"),
  );
  assign(remaining, "DEF", "D", "INEFFICIENT");
}

// CE "Create A New League" steps 8 to 11, with Franchise Points spent
// automatically to avoid bad results whenever a team can afford to.
export function draftOffense(
  teams: DraftTeam[],
  rng: Rng,
): { teams: OffenseResult[]; log: OffenseLogEntry[] } {
  const draft = openDraft(teams, rng);
  draft.log.push({
    step: "qv-cdv",
    franchiseId: null,
    message: `${teams.length} teams: QV ${draft.qv}, CDV ${draft.cdv}.`,
  });
  draftProfiles(draft);
  draftRemainingQualities(draft);
  draftEfficiency(draft);
  return { teams: draftResults(draft), log: draft.log };
}
