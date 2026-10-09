import { rollD6, shuffle, type Rng } from "@/lib/dice";
import {
  DEFENSE_PROFILE_LABELS,
  inDefensePairOrder,
  type DefenseProfile,
  type DefenseQuality,
  type DefenseQualityName,
} from "@/lib/reference/defense-tables";
import { TABLE_U } from "@/lib/reference/events-table";
import {
  ownershipLoyaltyFor,
  ownershipStyleFor,
  type Grade,
  type OwnershipLoyalty,
  type OwnershipStyle,
} from "@/lib/reference/management-tables";
import {
  inPairOrder,
  PROFILE_LABELS,
  type OffenseProfile,
  type OffenseQuality,
  type Quality,
} from "@/lib/reference/offense-tables";
import type { Quality as AnyQuality } from "@/lib/reference/profile-tables";
import type { SpecialTeams } from "@/lib/rules/draft";
import type { CampLogEntry } from "@/lib/rules/training-camp";

// A team as training camp steps 8 and 9 see it: everything Table U can change.
export type EventTeam = {
  franchiseId: number;
  teamName: string;
  frontOfficeGrade: Grade;
  headCoachGrade: Grade;
  hotSeat: boolean;
  ownershipStyle: OwnershipStyle | null;
  ownershipLoyalty: OwnershipLoyalty | null;
  offenseProfile: OffenseProfile;
  defenseProfile: DefenseProfile;
  offenseQualities: Quality[];
  defenseQualities: DefenseQuality[];
  special: SpecialTeams;
  pendingMove: boolean;
};

// Best first.
const GRADES: Grade[] = ["A", "B", "C", "D", "F"];
const OFFENSE_ORDER: OffenseProfile[] = [
  "DULL",
  "DULL_SEMI",
  "AVERAGE",
  "PROLIFIC_SEMI",
  "PROLIFIC",
];
const DEFENSE_ORDER: DefenseProfile[] = [
  "INEPT",
  "INEPT_SEMI",
  "AVERAGE",
  "STAUNCH_SEMI",
  "STAUNCH",
];

// "Loses the opposite quality and gains this one at half strength; a half
// strength one becomes full; a full one is left alone."
export function shiftQuality<Name extends string>(
  qualities: AnyQuality<Name>[],
  positive: Name,
  negative: Name,
  toward: "positive" | "negative",
): { qualities: AnyQuality<Name>[]; note: string | null } {
  const gain = toward === "positive" ? positive : negative;
  const lose = toward === "positive" ? negative : positive;
  const held = qualities.find((each) => each.quality === gain);
  if (held?.strength === "FULL") return { qualities, note: null };
  const kept = qualities.filter((each) => each.quality !== lose && each.quality !== gain);
  if (held) {
    return {
      qualities: [...kept, { quality: gain, strength: "FULL" }],
      note: `${gain}• becomes ${gain}.`,
    };
  }
  const lost = qualities.some((each) => each.quality === lose);
  return {
    qualities: [...kept, { quality: gain, strength: "SEMI" }],
    note: `${lost ? `Loses ${lose} and gains` : "Gains"} ${gain}•.`,
  };
}

// "Loses the opposite quality and gains this one at full strength."
export function setFullQuality<Name extends string>(
  qualities: AnyQuality<Name>[],
  positive: Name,
  negative: Name,
  toward: "positive" | "negative",
): { qualities: AnyQuality<Name>[]; note: string | null } {
  const gain = toward === "positive" ? positive : negative;
  const lose = toward === "positive" ? negative : positive;
  if (qualities.some((each) => each.quality === gain && each.strength === "FULL")) {
    return { qualities, note: null };
  }
  const kept = qualities.filter((each) => each.quality !== lose && each.quality !== gain);
  const lost = qualities.some((each) => each.quality === lose);
  return {
    qualities: [...kept, { quality: gain, strength: "FULL" }],
    note: `${lost ? `Loses ${lose} and gains` : "Gains"} ${gain}.`,
  };
}

// Moves a grade `steps` toward A (positive) or F, stopping at either end.
export function moveGrade(grade: Grade, steps: number): Grade {
  const index = Math.min(GRADES.length - 1, Math.max(0, GRADES.indexOf(grade) - steps));
  return GRADES[index];
}

