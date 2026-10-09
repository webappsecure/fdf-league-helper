import { expect, test, type Page } from "@playwright/test";

// Specs share one database and run in parallel, so every league name is unique.
function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// Creates, generates and accepts an 8-team league and returns its page URL.
async function acceptedLeague(page: Page, label: string): Promise<string> {
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
  return page.url();
}

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
    .getByRole("radio", { name: / league champion$/ })
    .nth(7)
    .check();
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(page.getByRole("status")).toHaveText("Results saved.");
}

async function openOffseason(page: Page, leagueUrl: string): Promise<void> {
  await page.goto(`${leagueUrl}/offseason`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Expansion and contraction" }),
  ).toBeVisible();
}

test("asks for results first, then runs, re-rolls and discards the off-season", async ({
  page,
}) => {
  const url = await acceptedLeague(page, "Offseason Run");
  await openOffseason(page, url);

  // No results yet: the error shows beside the button.
  const start = page.getByRole("button", { name: "Start off-season" });
  await start.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter the season results first." }),
  ).toBeVisible();

  await page.goto(url);
  await enterResults(page);
  await openOffseason(page, url);
  await page.getByRole("button", { name: "Start off-season" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Off-season" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: /^Off-season draft for / }),
  ).toBeVisible();
  const table = page.getByRole("table", { name: "Off-season draft teams" });
  await expect(table.getByRole("row")).toHaveCount(9);
  await expect(page.getByText("Step 6: Ownership impact")).toBeVisible();
  await expect(page.getByText("Step 7: Annual draft and free agency, offense")).toBeVisible();
  await expect(page.getByText("Step 8: Annual draft and free agency, defense")).toBeVisible();
  const profiles = page.getByRole("table", {
    name: "Off-season draft offense and defense profiles",
  });
  await expect(profiles.getByRole("row")).toHaveCount(9);
  await expect(profiles.getByRole("columnheader")).toHaveText([
    "Team",
    "Offense",
    "Offense qualities",
    "Defense",
    "Defense qualities",
  ]);
  const before = await table.innerText();
  const profilesBefore = await profiles.innerText();

  // The draft survives a reload.
  await page.reload();
  await expect(table.getByRole("row")).toHaveCount(9);
  expect(await table.innerText()).toBe(before);
  expect(await profiles.innerText()).toBe(profilesBefore);

  // Re-roll keeps one draft of eight teams.
  await page.getByRole("button", { name: "Re-roll off-season" }).click();
  await expect(table.getByRole("row")).toHaveCount(9);
  await expect(profiles.getByRole("row")).toHaveCount(9);
  await expect(page.getByText("Step 7: Annual draft and free agency, offense")).toBeVisible();

  // The season stays as it was and the draft does not appear on the league page.
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();

  // Results are locked while the draft exists.
  await page.goto(`${url}/results`);
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Discard the off-season to change the results." }),
  ).toBeVisible();

  // Discard asks first, then makes the plan editable again.
  await page.goto(`${url}/offseason`);
  await page.getByRole("button", { name: "Discard off-season" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(table).toBeVisible();
  await page.getByRole("button", { name: "Discard off-season" }).click();
  await dialog.getByRole("button", { name: "Discard off-season" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Expansion and contraction" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add expansion team" })).toBeVisible();
});

test("applies an expansion team and a contraction to the draft", async ({ page }) => {
  const url = await acceptedLeague(page, "Offseason Plan Applied");
  await enterResults(page);
  await openOffseason(page, url);

  await page.getByRole("button", { name: "Add expansion team" }).click();
  await expect(page.getByRole("status")).toHaveText("Planned teams: 9 (8 now, 1 new, 0 leaving)");
  await page
    .getByRole("button", { name: /^Remove .* from league$/ })
    .first()
    .click();
  await expect(page.getByRole("status")).toHaveText("Planned teams: 8 (8 now, 1 new, 1 leaving)");

  await page.getByRole("button", { name: "Start off-season" }).click();
  const table = page.getByRole("table", { name: "Off-season draft teams" });
  await expect(table.getByRole("row")).toHaveCount(9);
  await expect(table.getByText("New", { exact: true })).toHaveCount(1);

  // The plan is locked: its page shows the draft, not the plan controls.
  await expect(page.getByRole("button", { name: "Add expansion team" })).toHaveCount(0);
});
