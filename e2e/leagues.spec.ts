import { expect, test, type Page } from "@playwright/test";

// Specs share one database and run in parallel, so every league name is unique.
function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function createPlainLeague(page: Page, name: string): Promise<void> {
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("8");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("creates a league with conferences and divisions", async ({ page }) => {
  const name = uniqueName("Conference League");
  await page.goto("/leagues/new");

  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Season label").fill("2016");
  await page.getByLabel("Number of teams").fill("16");
  await page.getByLabel("Conferences with divisions").check();

  for (const [index, conferenceName] of ["American", "National"].entries()) {
    await page.getByRole("button", { name: "Add conference" }).click();
    await page.getByLabel("Conference name").nth(index).fill(conferenceName);
    const conference = page.locator(`[id="field-conferences.${index}.divisions"]`);
    await conference.getByRole("button", { name: "Add division" }).click();
    await conference.getByLabel("Division name").nth(0).fill("East");
    await conference.getByLabel("Teams").nth(0).fill("4");
    await conference.getByLabel("Division name").nth(1).fill("West");
    await conference.getByLabel("Teams").nth(1).fill("4");
  }
  await expect(page.getByText("16 of 16 teams assigned to divisions.")).toBeVisible();

  await page.getByRole("button", { name: "Create league" }).click();

  await expect(page).toHaveURL(/\/leagues\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main).toContainText("2016");
  await expect(main).toContainText("15-yard line");
  for (const conferenceName of ["American", "National"]) {
    await expect(page.getByRole("heading", { level: 3, name: conferenceName })).toBeVisible();
  }
  await expect(page.getByRole("table", { name: "East teams" })).toHaveCount(2);
  await expect(page.getByRole("table", { name: "West teams" })).toHaveCount(2);
  await expect(page.getByText("4 teams")).toHaveCount(4);

  await page.getByRole("link", { name: "All leagues" }).click();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("2016");
  await expect(row).toContainText("16");
});

test("shows validation errors and keeps the entered values", async ({ page }) => {
  await page.goto("/leagues/new");

  await page.getByLabel("League name").fill("Too Small League");
  await page.getByLabel("Number of teams").fill("7");
  await page.getByRole("button", { name: "Create league" }).click();

  // Scoped to main: Next.js adds its own route announcer with the alert role.
  const summary = page.getByRole("main").getByRole("alert");
  await expect(summary).toContainText("Number of teams must be a whole number from 8 to 56.");
  await expect(summary).toBeFocused();
  await expect(page.getByLabel("Number of teams")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("League name")).toHaveValue("Too Small League");
  await expect(page.getByLabel("Number of teams")).toHaveValue("7");

  await page.getByLabel("Number of teams").fill("12");
  await page.getByLabel("Divisions", { exact: true }).check();
  await page.getByRole("button", { name: "Add division" }).click();
  await page.getByLabel("Division name").fill("East");
  await page.getByLabel("Teams", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Create league" }).click();

  await expect(summary).toContainText(
    "Division teams add up to 5, but the league has 12 teams.",
  );
  await expect(summary).not.toContainText("Number of teams must be");
  await expect(page.getByLabel("Division name")).toHaveValue("East");
  await expect(page).toHaveURL(/\/leagues\/new$/);
});

test("drops division errors when a row is removed, and keeps the others", async ({ page }) => {
  await page.goto("/leagues/new");
  await page.getByLabel("Number of teams").fill("8");
  await page.getByLabel("Divisions", { exact: true }).check();
  await page.getByRole("button", { name: "Add division" }).click();
  await page.getByRole("button", { name: "Add division" }).click();
  await page.getByLabel("Teams", { exact: true }).nth(0).fill("4");
  await page.getByLabel("Division name").nth(1).fill("West");
  await page.getByLabel("Teams", { exact: true }).nth(1).fill("4");
  await page.getByRole("button", { name: "Create league" }).click();

  const summary = page.getByRole("main").getByRole("alert");
  await expect(summary.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByLabel("Division name").nth(0)).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[id="error-divisions.0.name"]')).toBeVisible();

  await page.getByRole("button", { name: "Remove division 1" }).click();

  // The row that was second is now first. It was never in error.
  await expect(page.getByLabel("Division name")).toHaveValue("West");
  await expect(page.getByLabel("Division name")).toHaveAttribute("aria-invalid", "false");
  await expect(page.locator('[id="error-divisions.0.name"]')).toHaveCount(0);
  await expect(summary.getByRole("listitem")).toHaveText(["League name is required."]);
  await expect(page.getByLabel("League name")).toHaveAttribute("aria-invalid", "true");
});

test("keeps the chosen radio options after a failed submit", async ({ page }) => {
  await page.goto("/leagues/new");

  await page.getByLabel("15-yard line").check();
  await page.getByLabel("Divisions", { exact: true }).check();
  await page.getByRole("button", { name: "Create league" }).click();

  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "League name is required.",
  );
  await expect(page.getByLabel("15-yard line")).toBeChecked();
  await expect(page.getByLabel("Divisions", { exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: "Add division" })).toBeVisible();
});

test("XP kick distance follows the season label until chosen by hand", async ({ page }) => {
  await page.goto("/leagues/new");
  const twoYard = page.getByLabel("2-yard line");
  const fifteenYard = page.getByLabel("15-yard line");

  await expect(twoYard).toBeChecked();

  await page.getByLabel("Season label").fill("2016");
  await expect(fifteenYard).toBeChecked();

  await page.getByLabel("Season label").fill("2014");
  await expect(twoYard).toBeChecked();

  await fifteenYard.check();
  await page.getByLabel("Season label").fill("Season 1");
  await expect(fifteenYard).toBeChecked();
});

test("shows not found for unknown and malformed league ids", async ({ page }) => {
  for (const path of ["/leagues/999999", "/leagues/abc"]) {
    await page.goto(path);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  }
});

test("deletes a league only after confirmation", async ({ page }) => {
  const name = uniqueName("Doomed League");
  await createPlainLeague(page, name);
  const leagueUrl = page.url();
  await expect(page.getByRole("main")).toContainText(
    "8 teams with no conferences or divisions.",
  );

  await page.getByRole("button", { name: "Delete league" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`Delete ${name}?`);
  await expect(dialog).toContainText("permanently removes the league and everything in it");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Delete league" })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await page.getByRole("button", { name: "Delete league" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Leagues" })).toBeVisible();
  await expect(page.getByRole("link", { name })).toHaveCount(0);
  await page.goto(leagueUrl);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});