// Moves a kicking range along the d66 scale (11-61 follows 11-56), stopping at 11-66.
export function stepRange(range: string, steps: number): string {
  const tens = Number(range[3]);
  const ones = Number(range[4]);
  const position = Math.min(35, (tens - 1) * 6 + (ones - 1) + steps);
  return `11-${Math.floor(position / 6) + 1}${(position % 6) + 1}`;
}

type Effect = (team: EventTeam) => string | null;

function all(...effects: Effect[]): Effect {
  return (team) => {
    const notes = effects.map((effect) => effect(team)).filter((note) => note !== null);
    return notes.length > 0 ? notes.join(" ") : null;
  };
}

function offenseQuality(
  positive: OffenseQuality,
  negative: OffenseQuality,
  toward: "positive" | "negative",
  full = false,
): Effect {
  return (team) => {
    const change = (full ? setFullQuality : shiftQuality)(
      team.offenseQualities,
      positive,
      negative,
      toward,
    );
    team.offenseQualities = change.qualities;
    return change.note;
  };
}

function defenseQuality(
  positive: DefenseQualityName,
  negative: DefenseQualityName,
  toward: "positive" | "negative",
  full = false,
): Effect {
  return (team) => {
    const change = (full ? setFullQuality : shiftQuality)(
      team.defenseQualities,
      positive,
      negative,
      toward,
    );
    team.defenseQualities = change.qualities;
    return change.note;
  };
}

// `next` maps the current position on the profile scale to the new one.
function offenseProfile(next: (index: number) => number): Effect {
  return (team) => {
    const index = OFFENSE_ORDER.indexOf(team.offenseProfile);
    const target = OFFENSE_ORDER[Math.min(4, Math.max(0, next(index)))];
    if (target === team.offenseProfile) return null;
    const note = `Offense ${PROFILE_LABELS[team.offenseProfile]} to ${PROFILE_LABELS[target]}.`;
    team.offenseProfile = target;
    return note;
  };
}

function defenseProfile(next: (index: number) => number): Effect {
  return (team) => {
    const index = DEFENSE_ORDER.indexOf(team.defenseProfile);
    const target = DEFENSE_ORDER[Math.min(4, Math.max(0, next(index)))];
    if (target === team.defenseProfile) return null;
    const note =
      `Defense ${DEFENSE_PROFILE_LABELS[team.defenseProfile]} to ` +
      `${DEFENSE_PROFILE_LABELS[target]}.`;
    team.defenseProfile = target;
    return note;
  };
}

// `change` gives the new grade, or the same one for no effect.
function grade(
  which: "frontOfficeGrade" | "headCoachGrade",
  when: (team: EventTeam) => boolean,
  change: (grade: Grade) => Grade,
): Effect {
  return (team) => {
    if (!when(team)) return null;
    const next = change(team[which]);
    if (next === team[which]) return null;
    const name = which === "frontOfficeGrade" ? "Front Office Grade" : "Head Coach Grade";
    const note = `${name} ${team[which]} to ${next}.`;
    team[which] = next;
    return note;
  };
}

const always = () => true;
const frontOfficeAtLeast = (best: Grade) => (team: EventTeam) =>
  GRADES.indexOf(team.frontOfficeGrade) <= GRADES.indexOf(best);

// Sets one of the four special teams slots; `next` returns null for no change.
function special(
  slot: keyof SpecialTeams,
  next: (current: string | null) => string | null,
  label: string,
): Effect {
  return (team) => {
    const target = next(team.special[slot]);
    if (target === null) return null;
    (team.special as Record<string, string | null>)[slot] = target;
    return `${label} ${target.replace("ELECTRIC_SEMI", "ELECTRIC•")}.`;
  };
}

const electric = (slot: "kickReturn" | "puntReturn", label: string) =>
  special(slot, (current) => (current === "ELECTRIC" ? null : "ELECTRIC"), label);

const stepRanges = (steps: number): Effect =>
  all(
    special("fgRange", (current) => (current ? stepRange(current, steps) : null), "FG range now"),
    special("xpRange", (current) => (current ? stepRange(current, steps) : null), "XP range now"),
  );

