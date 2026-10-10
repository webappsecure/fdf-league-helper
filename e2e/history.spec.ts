import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";
import { TEST_DB } from "./test-db";

// Specs share one database and run in parallel, so every league name is unique.
function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// Creates, generates and accepts an 8-team league in two divisions, and returns
// its name and page URL.
async function acceptedLeague(page: Page, label: string): Promise<{ name: string; url: string }> {
  const name = uniqueName(label);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("8");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await page.getByRole("button", { name: "Generate league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();
  await page.getByRole("button", { name: "Accept league" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
  return { name, url: page.url() };
}

// Team i wins i games; the last two make the playoffs and the last is champion.
async function enterResults(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Enter end-of-season results" }).click();
  for (let index = 0; index < 8; index++) {
    await page
      .getByRole("textbox", { name: / wins$/ })
      .nth(index)
      .fill(String(index));
    await page
      .getByRole("textbox", { name: / losses$/ })
      .nth(index)
      .fill("10");
  }
  await page
    .getByRole("checkbox", { name: / made playoffs$/ })
    .nth(6)
    .check();
  await page
    .getByRole("checkbox", { name: / made playoffs$/ })
    .nth(7)
    .check();
  await page
    .getByRole("radio", { name: / league champion$/ })
    .nth(7)
    .check();
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(page.getByRole("status")).toHaveText("Results saved.");
}

async function startAndAcceptOffseason(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/offseason`);
  await page.getByRole("button", { name: "Add expansion team" }).click();
  await expect(page.getByRole("status")).toHaveText("Planned teams: 9 (8 now, 1 new, 0 leaving)");
  await page.getByRole("button", { name: "Start off-season" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: /^Off-season draft for / }),
  ).toBeVisible();
}

async function acceptOffseason(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Accept off-season" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept off-season" }).click();
  await expect(page.getByRole("status")).toHaveText("Planned teams: 9 (9 now, 0 new, 0 leaving)");
}

test("browses an earlier season after the league moved on", async ({ page }) => {
  const { name, url } = await acceptedLeague(page, "History League");

  // One season: no link from the league page, and the draft season stays hidden.
  await expect(page.getByRole("link", { name: "Season history" })).toHaveCount(0);

  await enterResults(page);
  await page.goto(url);
  await page.getByRole("link", { name: "View team cards" }).click();
  await expect(page.getByRole("article", { name: / card$/ })).toHaveCount(8);
  const firstNames = await page
    .getByRole("article", { name: / card$/ })
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label") ?? ""));
  expect(firstNames).toHaveLength(8);

  await startAndAcceptOffseason(page, url);
  await page.goto(`${url}/seasons/2`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await page.goto(`${url}/offseason`);
  await acceptOffseason(page);

  await page.goto(url);
  await page.getByRole("link", { name: "Season history" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `${name} season history` }),
  ).toBeVisible();
  const seasons = page.getByRole("list", { name: "Seasons" }).getByRole("listitem");
  await expect(seasons).toHaveText(["Season 2 (season 2, current)", "Season 1 (season 1)"]);

  // Season 1 as it was: label, results, champion, teams and generation log.
  await page.getByRole("link", { name: "Season 1" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${name}, Season 1` })).toBeVisible();
  const results = page.getByRole("table", { name: `${name} results` });
  await expect(results.getByRole("row")).toHaveCount(9);
  await expect(results.getByRole("cell", { name: "Champion", exact: true })).toHaveCount(1);
  await expect(results.getByRole("cell", { name: "Playoffs", exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: "Generation log" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Off-season log" })).toHaveCount(0);

  // Nothing here can be changed.
  await expect(page.getByRole("link", { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);

  // Its cards are the ones printed in season 1, with the printable sheets.
  await page.getByRole("link", { name: "View team cards" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${name} team cards` })).toBeVisible();
  await expect(page.getByRole("article", { name: / card$/ })).toHaveCount(8);
  const pastNames = await page
    .getByRole("article", { name: / card$/ })
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label") ?? ""));
  expect(pastNames.sort()).toEqual([...firstNames].sort());
  await expect(page.getByRole("button", { name: "Print cards" })).toBeVisible();
  await expect(page.locator('ul[aria-label^="Sheet "]')).toHaveCount(2);

  // Season 2 shows the off-season log and no results.
  await page.goto(`${url}/seasons/2`);
  await expect(page.getByRole("heading", { level: 1, name: `${name}, Season 2` })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Off-season log" })).toBeVisible();
  await expect(page.getByText("No results were entered for this season.")).toBeVisible();
  await expect(page.getByText("Not entered")).toBeVisible();
});

test("shows not found for a season that does not exist", async ({ page }) => {
  const { url } = await acceptedLeague(page, "History Missing");
  for (const path of ["/seasons/2", "/seasons/0", "/seasons/abc", "/seasons/2/cards"]) {
    await page.goto(`${url}${path}`);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  }
  await page.goto(`${url}/seasons/1`);
  await expect(page.getByRole("heading", { level: 2, name: "Results" })).toBeVisible();
});

test("prints a saved special result on the cards of a later season", async ({ page }) => {
  const { url } = await acceptedLeague(page, "History Specials");
  await enterResults(page);
  await startAndAcceptOffseason(page, url);
  await acceptOffseason(page);

  const leagueId = Number(new URL(url).pathname.split("/").pop());
  const db = new DatabaseSync(TEST_DB);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.prepare(
      `UPDATE team_season SET offense_special_result = 'Saved offense result'
       WHERE id = (SELECT MIN(team_season.id) FROM team_season
                   JOIN season ON season.id = team_season.season_id
                   WHERE season.league_id = ? AND season.sequence = 2)`,
    ).run(leagueId);
  } finally {
    db.close();
  }

  for (const path of ["/cards", "/seasons/2/cards"]) {
    await page.goto(`${url}${path}`);
    await expect(page.getByRole("article", { name: / card$/ })).toHaveCount(9);
    // Once on the screen card and once on its print sheet copy.
    await expect(page.getByText("Saved offense result")).toHaveCount(2);
  }
});
