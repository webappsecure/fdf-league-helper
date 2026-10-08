// What Table C (offense) and Table D (defense) have in common: qualities with
// a strength, rows keyed by a 2d6 roll, and footnotes that send qualities to
// one more team.

export type Strength = "FULL" | "SEMI";
export type Quality<Name extends string = string> = { quality: Name; strength: Strength };

export function qualityLabel({ quality, strength }: Quality): string {
  return strength === "SEMI" ? `${quality}•` : quality;
}

// Positive then negative.
export type Pair<Name extends string = string> = readonly [Name, Name];

export function pairIndexIn(pairs: readonly Pair[], quality: string): number {
  return pairs.findIndex((pair) => pair.includes(quality));
}

export function inPairOrderOf<Name extends string>(
  pairs: readonly Pair[],
  qualities: Quality<Name>[],
): Quality<Name>[] {
  return [...qualities].sort(
    (a, b) => pairIndexIn(pairs, a.quality) - pairIndexIn(pairs, b.quality),
  );
}

export type Footnote = "a" | "b" | "c" | "d" | "e" | "f";
export type ProfileRow<Name extends string = string> = {
  qualities: Quality<Name>[];
  footnote?: Footnote;
};

// Writes a row the way the rulebook prints it: qualities separated by spaces,
// a trailing bullet for SEMI.
export function row<Name extends string>(text: string, footnote?: Footnote): ProfileRow<Name> {
  const qualities = text
    .split(" ")
    .filter(Boolean)
    .map((word): Quality<Name> => {
      const semi = word.endsWith("•");
      return {
        quality: (semi ? word.slice(0, -1) : word) as Name,
        strength: semi ? "SEMI" : "FULL",
      };
    });
  return footnote ? { qualities, footnote } : { qualities };
}
