import { expect, test, type Page } from "@playwright/test";

// Specs share one database and run in parallel, so every league name is unique.
function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// Base Franchise Points by front office grade, then head coach grade.
const BASE_POINTS: Record<string, Record<string, string>> = {
  A: { A: "4", B: "3", C: "2", D: "1" },
  B: { A: "3", B: "2", C: "1", D: "0" },
  C: { A: "2", B: "1", C: "0", D: "0" },
  D: { A: "1", B: "0", C: "0", D: "0" },
};

async function createLeague(page: Page, label: string): Promise<void> {
  const name = uniqueName(label);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("8");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

// The text of every body cell of the management table, row by row.
async function managementRows(page: Page): Promise<string[][]> {
  const table = page.getByRole("table", { name: /management$/ });
  // The league streams in after navigation; wait for it before reading.
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  return rows.evaluateAll((elements) =>
    elements.map((row) => Array.from(row.children, (cell) => cell.textContent ?? "")),
  );
}

// The text of every body cell of a table found by the end of its name, row by
// row.
async function tableRows(page: Page, name: RegExp): Promise<string[][]> {
  const table = page.getByRole("table", { name });
  await expect(table).toBeVisible();
  return table
    .locator("tbody tr")
    .evaluateAll((elements) =>
      elements.map((row) => Array.from(row.children, (cell) => cell.textContent ?? "")),
    );
}

// The profile is the first entry of a Qualities cell when the team has one, and
// the rest are its qualities ("None" when there are none). A team with no
// profile is called AVERAGE here, which the app itself never shows.
const PROFILE_NAMES = ["PROLIFIC", "DULL", "STAUNCH", "INEPT"];
function splitProfile([team, cell]: string[]): string[] {
  const entries = cell === "None" ? [] : cell.split(", ");
  const profile = entries.length > 0 && PROFILE_NAMES.includes(entries[0].replace("•", ""));
  return [
    team,
    profile ? entries[0] : "AVERAGE",
    entries.slice(profile ? 1 : 0).join(", ") || "None",
  ];
}

async function sideRows(page: Page, name: RegExp): Promise<string[][]> {
  return (await tableRows(page, name)).map(splitProfile);
}

function offenseRows(page: Page): Promise<string[][]> {
  return sideRows(page, /offense$/);
}

const DEFENSE_PAIRS = [
  ["STIFF", "SOFT"],
  ["PUNISHING", "MILD"],
  ["AGGRESSIVE", "MEEK"],
  ["ACTIVE", "PASSIVE"],
  ["DISCIPLINED", "UNDISCIPLINED"],
];

const PAIRS = [
  ["DYNAMIC", "ERRATIC"],
  ["SOLID", "POROUS"],
  ["RELIABLE", "SHAKY"],
  ["SECURE", "CLUMSY"],
  ["DISCIPLINED", "UNDISCIPLINED"],
  ["EFFICIENT", "INEFFICIENT"],
];

// A generated 8-team league, on its page as a draft.
async function createDraft(page: Page, label: string): Promise<void> {
  await createLeague(page, label);
  await page.getByRole("button", { name: "Generate league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();
}

// The whole generation log, one string per step. Reads collapsed steps too.
function logText(page: Page): Promise<string[]> {
  return page.getByRole("main").locator("details").allTextContents();
}

test("offers generation on a new league and shows no results yet", async ({ page }) => {
  await createLeague(page, "Fresh League");

  await expect(page.getByRole("heading", { level: 2, name: "Generate league" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate league" })).toBeEnabled();
  await expect(page.getByRole("heading", { level: 2, name: "Management" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Generation log" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: /management$/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Offense" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: /offense$/ })).toHaveCount(0);
  for (const name of ["Defense", "Special teams"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toHaveCount(0);
  }
  await expect(page.getByRole("table", { name: /(defense|special teams)$/ })).toHaveCount(0);
});

test("drafts a defense and special teams for every team", async ({ page }) => {
  await createLeague(page, "Defended League");
  await page.getByRole("button", { name: "Generate league" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Defense" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Special teams" })).toBeVisible();
  await expect(
    page.getByRole("table", { name: /defense$/ }).getByRole("columnheader"),
  ).toHaveText(["Team", "Qualities"]);
  await expect(
    page.getByRole("table", { name: /special teams$/ }).getByRole("columnheader"),
  ).toHaveText(["Team", "Kick return", "Punt return", "FG", "XP"]);

  const teams = (await managementRows(page)).map(([team]) => team);
  const defense = await sideRows(page, /defense$/);
  expect(defense.map(([team]) => team)).toEqual(teams);

  const profiles = defense.map(([, profile]) => profile);
  for (const profile of profiles) {
    expect(["STAUNCH", "STAUNCH•", "AVERAGE", "INEPT•", "INEPT"]).toContain(profile);
  }
  const holding = (profile: string) => profiles.filter((held) => held === profile).length;
  expect(holding("STAUNCH")).toBe(1);
  expect(holding("STAUNCH•")).toBe(1);
  expect(holding("INEPT")).toBeLessThanOrEqual(1);
  expect(holding("INEPT•")).toBeLessThanOrEqual(1);

  for (const [team, , listed] of defense) {
    if (listed === "None") continue;
    // One quality per pair at most, listed in card order.
    const pairs = listed.split(", ").map((label) => {
      const name = label.replace("•", "");
      return DEFENSE_PAIRS.findIndex((pair) => pair.includes(name));
    });
    expect(pairs, `${team}: ${listed}`).not.toContain(-1);
    expect(pairs, `${team}: ${listed}`).toEqual([...new Set(pairs)].sort((a, b) => a - b));
  }

  const special = await tableRows(page, /special teams$/);
  expect(special.map(([team]) => team)).toEqual(teams);
  for (const [team, kickReturn, puntReturn, fg, xp] of special) {
    expect(["ELECTRIC", "ELECTRIC•", "None"], team).toContain(kickReturn);
    expect(["ELECTRIC", "ELECTRIC•", "None"], team).toContain(puntReturn);
    expect(fg, team).toMatch(/^11-(4[56]|5[1-6]|6[1-5])$/);
    // "Season 1" is not a year, so the league kicks XP from the 2-yard line.
    expect(xp, team).toMatch(/^11-6[3-6]$/);
  }

  await page.reload();
  expect(await sideRows(page, /defense$/)).toEqual(defense);
  expect(await tableRows(page, /special teams$/)).toEqual(special);
});

test("drafts an offense for every team by the rulebook's counts", async ({ page }) => {
  await createLeague(page, "Drafted League");
  await page.getByRole("button", { name: "Generate league" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Offense" })).toBeVisible();
  await expect(
    page.getByRole("table", { name: /offense$/ }).getByRole("columnheader"),
  ).toHaveText(["Team", "Qualities"]);

  const rows = await offenseRows(page);
  const teams = (await managementRows(page)).map(([team]) => team);
  expect(rows.map(([team]) => team)).toEqual(teams);

  const profiles = rows.map(([, profile]) => profile);
  for (const profile of profiles) {
    expect(["PROLIFIC", "PROLIFIC•", "AVERAGE", "DULL•", "DULL"]).toContain(profile);
  }
  const holding = (profile: string) => profiles.filter((held) => held === profile).length;
  expect(holding("PROLIFIC")).toBe(1);
  expect(holding("PROLIFIC•")).toBe(1);
  expect(holding("DULL")).toBeLessThanOrEqual(1);
  expect(holding("DULL•")).toBeLessThanOrEqual(1);

  for (const [team, , listed] of rows) {
    // With 8 teams every team ends up with an efficiency quality.
    expect(listed, team).toMatch(/(^|, )(EFFICIENT|INEFFICIENT)•?$/);
    // One quality per pair at most, listed in card order.
    const pairs = listed.split(", ").map((label) => {
      const name = label.replace("•", "");
      return PAIRS.findIndex((pair) => pair.includes(name));
    });
    expect(pairs, `${team}: ${listed}`).not.toContain(-1);
    expect(pairs, `${team}: ${listed}`).toEqual([...new Set(pairs)].sort((a, b) => a - b));
  }

  await page.reload();
  expect(await offenseRows(page)).toEqual(rows);
});

test("generates management values that follow the rulebook tables", async ({ page }) => {
  await createLeague(page, "Generated League");
  const cities = await page
    .getByRole("textbox", { name: / city$/ })
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

  await page.getByRole("button", { name: "Generate league" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Management" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate league" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Generate league" })).toHaveCount(0);
  await expect(
    page.getByRole("table", { name: /management$/ }).getByRole("columnheader"),
  ).toHaveText(["Team", "Ownership", "Front office", "Head coach", "Base FP"]);

  const rows = await managementRows(page);
  expect(rows).toHaveLength(8);
  for (const [index, [team, ownership, frontOffice, headCoach, points]] of rows.entries()) {
    expect(team.startsWith(`${cities[index]} `)).toBe(true);
    expect(ownership).toMatch(/^(None|MEDDLING|SAVVY|SELFISH|LOYAL|(MEDDLING|SAVVY), (SELFISH|LOYAL))$/);
    expect(frontOffice).toMatch(/^[ABCD]$/);
    expect(headCoach).toMatch(/^[ABCD]$/);
    expect(points).toBe(BASE_POINTS[frontOffice][headCoach]);
  }

  await page.reload();
  expect(await managementRows(page)).toEqual(rows);
  await expect(page.getByRole("button", { name: "Generate league" })).toHaveCount(0);
});

test("keeps a log of every roll, grouped by step", async ({ page }) => {
  await createLeague(page, "Logged League");
  await page.getByRole("button", { name: "Generate league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Generation log" })).toBeVisible();

  const steps = page.getByRole("main").locator("details");
  await expect(steps.locator("summary")).toHaveText([
    "Step 3: Ownership",
    "Step 4: Front office grade",
    "Step 6: Head coach grade",
    "Step 7: Franchise Points",
    "Step 8: QV and CDV",
    "Step 9: Offense profile",
    "Step 10: Remaining offense qualities",
    "Step 11: EFFICIENT and INEFFICIENT",
    "Step 12: Defense profile",
    "Step 13: Remaining defense qualities",
    "Step 14: Special teams",
  ]);

  const rows = await managementRows(page);
  for (let step = 0; step < 4; step++) {
    await expect(steps.nth(step).getByRole("listitem")).toBeHidden();
    await steps.nth(step).locator("summary").click();
    await expect(steps.nth(step).getByRole("listitem")).toHaveCount(8);
  }

  // The last step restates what the management table shows for each team.
  const pointsLines = await steps.nth(3).getByRole("listitem").allTextContents();
  expect(pointsLines).toEqual(
    rows.map(
      ([team, , frontOffice, headCoach, points]) =>
        `${team}: Front Office ${frontOffice} and Head Coach ${headCoach}, ${points} FP.`,
    ),
  );
  await expect(steps.nth(4).getByRole("listitem")).toBeHidden();
  await steps.nth(4).locator("summary").click();
  await expect(steps.nth(4).getByRole("listitem")).toHaveText(["8 teams: QV 2, CDV 1."]);

  // The draft log names the team each profile in the offense table went to.
  await steps.nth(5).locator("summary").click();
  const draftLines = await steps.nth(5).getByRole("listitem").allTextContents();
  for (const [team, profile] of await offenseRows(page)) {
    if (profile === "AVERAGE") continue;
    expect(
      draftLines.some((line) => line.includes(`${profile}: drew ${team}. Roll `)),
      `${team} ${profile}`,
    ).toBe(true);
  }
  await steps.nth(7).locator("summary").click();
  await expect(steps.nth(7).getByRole("listitem").filter({ hasText: "receives" })).toHaveCount(8);

  // Step 14 logs four first rolls per team, and the last word on each kick is
  // what the special teams table shows.
  await steps.nth(10).locator("summary").click();
  const kickLines = await steps.nth(10).getByRole("listitem").allTextContents();
  expect(kickLines.filter((line) => / roll [1-6]-[1-6], /.test(line) && !line.includes("Spends")))
    .toHaveLength(32);
  for (const [team, , , fg] of await tableRows(page, /special teams$/)) {
    const mine = kickLines.filter((line) => line.startsWith(`${team}: `) && line.includes(" FG "));
    expect(mine.some((line) => line.includes(`, ${fg}`)), `${team} FG ${fg}`).toBe(true);
  }

  const coachLines = await steps.nth(2).getByRole("listitem").allTextContents();
  for (const [index, line] of coachLines.entries()) {
    expect(line).toMatch(/, roll [1-6]-[1-6]\./);
    expect(line.endsWith(`Head Coach Grade ${rows[index][3]}.`)).toBe(true);
  }
});

test("keeps the log's team names after a team is renamed", async ({ page }) => {
  await createLeague(page, "Renamed League");
  await page.getByRole("button", { name: "Generate league" }).click();
  const table = page.getByRole("table", { name: /management$/ });
  await expect(table).toBeVisible();
  const original = (await managementRows(page))[0][0];

  const city = page.getByRole("textbox", { name: / city$/ }).first();
  await city.fill("Renamed Town");
  await city.blur();

  await expect(table.getByRole("rowheader").first()).toContainText("Renamed Town");
  const firstLine = page.getByRole("main").locator("details").first().getByRole("listitem").first();
  await page.getByRole("main").locator("details summary").first().click();
  await expect(firstLine).toContainText(`${original}: style roll`);
});

test("shows why generation failed and lets the user try again", async ({ page, context }) => {
  await createLeague(page, "Vanished League");

  // Deleting the league in another tab makes generation here fail.
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole("button", { name: "Delete league" }).click();
  await other.getByRole("button", { name: "Delete permanently" }).click();
  await expect(other).toHaveURL(/\/$/);
  await other.close();

  const button = page.getByRole("button", { name: "Generate league" });
  await button.click();

  // Scoped to main: Next.js adds its own route announcer with the alert role.
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "That league could not be found.",
  );
  await expect(button).toBeEnabled();
  await expect(page.getByRole("heading", { level: 2, name: "Management" })).toHaveCount(0);
});

test("shows a generated league as a draft and re-rolls it in full", async ({ page }) => {
  await createDraft(page, "Rerolled League");

  await expect(page.getByRole("heading", { level: 2, name: "Generate league" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Accept league" })).toBeEnabled();
  const before = await logText(page);
  expect(before).toHaveLength(11);

  await page.getByRole("button", { name: "Re-roll league" }).click();

  await expect.poll(() => logText(page)).not.toEqual(before);
  await expect(page.getByRole("button", { name: "Re-roll league" })).toBeEnabled();
  const after = await logText(page);
  expect(after).toHaveLength(11);
  for (const name of [/management$/, /offense$/, /defense$/, /special teams$/]) {
    expect(await tableRows(page, name)).toHaveLength(8);
  }
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();

  // The re-roll replaced the draft: a reload shows the new one.
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();
  expect(await logText(page)).toEqual(after);
});

test("keeps focus on Re-roll league after a keyboard re-roll", async ({ page }) => {
  await createDraft(page, "Focused Reroll");
  const before = await logText(page);
  const button = page.getByRole("button", { name: "Re-roll league" });

  await button.focus();
  await button.press("Enter");

  await expect.poll(() => logText(page)).not.toEqual(before);
  // The label reads "Re-rolling..." while it runs, so wait for it to come back.
  await expect(button).toBeEnabled();
  await expect(button).toBeFocused();
});

test("ignores a second Re-roll league press while the first is running", async ({ page }) => {
  await createDraft(page, "Busy Reroll");

  // Hold every request back until released, and count them.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/leagues/*", async (route) => {
    if (route.request().method() === "POST") {
      requests += 1;
      await held;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Re-roll league" }).click();
  const running = page.getByRole("button", { name: "Re-rolling..." });
  await expect(running).toHaveAttribute("aria-disabled", "true");
  // Playwright's own click waits for an aria-disabled button, so press it directly.
  await running.evaluate((button: HTMLButtonElement) => button.click());
  expect(requests).toBe(1);

  release();
  await expect(page.getByRole("button", { name: "Re-roll league" })).toBeEnabled();
  expect(requests).toBe(1);
});

test("re-rolls a renamed team under its new name", async ({ page }) => {
  await createDraft(page, "Renamed Draft");
  const city = page.getByRole("textbox", { name: / city$/ }).first();
  await city.fill("Rerolled Town");
  await city.blur();
  await expect(
    page.getByRole("table", { name: /management$/ }).getByRole("rowheader").first(),
  ).toContainText("Rerolled Town");
  const firstLine = page.getByRole("main").locator("details").first().getByRole("listitem").first();
  await page.getByRole("main").locator("details summary").first().click();
  await expect(firstLine).not.toContainText("Rerolled Town");

  await page.getByRole("button", { name: "Re-roll league" }).click();

  await expect(firstLine).toContainText(/^Rerolled Town .+: style roll/);
});

test("keeps the league a draft when accepting is cancelled", async ({ page }) => {
  await createDraft(page, "Undecided League");

  await page.getByRole("button", { name: "Accept league" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /^Accept Undecided League .+\?$/ })).toBeVisible();
  await expect(dialog).toContainText("The league can no longer be re-rolled.");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Accept league" })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-roll league" })).toBeEnabled();
});

test("accepts a draft as the official season", async ({ page }) => {
  await createDraft(page, "Official League");
  const management = await managementRows(page);
  const log = await logText(page);

  await page.getByRole("button", { name: "Accept league" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Its results can no longer be re-rolled.");
  // An accepted league opens on the summary; the detailed sections are one click away.
  await page
    .getByRole("navigation", { name: "Teams view" })
    .getByRole("link", { name: "Detailed" })
    .click();

  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Generate league" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Re-roll league|Accept league|Generate league/ })).toHaveCount(0);
  expect(await managementRows(page)).toEqual(management);
  expect(await logText(page)).toEqual(log);

  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Re-roll league|Accept league/ })).toHaveCount(0);

  // Identity stays editable after a season is accepted.
  const city = page.getByRole("textbox", { name: / city$/ }).first();
  await city.fill("Official Town");
  await city.blur();
  await expect(
    page.getByRole("table", { name: /management$/ }).getByRole("rowheader").first(),
  ).toContainText("Official Town");
});

test("keeps focus on the accept button while it runs and ignores a second press", async ({
  page,
}) => {
  await createDraft(page, "Busy Accept");

  // Hold every request back until released, and count them.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/leagues/*", async (route) => {
    if (route.request().method() === "POST") {
      requests += 1;
      await held;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Accept league" }).click();
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Accept league" })).toBeFocused();
  await page.keyboard.press("Enter");

  // The label reads "Accepting..." while it runs.
  const running = dialog.getByRole("button", { name: "Accepting..." });
  await expect(running).toHaveAttribute("aria-disabled", "true");
  await expect(running).toBeFocused();
  // Playwright's own click waits for an aria-disabled button, so press it directly.
  await running.evaluate((button: HTMLButtonElement) => button.click());
  expect(requests).toBe(1);

  release();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
  expect(requests).toBe(1);
});

test("refuses to re-roll a league accepted in another tab", async ({ page, context }) => {
  await createDraft(page, "Stale League");
  const log = await logText(page);

  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole("button", { name: "Accept league" }).click();
  await other.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();
  await expect(other.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
  await other.close();

  await page.getByRole("button", { name: "Re-roll league" }).click();

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "This league has been accepted and can no longer be re-rolled.",
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Teams view" })
    .getByRole("link", { name: "Detailed" })
    .click();
  await expect(page.getByRole("heading", { level: 2, name: "Generation log" })).toBeVisible();
  expect(await logText(page)).toEqual(log);
});

test("shows a refused accept in the dialog and clears it when reopened", async ({
  page,
  context,
}) => {
  await createDraft(page, "Twice Accepted League");

  // Accepting in another tab makes the accept here a refusal.
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole("button", { name: "Accept league" }).click();
  await other.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();
  await expect(other.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
  await other.close();

  await page.getByRole("button", { name: "Accept league" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Accept league" });
  await confirm.click();

  // Scoped to the dialog: Next.js adds its own route announcer with the alert role.
  await expect(dialog.getByRole("alert")).toHaveText("This league has already been accepted.");
  await expect(dialog).toBeVisible();
  await expect(confirm).toBeEnabled();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Accept league" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});