const hotSeat: Effect = (team) => {
  if (team.hotSeat) return null;
  team.hotSeat = true;
  return "Head Coach is on the Hot Seat.";
};

const becomesSelfish: Effect = (team) => {
  if (team.ownershipLoyalty === "SELFISH") return null;
  team.ownershipLoyalty = "SELFISH";
  return "Ownership is now SELFISH.";
};

const loseEfficient: Effect = (team) => {
  if (!team.offenseQualities.some((each) => each.quality === "EFFICIENT")) return null;
  team.offenseQualities = team.offenseQualities.filter((each) => each.quality !== "EFFICIENT");
  return "Loses EFFICIENT.";
};

// 1-6: DISCIPLINED for both sides with a Head Coach of B or better, otherwise
// UNDISCIPLINED for both.
const disciplineByCoach: Effect = (team) => {
  const toward = GRADES.indexOf(team.headCoachGrade) <= 1 ? "positive" : "negative";
  return all(
    offenseQuality("DISCIPLINED", "UNDISCIPLINED", toward, true),
    defenseQuality("DISCIPLINED", "UNDISCIPLINED", toward, true),
  )(team);
};

const ownershipIs =
  (...names: (OwnershipStyle | OwnershipLoyalty)[]) =>
  (team: EventTeam) =>
    names.some((name) => name === team.ownershipStyle || name === team.ownershipLoyalty);

// What each Table U result does, by roll.
const EFFECTS: Record<string, Effect> = {
  "11": defenseQuality("PUNISHING", "MILD", "negative"),
  "12": offenseProfile((index) => index + 1),
  "13": offenseProfile((index) => (index > 1 ? 1 : index - 1)),
  "14": defenseQuality("PUNISHING", "MILD", "positive"),
  "15": offenseQuality("SOLID", "POROUS", "positive"),
  "16": disciplineByCoach,
  "21": stepRanges(2),
  "22": defenseQuality("AGGRESSIVE", "MEEK", "positive"),
  "23": defenseQuality("STIFF", "SOFT", "negative"),
  "24": electric("puntReturn", "Punt return is now ELECTRIC"),
  "25": grade("headCoachGrade", frontOfficeAtLeast("B"), (value) => moveGrade(value, 1)),
  "26": defenseQuality("ACTIVE", "PASSIVE", "negative"),
  "31": all(
    offenseProfile((index) => Math.min(index, 2)),
    offenseQuality("DYNAMIC", "ERRATIC", "negative"),
  ),
  "32": defenseProfile((index) => index + 1),
  "33": all(
    offenseProfile((index) => Math.max(index, 3)),
    offenseQuality("RELIABLE", "SHAKY", "negative", true),
  ),
  "34": grade("frontOfficeGrade", ownershipIs("SELFISH", "MEDDLING"), (value) =>
    moveGrade(value, -1),
  ),
  "35": offenseQuality("SECURE", "CLUMSY", "positive"),
  "36": grade(
    "headCoachGrade",
    (team) => GRADES.indexOf(team.frontOfficeGrade) >= 2,
    (value) =>
      GRADES.indexOf(value) >= 3 ? value : GRADES[Math.min(3, GRADES.indexOf(value) + 2)],
  ),
  "41": offenseQuality("SECURE", "CLUMSY", "negative"),
  "42": grade("frontOfficeGrade", always, (value) => moveGrade(value, 1)),
  "43": defenseQuality("AGGRESSIVE", "MEEK", "negative"),
  "44": defenseQuality("ACTIVE", "PASSIVE", "positive"),
  "45": grade("headCoachGrade", always, (value) =>
    GRADES.indexOf(value) <= 1 ? value : moveGrade(value, 1),
  ),
  "46": becomesSelfish,
  "51": hotSeat,
  "52": offenseQuality("RELIABLE", "SHAKY", "positive"),
  "53": all(
    offenseProfile((index) => Math.min(index, 2)),
    offenseQuality("DYNAMIC", "ERRATIC", "negative"),
  ),
  "54": grade("frontOfficeGrade", ownershipIs("LOYAL", "SAVVY"), (value) => moveGrade(value, 1)),
  "55": offenseProfile((index) => index + 2),
  "56": loseEfficient,
  "61": all(
    special("xpRange", (current) => (current === "11-55" ? null : "11-55"), "XP range now"),
    special("fgRange", (current) => (current === "11-44" ? null : "11-44"), "FG range now"),
  ),
  "62": offenseQuality("RELIABLE", "SHAKY", "positive"),
  "63": defenseQuality("STIFF", "SOFT", "positive"),
  "64": all(
    electric("kickReturn", "Kick return is now ELECTRIC"),
    electric("puntReturn", "Punt return is now ELECTRIC"),
  ),
  "65": offenseQuality("SOLID", "POROUS", "negative"),
  "66": offenseQuality("EFFICIENT", "INEFFICIENT", "positive"),
};

