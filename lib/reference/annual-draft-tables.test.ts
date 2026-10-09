import { describe, expect, it } from "vitest";
import { ASCENDING_KEYS } from "@/lib/dice";
import {
  DEFENSE_RANK,
  OFFENSE_RANK,
  TABLE_G_SEASON,
  TABLE_J,
  TABLE_L,
  type ProfileMove,
} from "@/lib/reference/annual-draft-tables";

describe("Table J and Table L", () => {
  it("have 21 rows in each of five columns", () => {
    for (const table of [TABLE_J, TABLE_L]) {
      expect(Object.keys(table)).toHaveLength(5);
      for (const column of Object.values(table)) {
        expect(Object.keys(column)).toEqual(ASCENDING_KEYS);
      }
    }
  });

  it("only ever produce a profile of their own side", () => {
    for (const column of Object.values(TABLE_J)) {
      for (const move of Object.values(column)) expect(OFFENSE_RANK).toContain(move.to);
    }
    for (const column of Object.values(TABLE_L)) {
      for (const move of Object.values(column)) expect(DEFENSE_RANK).toContain(move.to);
    }
  });

  it("carry a special result on exactly the printed rows", () => {
    const specials = (table: Record<string, Record<string, ProfileMove<string>>>) =>
      Object.entries(table).flatMap(([column, rows]) =>
        Object.entries(rows)
          .filter(([, move]) => move.special)
          .map(([key, move]) => `${column} ${key} ${move.special}`),
      );
    expect(specials(TABLE_J)).toEqual(["PROLIFIC 6-6 *", "DULL 1-3 **"]);
    expect(specials(TABLE_L)).toEqual(["STAUNCH 6-6 *", "INEPT 1-3 **"]);
  });

  it("match the printed rows checked against pages 20 and 22", () => {
    const j = (column: keyof typeof TABLE_J, key: string) => TABLE_J[column][key].to;
    expect(j("PROLIFIC", "1-1")).toBe("DULL");
    expect(j("PROLIFIC", "2-2")).toBe("DULL_SEMI");
    expect(j("PROLIFIC", "2-5")).toBe("PROLIFIC_SEMI");
    expect(j("PROLIFIC", "3-6")).toBe("PROLIFIC");
    expect(j("PROLIFIC_SEMI", "4-4")).toBe("DULL_SEMI");
    expect(j("PROLIFIC_SEMI", "5-5")).toBe("AVERAGE");
    expect(j("AVERAGE", "1-3")).toBe("DULL_SEMI");
    expect(j("AVERAGE", "5-5")).toBe("PROLIFIC_SEMI");
    expect(j("AVERAGE", "6-6")).toBe("PROLIFIC");
    expect(j("DULL_SEMI", "1-3")).toBe("DULL");
    expect(j("DULL_SEMI", "2-4")).toBe("AVERAGE");
    expect(j("DULL_SEMI", "5-6")).toBe("PROLIFIC_SEMI");
    expect(j("DULL", "1-1")).toBe("DULL_SEMI");
    expect(j("DULL", "1-2")).toBe("DULL");
    expect(j("DULL", "2-2")).toBe("AVERAGE");
    expect(j("DULL", "3-4")).toBe("DULL_SEMI");
    expect(j("DULL", "5-5")).toBe("PROLIFIC_SEMI");

    const l = (column: keyof typeof TABLE_L, key: string) => TABLE_L[column][key].to;
    expect(l("STAUNCH", "1-1")).toBe("INEPT");
    expect(l("STAUNCH", "2-2")).toBe("INEPT_SEMI");
    expect(l("STAUNCH_SEMI", "4-4")).toBe("INEPT_SEMI");
    expect(l("AVERAGE", "1-2")).toBe("INEPT_SEMI");
    expect(l("AVERAGE", "1-3")).toBe("INEPT");
    expect(l("AVERAGE", "4-6")).toBe("STAUNCH_SEMI");
    expect(l("AVERAGE", "5-6")).toBe("STAUNCH");
    expect(l("INEPT_SEMI", "1-3")).toBe("INEPT");
    expect(l("INEPT_SEMI", "5-6")).toBe("STAUNCH_SEMI");
    expect(l("INEPT_SEMI", "6-6")).toBe("STAUNCH");
    expect(l("INEPT", "1-2")).toBe("INEPT");
    expect(l("INEPT", "3-4")).toBe("INEPT_SEMI");
    expect(l("INEPT", "5-5")).toBe("STAUNCH_SEMI");
  });
});

describe("Table G season progression columns", () => {
  it("have six results per column, printed on page 19", () => {
    for (const results of Object.values(TABLE_G_SEASON)) expect(results).toHaveLength(6);
    expect(TABLE_G_SEASON.PROLIFIC_OFFENSE[4]).toBe("Rolls 1-2-3 & 1-2-5 are automatic TD PASS");
    expect(TABLE_G_SEASON.PROLIFIC_OFFENSE[5]).toBe(
      "Rolls 1-2-3, 1-2-5, & 3-4-5 are automatic TD PASS",
    );
    expect(TABLE_G_SEASON.DULL_OFFENSE[1]).toBe("Rolls 3-6-6, 4-4-6, & 5-5-6 are automatic PUNT");
    expect(TABLE_G_SEASON.DULL_OFFENSE[2]).toBe("Rolls 4-4-6 & 5-5-6 are automatic PUNT");
    expect(TABLE_G_SEASON.STAUNCH_DEFENSE[3]).toBe("Rolls 4-4-6 & 5-5-6 are automatic PUNT");
    expect(TABLE_G_SEASON.STAUNCH_DEFENSE[4]).toBe(
      "Rolls 3-6-6, 4-4-6, & 5-5-6 are automatic PUNT",
    );
    expect(TABLE_G_SEASON.INEPT_DEFENSE[0]).toBe(
      "Rolls 1-2-3, 1-2-5, & 3-4-5 are automatic TD PASS",
    );
    expect(TABLE_G_SEASON.INEPT_DEFENSE[1]).toBe("Rolls 1-2-3 & 1-2-5 are automatic TD PASS");
    expect(TABLE_G_SEASON.INEPT_DEFENSE[5]).toBe("Roll 1-2-3 is automatic TD PASS");
  });
});
