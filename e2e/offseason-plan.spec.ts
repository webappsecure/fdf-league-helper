import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";
import { TEST_DB } from "./test-db";

// Specs share one database and run in parallel, so every league name is unique.
function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function createDraft(page: Page, label: string, teams = 8): Promise<string> {
  const name = uniqueName(label);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill(String(teams));
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await page.getByRole("button", { name: "Generate league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();
  return page.url();
}

async function accept(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Accept league" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
}

async function openPlan(page: Page, teams = 8): Promise<string> {
  const url = await createDraft(page, "Offseason Plan", teams);
  await accept(page);
  await page.getByRole("link", { name: "Plan expansion and contraction" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Expansion and contraction" }),
  ).toBeVisible();
  return url;
}

const status = (page: Page) => page.getByRole("status");
const rows = (page: Page) => page.getByRole("row");

test("adds, re-rolls and removes an expansion team and keeps the plan after a reload", async ({
  page,
}) => {
  await openPlan(page);
  await expect(status(page)).toHaveText("Planned teams: 8 (8 now, 0 new, 0 leaving)");

  await page.getByRole("button", { name: "Add expansion team" }).click();
  await expect(status(page)).toHaveText("Planned teams: 9 (8 now, 1 new, 0 leaving)");
  const planned = rows(page).filter({ hasText: "(New)" });
  await expect(planned).toHaveCount(1);
  await expect(planned).toContainText(/Front office [A-F], head coach [A-F]/);
  const before = await planned.innerText();

  await page.reload();
  await expect(rows(page).filter({ hasText: "(New)" })).toHaveCount(1);

  await rows(page)
    .filter({ hasText: "(New)" })
    .getByRole("button", { name: /^Re-roll / })
    .click();
  await expect(rows(page).filter({ hasText: "(New)" })).not.toHaveText(before);
  await expect(rows(page).filter({ hasText: "(New)" })).toHaveCount(1);

  await rows(page)
    .filter({ hasText: "(New)" })
    .getByRole("button", { name: /from plan$/ })
    .click();
  await expect(rows(page).filter({ hasText: "(New)" })).toHaveCount(0);
  await expect(status(page)).toHaveText("Planned teams: 8 (8 now, 0 new, 0 leaving)");
});

test("marks and unmarks a team for contraction", async ({ page }) => {
  await openPlan(page, 10);
  await page
    .getByRole("button", { name: /^Remove .* from league$/ })
    .first()
    .click();
  await expect(status(page)).toHaveText("Planned teams: 9 (10 now, 0 new, 1 leaving)");
  await expect(page.getByText("Leaving the league")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Leaving the league")).toBeVisible();
  await page.getByRole("button", { name: /^Keep .* in league$/ }).click();
  await expect(status(page)).toHaveText("Planned teams: 10 (10 now, 0 new, 0 leaving)");
  await expect(page.getByText("Leaving the league")).toHaveCount(0);
});

test("shows a refused change beside its button and keeps the plan", async ({ page }) => {
  await openPlan(page);
  const remove = page.getByRole("button", { name: /^Remove .* from league$/ }).first();
  await remove.click();
  await expect(page.getByText("A league needs at least 8 teams.")).toBeVisible();
  await expect(remove).toHaveAttribute("aria-describedby", /.+/);
  await expect(page.getByText("Leaving the league")).toHaveCount(0);
  await expect(status(page)).toHaveText("Planned teams: 8 (8 now, 0 new, 0 leaving)");
});

test("plans, re-rolls and cancels a pending move", async ({ page }) => {
  const url = await openPlan(page);
  const leagueId = Number(new URL(url).pathname.split("/").pop());
  const db = new DatabaseSync(TEST_DB);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.prepare(
      `UPDATE team_season SET pending_move = 1
       WHERE id = (SELECT MIN(id) FROM team_season
                   WHERE season_id IN (SELECT id FROM season WHERE league_id = ?))`,
    ).run(leagueId);
  } finally {
    db.close();
  }

  await page.reload();
  await expect(page.getByText("Franchise move pending")).toBeVisible();
  await page.getByRole("button", { name: /^Plan move for / }).click();
  const moving = page.getByText(/^Moving to /);
  await expect(moving).toBeVisible();
  const first = await moving.innerText();

  await page.reload();
  await expect(moving).toHaveText(first);
  await page.getByRole("button", { name: /^Re-roll new city for / }).click();
  await expect(moving).not.toHaveText(first);

  await page.getByRole("button", { name: /^Cancel move for / }).click();
  await expect(page.getByText(/Moving to |Franchise move pending/)).toHaveCount(0);
});

test("asks to accept a league that is not accepted", async ({ page }) => {
  const url = await createDraft(page, "Offseason Not Accepted");
  await page.goto(`${url}/offseason`);
  await expect(page.getByText("Accept this league first.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add expansion team" })).toHaveCount(0);
});