// Applies one Table U result to a team; null when nothing applies.
export function applyEvent(team: EventTeam, key: string): string | null {
  return EFFECTS[key](team);
}

function copyTeams(teams: EventTeam[]): EventTeam[] {
  return teams.map((team) => ({
    ...team,
    offenseQualities: [...team.offenseQualities],
    defenseQualities: [...team.defenseQualities],
    special: { ...team.special },
  }));
}

// Step 8: one third of the teams, rounded up, chosen at random, each roll on
// Table U in draft order. Returns the teams after the events.
export function runEvents(
  teams: EventTeam[],
  rng: Rng,
): { teams: EventTeam[]; log: CampLogEntry[] } {
  const next = copyTeams(teams);
  const log: CampLogEntry[] = [];
  const count = Math.ceil(next.length / 3);
  const chosen = shuffle(
    next.map((_, index) => index),
    rng,
  )
    .slice(0, count)
    .sort((a, b) => a - b);
  log.push({
    step: "camp-events",
    franchiseId: null,
    message: `${count} of ${next.length} teams roll on Table U.`,
  });

  for (const index of chosen) {
    const team = next[index];
    const tens = rollD6(rng);
    const ones = rollD6(rng);
    const key = `${tens}${ones}`;
    const note = applyEvent(team, key);
    log.push({
      step: "camp-events",
      franchiseId: team.franchiseId,
      message: `${team.teamName}: roll ${tens}-${ones}. ${TABLE_U[key]} ${note ?? "No effect."}`,
    });
  }
  for (const team of next) {
    team.offenseQualities = inPairOrder(team.offenseQualities);
    team.defenseQualities = inDefensePairOrder(team.defenseQualities);
  }
  return { teams: next, log };
}

// Step 9: each team with SELFISH ownership rolls 2d6 in draft order. Two 1s sell
// the team (ownership is rolled again as at league creation); two 6s announce a
// move after the upcoming season.
export function runSaleOrMove(
  teams: EventTeam[],
  rng: Rng,
): { teams: EventTeam[]; log: CampLogEntry[] } {
  const next = copyTeams(teams);
  const log: CampLogEntry[] = [];
  const say = (team: EventTeam, message: string) =>
    log.push({
      step: "camp-sale-move",
      franchiseId: team.franchiseId,
      message,
    });

  for (const team of next) {
    if (team.ownershipLoyalty !== "SELFISH") continue;
    const first = rollD6(rng);
    const second = rollD6(rng);
    const roll = `${first}-${second}`;
    if (first === 1 && second === 1) {
      const styleRoll = rollD6(rng);
      const loyaltyRoll = rollD6(rng);
      team.ownershipStyle = ownershipStyleFor(styleRoll);
      team.ownershipLoyalty = ownershipLoyaltyFor(loyaltyRoll);
      say(
        team,
        `${team.teamName}: roll ${roll}. Ownership is selling the team! New owner: style roll ` +
          `${styleRoll}, ${team.ownershipStyle ?? "no quality"}. Loyalty roll ${loyaltyRoll}, ` +
          `${team.ownershipLoyalty ?? "no quality"}.`,
      );
    } else if (first === 6 && second === 6) {
      team.pendingMove = true;
      say(
        team,
        `${team.teamName}: roll ${roll}. Ownership announces a move to a new location after ` +
          `the upcoming season.`,
      );
    } else {
      say(team, `${team.teamName}: roll ${roll}. No event.`);
    }
  }
  if (log.length === 0) {
    log.push({
      step: "camp-sale-move",
      franchiseId: null,
      message: "No team has SELFISH ownership.",
    });
  }
  return { teams: next, log };
}
