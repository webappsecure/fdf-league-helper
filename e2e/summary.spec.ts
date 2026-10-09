import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";
import { TEST_DB } from "./test-db";

// Specs share one database and run in parallel, so every league name is unique.
function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function createLeague(page: Page, label: string): Promise<string> {
  const name = uniqueName(label);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("8");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url();
}

async function createDraft(page: Page, label: string): Promise<string> {
  const url = await createLeague(page, label);
  await page.getByRole("button", { name: "Generate league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();
  return url;
}

async function accept(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Accept league" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
}

const panels = (page: Page) =>
  page.getByRole("list", { name: /team summaries$/ }).getByRole("listitem");
const toggle = (page: Page) => page.getByRole("navigation", { name: "Teams view" });
const detailTables = (page: Page) => page.getByRole("table", { name: /management$/ });

test("opens a draft on the detailed view and an accepted league on the summary", async ({
  page,
}) => {
  const url = await createDraft(page, "Default Views");
  await expect(detailTables(page)).toBeVisible();
  await expect(panels(page)).toHaveCount(0);
  await expect(toggle(page).getByRole("link", { name: "Detailed" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await accept(page);
  await expect(panels(page)).toHaveCount(8);
  await expect(detailTables(page)).toHaveCount(0);

  await page.goto(url);
  await expect(panels(page)).toHaveCount(8);
  await expect(toggle(page).getByRole("link", { name: "Summary" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("toggles between the views both ways and carries the view in the URL", async ({ page }) => {
  await createDraft(page, "Toggled");
  await accept(page);
  await expect(panels(page)).toHaveCount(8);

  await toggle(page).getByRole("link", { name: "Detailed" }).click();
  await expect(page).toHaveURL(/\?view=detail$/);
  await expect(detailTables(page)).toBeVisible();
  await expect(toggle(page).getByRole("link", { name: "Detailed" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(toggle(page).getByRole("link", { name: "Summary" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  await toggle(page).getByRole("link", { name: "Summary" }).click();
  await expect(page).toHaveURL(/\?view=summary$/);
  await expect(panels(page)).toHaveCount(8);
});

test("honors the view parameter and falls back to the default for other values", async ({
  page,
}) => {
  const url = await createDraft(page, "Parameter");

  await page.goto(`${url}?view=summary`);
  await expect(panels(page)).toHaveCount(8);

  await page.goto(`${url}?view=bogus`);
  await expect(detailTables(page)).toBeVisible();
  await expect(panels(page)).toHaveCount(0);
});

test("has no toggle for a league that is not generated and ignores the parameter", async ({
  page,
}) => {
  const url = await createLeague(page, "Not Generated");
  await page.goto(`${url}?view=summary`);
  await expect(page.getByRole("heading", { level: 2, name: "Generate league" })).toBeVisible();
  await expect(toggle(page)).toHaveCount(0);
  await expect(panels(page)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: / city$/ }).first()).toBeVisible();
});

test("shows in each panel what the detailed sections show for the team", async ({ page }) => {
  const url = await createDraft(page, "Matching");
  await accept(page);

  const summary = (await panels(page).allInnerTexts()).map((text) =>
    text.replace(/\s+/g, " ").trim(),
  );

  await page.goto(`${url}?view=detail`);
  const cells = async (name: RegExp) => {
    const table = page.getByRole("table", { name });
    await expect(table).toBeVisible();
    const rows = table.locator("tbody tr");
    return Promise.all(
      (await rows.all()).map(async (row) => ({
        team: (await row.getByRole("rowheader").innerText()).trim(),
        cells: await row.getByRole("cell").allInnerTexts(),
      })),
    );
  };
  const management = await cells(/management$/);
  const offense = await cells(/offense$/);
  const defense = await cells(/defense$/);
  const special = await cells(/special teams$/);

  expect(summary).toHaveLength(management.length);
  for (const [index, row] of management.entries()) {
    const text = summary[index];
    const [ownership, frontOffice, headCoach, base] = row.cells.map((c) => c.trim());
    expect(text).toContain(row.team);
    expect(text).toContain(`Ownership ${ownership}`);
    expect(text).toContain(
      `Front office ${frontOffice} Head coach grade ${headCoach} Base FP ${base}`,
    );
    const lines = (cells: string[]) => {
      const [profile, qualities] = cells.map((c) => c.trim());
      return [profile, ...(qualities === "None" ? [] : qualities.split(", "))].join(" ");
    };
    expect(text).toContain(`Offense ${lines(offense[index].cells)}`);
    expect(text).toContain(`Defense ${lines(defense[index].cells)}`);
    const [kr, pr, fg, xp] = special[index].cells.map((c) => c.trim());
    expect(text).toContain(`Kick return ${kr} Punt return ${pr} FG range ${fg} XP range ${xp}`);
  }
});

test("is read only, has no run log, and links each team to the detailed view", async ({ page }) => {
  await createDraft(page, "Read Only");
  await accept(page);

  await expect(page.getByRole("heading", { level: 2, name: "Generation log" })).toHaveCount(0);
  await expect(page.getByRole("main").locator("details")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: / city$/ })).toHaveCount(0);

  const first = panels(page).first();
  const name = await first.getByRole("heading", { level: 3 }).innerText();
  await first.getByRole("link", { name: `Edit ${name} in the detailed view` }).click();
  await expect(page).toHaveURL(/\?view=detail$/);
  await expect(page.getByRole("heading", { level: 2, name: "Generation log" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: / city$/ }).first()).toBeVisible();
});

test("shows a city edited in the detailed view in the summary", async ({ page }) => {
  const url = await createDraft(page, "Edited");
  await accept(page);

  await page.goto(`${url}?view=detail`);
  const city = page.getByRole("textbox", { name: / city$/ }).first();
  await city.fill("Summaryville");
  await city.blur();
  await expect(
    page
      .getByRole("table", { name: /management$/ })
      .getByRole("rowheader")
      .first(),
  ).toContainText("Summaryville");

  await toggle(page).getByRole("link", { name: "Summary" }).click();
  await expect(panels(page).first()).toContainText("Summaryville");
});

test("keeps the league-level actions in both views", async ({ page }) => {
  const url = await createDraft(page, "League Level");

  for (const view of ["summary", "detail"]) {
    await page.goto(`${url}?view=${view}`);
    await expect(page.getByRole("button", { name: "Re-roll league" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept league" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View team cards" })).toBeVisible();
  }

  await accept(page);
  await expect(page.getByRole("link", { name: "View team cards" })).toBeVisible();
  await page.goto(`${url}?view=detail`);
  await expect(page.getByRole("link", { name: "View team cards" })).toBeVisible();
});

test("titles a panel one level under its conference heading", async ({ page }) => {
  const name = uniqueName("Conference Panels");
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("8");
  await page.getByLabel("Conferences with divisions").check();
  for (const [index, conferenceName] of ["American", "National"].entries()) {
    await page.getByRole("button", { name: "Add conference" }).click();
    await page.getByLabel("Conference name").nth(index).fill(conferenceName);
    const conference = page.locator(`[id="field-conferences.${index}.divisions"]`);
    await conference.getByRole("button", { name: "Add division" }).click();
    await conference.getByLabel("Division name").nth(0).fill("East");
    await conference.getByLabel("Teams").nth(0).fill("2");
    await conference.getByLabel("Division name").nth(1).fill("West");
    await conference.getByLabel("Teams").nth(1).fill("2");
  }
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await page.getByRole("button", { name: "Generate league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();

  await page.goto(`${page.url()}?view=summary`);
  await expect(page.getByRole("heading", { level: 3, name: "American" })).toBeVisible();
  await expect(panels(page)).toHaveCount(8);
  await expect(page.getByRole("heading", { level: 4 })).toHaveCount(8);
});

test("says Not drafted for the parts a league generated before the drafts lacks", async ({
  page,
}) => {
  const url = await createDraft(page, "Undrafted Panels");
  await accept(page);

  // Clearing these columns gives the state of a league generated before those
  // drafts.
  const leagueId = Number(new URL(url).pathname.split("/").pop());
  const db = new DatabaseSync(TEST_DB);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.prepare(
      `UPDATE team_season SET offense_profile = NULL, offense_qualities = NULL,
         defense_profile = NULL, defense_qualities = NULL, kick_return = NULL,
         punt_return = NULL, fg_range = NULL, xp_range = NULL
       WHERE season_id IN (SELECT id FROM season WHERE league_id = ?)`,
    ).run(leagueId);
  } finally {
    db.close();
  }

  await page.goto(`${url}?view=summary`);
  const panel = panels(page).first();
  for (const label of ["Offense", "Defense", "Kick return", "Punt return", "FG range", "XP range"]) {
    await expect(panel.locator(`dt:text-is("${label}") + dd`)).toHaveText("Not drafted");
  }
  // The management rolls are still there.
  await expect(panel.locator('dt:text-is("Base FP") + dd')).not.toHaveText("Not drafted");
});
