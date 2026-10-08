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

test("offers generation on a new league and shows no results yet", async ({ page }) => {
  await createLeague(page, "Fresh League");

  await expect(page.getByRole("heading", { level: 2, name: "Generate league" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate league" })).toBeEnabled();
  await expect(page.getByRole("heading", { level: 2, name: "Management" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Generation log" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: /management$/ })).toHaveCount(0);
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
