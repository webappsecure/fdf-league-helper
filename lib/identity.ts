import { rollD100, type Rng } from "@/lib/dice";
import { CITIES } from "@/lib/reference/cities";
import { COACH_FIRST_NAMES, COACH_LAST_NAMES } from "@/lib/reference/coach-names";
import { NICKNAME_TABLES } from "@/lib/reference/nicknames";
import { PALETTE } from "@/lib/reference/palette";

export type Identity = {
  city: string;
  nickname: string;
  headCoachName: string;
  primaryColor: string;
  secondaryColor: string;
};

export const TEXT_FIELDS = ["city", "nickname", "headCoachName"] as const;
export const EDIT_FIELDS = [
  ...TEXT_FIELDS,
  "primaryColor",
  "secondaryColor",
  "offenseTag",
] as const;
export const REROLL_FIELDS = [...TEXT_FIELDS, "colors"] as const;

export type TextField = (typeof TEXT_FIELDS)[number];
export type EditField = (typeof EDIT_FIELDS)[number];
export type RerollField = (typeof REROLL_FIELDS)[number];

// Printed on the OFFENSE bar as [R+]. A team has at most one, set by hand.
export const OFFENSE_TAGS = ["R", "R+", "P", "P+"] as const;
export type OffenseTag = (typeof OFFENSE_TAGS)[number];

export type CellResult = { success: true } | { success: false; error: string };

export const IDENTITY_TEXT_MAX = 50;

// A league edited into holding every value in a table would otherwise loop
// forever looking for an unused one.
const MAX_ATTEMPTS = 1000;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function rollUntilUnused(roll: () => string, taken: string[]): string {
  const used = new Set(taken.map(normalize));
  let result = roll();
  for (let attempt = 1; attempt < MAX_ATTEMPTS && used.has(normalize(result)); attempt++) {
    result = roll();
  }
  return result;
}

// A weighted pick among the cities nobody holds, walking the list in source
// order. Falls back to the whole list if every city is taken.
export function pickCity(taken: string[], rng: Rng): string {
  const used = new Set(taken.map(normalize));
  const unused = CITIES.filter((city) => !used.has(normalize(city.name)));
  const candidates = unused.length > 0 ? unused : CITIES;
  const totalWeight = candidates.reduce((total, city) => total + city.weight, 0);

  let remaining = Math.floor(rng() * totalWeight);
  for (const city of candidates) {
    if (remaining < city.weight) return city.name;
    remaining -= city.weight;
  }
  return candidates[candidates.length - 1].name;
}

export function rollNickname(taken: string[], rng: Rng): string {
  return rollUntilUnused(() => {
    const table = NICKNAME_TABLES[Math.floor(rng() * NICKNAME_TABLES.length)];
    return table[rollD100(rng) - 1];
  }, taken);
}

export function rollCoachName(taken: string[], rng: Rng): string {
  return rollUntilUnused(
    () => `${COACH_FIRST_NAMES[rollD100(rng) - 1]} ${COACH_LAST_NAMES[rollD100(rng) - 1]}`,
    taken,
  );
}

type ColorPair = Pick<Identity, "primaryColor" | "secondaryColor">;

function pairKey(pair: ColorPair): string {
  return `${normalize(pair.primaryColor)}/${normalize(pair.secondaryColor)}`;
}

export function rollColors(taken: ColorPair[], rng: Rng): ColorPair {
  const roll = (): ColorPair => {
    const primary = Math.floor(rng() * PALETTE.length);
    // One fewer choice, skipping over the primary, so the two always differ.
    const offset = Math.floor(rng() * (PALETTE.length - 1));
    const secondary = offset >= primary ? offset + 1 : offset;
    return { primaryColor: PALETTE[primary].hex, secondaryColor: PALETTE[secondary].hex };
  };

  const used = new Set(taken.map(pairKey));
  let result = roll();
  for (let attempt = 1; attempt < MAX_ATTEMPTS && used.has(pairKey(result)); attempt++) {
    result = roll();
  }
  return result;
}

export function generateIdentities(count: number, rng: Rng): Identity[] {
  const identities: Identity[] = [];
  for (let index = 0; index < count; index++) {
    identities.push({
      city: pickCity(
        identities.map((identity) => identity.city),
        rng,
      ),
      nickname: rollNickname(
        identities.map((identity) => identity.nickname),
        rng,
      ),
      headCoachName: rollCoachName(
        identities.map((identity) => identity.headCoachName),
        rng,
      ),
      ...rollColors(identities, rng),
    });
  }
  return identities;
}

// A new value for one field of one team. It avoids what the league's other
// teams hold and the value being replaced.
export function rerollField(
  field: RerollField,
  current: Identity,
  others: Identity[],
  rng: Rng,
): Partial<Identity> {
  const held = [current, ...others];
  switch (field) {
    case "city":
      return {
        city: pickCity(
          held.map((identity) => identity.city),
          rng,
        ),
      };
    case "nickname":
      return {
        nickname: rollNickname(
          held.map((identity) => identity.nickname),
          rng,
        ),
      };
    case "headCoachName":
      return {
        headCoachName: rollCoachName(
          held.map((identity) => identity.headCoachName),
          rng,
        ),
      };
    case "colors":
      return rollColors(held, rng);
  }
}

export function isRerollField(field: unknown): field is RerollField {
  return REROLL_FIELDS.includes(field as RerollField);
}

const REQUIRED_MESSAGES: Record<TextField, string> = {
  city: "Enter a city.",
  nickname: "Enter a nickname.",
  headCoachName: "Enter a head coach name.",
};

export type FieldValidation =
  // A null value clears the offense tag.
  | { ok: true; field: EditField; value: string | null }
  | { ok: false; error: string };

export function validateTeamField(field: unknown, value: unknown): FieldValidation {
  if (!EDIT_FIELDS.includes(field as EditField)) {
    return { ok: false, error: "That team could not be found." };
  }
  const editField = field as EditField;
  const text = typeof value === "string" ? value.trim() : "";

  if (editField === "offenseTag") {
    const chosen = OFFENSE_TAGS.find((tag) => tag === text);
    if (typeof value !== "string" || (text !== "" && !chosen)) {
      return { ok: false, error: "Choose an offense tag." };
    }
    return { ok: true, field: editField, value: chosen ?? null };
  }

  if (editField === "primaryColor" || editField === "secondaryColor") {
    if (!/^#[0-9a-f]{6}$/i.test(text)) return { ok: false, error: "Choose a color." };
    return { ok: true, field: editField, value: text.toLowerCase() };
  }

  if (text.length === 0) return { ok: false, error: REQUIRED_MESSAGES[editField] };
  if (text.length > IDENTITY_TEXT_MAX) {
    return { ok: false, error: `Keep this to ${IDENTITY_TEXT_MAX} characters or fewer.` };
  }
  return { ok: true, field: editField, value: text };
}
