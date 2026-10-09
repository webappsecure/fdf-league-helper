import { expect, test, type Page } from "@playwright/test";

// Specs share one database and run in parallel, so every league name is unique.
function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function createDraft(page: Page, label: string): Promise<string> {
  const name = uniqueName(label);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("8");
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

const wins = (page: Page) => page.getByRole("textbox", { name: / wins$/ });
const losses = (page: Page) => page.getByRole("textbox", { name: / losses$/ });
const playoffs = (page: Page) => page.getByRole("checkbox", { name: / made playoffs$/ });
const champions = (page: Page) => page.getByRole("radio", { name: / league champion$/ });

async function fillRecords(page: Page): Promise<void> {
  for (let index = 0; index < 8; index++) {
    await wins(page).nth(index).fill(String(index));
    await losses(page).nth(index).fill("10");
  }
}

test("saves results for an accepted league and shows them after a reload", async ({ page }) => {
  await createDraft(page, "Results Saved");
  await accept(page);
  await page.getByRole("link", { name: "Enter end-of-season results" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "End-of-season results" })).toBeVisible();
  await expect(champions(page)).toHaveCount(8);

  await fillRecords(page);
  await playoffs(page).nth(1).check();
  await champions(page).nth(0).check();
  // The champion is a playoff team and stays one.
  await expect(playoffs(page).nth(0)).toBeChecked();
  await expect(playoffs(page).nth(0)).toBeDisabled();
  await page.getByRole("textbox", { name: / ties$/ }).nth(2).fill("1");
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(page.getByRole("status")).toHaveText("Results saved.");

  await page.reload();
  await expect(wins(page).nth(5)).toHaveValue("5");
  await expect(losses(page).nth(5)).toHaveValue("10");
  await expect(page.getByRole("textbox", { name: / ties$/ }).nth(2)).toHaveValue("1");
  await expect(playoffs(page).nth(1)).toBeChecked();
  await expect(playoffs(page).nth(2)).not.toBeChecked();
  await expect(champions(page).nth(0)).toBeChecked();

  await page.getByRole("link", { name: "Back to the league" }).first().click();
  await expect(page.getByRole("link", { name: "Edit end-of-season results" })).toBeVisible();
});

test("shows an error beside a bad value, keeps what was typed and clears it on edit", async ({
  page,
}) => {
  await createDraft(page, "Results Errors");
  await accept(page);
  await page.getByRole("link", { name: "Enter end-of-season results" }).click();
  await fillRecords(page);
  await wins(page).nth(3).fill("abc");
  await champions(page).nth(0).check();
  await page.getByRole("button", { name: "Save results" }).click();

  const alert = page.locator("form").getByRole("alert");
  await expect(alert).toContainText("1 team needs attention");
  await expect(alert).toBeFocused();
  await expect(wins(page).nth(3)).toHaveValue("abc");
  await expect(wins(page).nth(3)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter wins as a whole number from 0 to 99.")).toBeVisible();

  await wins(page).nth(3).fill("3");
  await expect(wins(page).nth(3)).not.toHaveAttribute("aria-invalid", "true");
});

test("asks for a champion", async ({ page }) => {
  await createDraft(page, "Results Champion");
  await accept(page);
  await page.getByRole("link", { name: "Enter end-of-season results" }).click();
  await fillRecords(page);
  await page.getByRole("button", { name: "Save results" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Choose the league champion.",
  );
});

test("asks to accept a draft league before entering results", async ({ page }) => {
  const url = await createDraft(page, "Results Draft");
  await page.goto(`${url}/results`);
  await expect(page.getByText("Accept this league before entering results.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save results" })).toHaveCount(0);
});
