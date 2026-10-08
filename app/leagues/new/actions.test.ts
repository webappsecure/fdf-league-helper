import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@/lib/leagues", () => ({ createLeague: vi.fn() }));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createLeague } from "@/lib/leagues";
import { createLeagueAction } from "./actions";

function form(payload: unknown): FormData {
  const data = new FormData();
  data.set("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  return data;
}

const valid = {
  name: "Continental League",
  seasonLabel: "Season 1",
  xpKickDistance: 2,
  teamCount: 8,
  structure: { kind: "none" },
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("createLeagueAction", () => {
  it("rejects a payload that is not JSON without touching the database", async () => {
    const result = await createLeagueAction(null, form("{not json"));

    expect(result).toEqual({
      success: false,
      error: "The form could not be read. Reload the page and try again.",
    });
    expect(createLeague).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects a form with no payload", async () => {
    const result = await createLeagueAction(null, new FormData());

    expect(result?.success).toBe(false);
    expect(createLeague).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input and saves nothing", async () => {
    const result = await createLeagueAction(null, form({ ...valid, teamCount: 7 }));

    expect(result).toEqual({
      success: false,
      fieldErrors: [
        { field: "teamCount", message: "Number of teams must be a whole number from 8 to 56." },
      ],
    });
    expect(createLeague).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("hides a database failure behind a generic message and does not redirect", async () => {
    vi.mocked(createLeague).mockImplementation(() => {
      throw new Error("SQLITE_FULL: secret detail");
    });

    const result = await createLeagueAction(null, form(valid));

    expect(result).toEqual({
      success: false,
      error: "The league could not be saved. Nothing was created. Please try again.",
    });
    expect(JSON.stringify(result)).not.toContain("SQLITE_FULL");
    expect(console.error).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to the new league after a successful create", async () => {
    vi.mocked(createLeague).mockReturnValue(42);

    await createLeagueAction(null, form(valid));

    expect(createLeague).toHaveBeenCalledWith({}, valid);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(redirect).toHaveBeenCalledWith("/leagues/42");
  });
});
