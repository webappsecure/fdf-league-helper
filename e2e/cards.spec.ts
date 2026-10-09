import { expect, test, type Locator, type Page } from "@playwright/test";

// Specs share one database and run in parallel, so every league name is unique.
function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function createLeague(page: Page, label: string, divisions = false): Promise<string> {
  const name = uniqueName(label);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("8");
  if (divisions) {
    await page.getByLabel("Divisions", { exact: true }).check();
    await page.getByRole("button", { name: "Add division" }).click();
    await page.getByRole("button", { name: "Add division" }).click();
    await page.getByLabel("Division name").nth(0).fill("Lakeshore");
    await page.getByLabel("Teams", { exact: true }).nth(0).fill("4");
    await page.getByLabel("Division name").nth(1).fill("Prairie");
    await page.getByLabel("Teams", { exact: true }).nth(1).fill("4");
  }
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return name;
}

async function generate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Generate league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();
}

// The text of every body cell of the tables whose names end this way, row by
// row across all of them.
async function tableRows(page: Page, name: RegExp): Promise<string[][]> {
  const tables = page.getByRole("table", { name });
  await expect(tables.first()).toBeVisible();
  return tables
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => Array.from(row.children, (cell) => cell.textContent ?? "")),
    );
}

function inputValues(page: Page, name: RegExp): Promise<string[]> {
  return page
    .getByRole("textbox", { name })
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

// A league page list such as "PROLIFIC" and "SOLID, RELIABLE•" as card lines.
function cardLines(profile: string, qualities: string): string[] {
  return [
    ...(profile === "AVERAGE" ? [] : [profile]),
    ...(qualities === "None" ? [] : qualities.split(", ")),
  ];
}

function cards(page: Page): Locator {
  return page.getByRole("article", { name: / card$/ });
}

test("offers no cards before a league is generated", async ({ page }) => {
  await createLeague(page, "Cardless League");

  await expect(page.getByRole("link", { name: "View team cards" })).toHaveCount(0);

  await page.goto(`${page.url()}/cards`);
  await expect(page.getByText("Generate this league to see its cards.")).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
});

test("shows a card for every team with that team's stored values", async ({ page }) => {
  const league = await createLeague(page, "Carded League");
  await generate(page);
  const cities = await inputValues(page, / city$/);
  const nicknames = await inputValues(page, / nickname$/);
  const coaches = await inputValues(page, / head coach name$/);
  const offense = await tableRows(page, /offense$/);
  const defense = await tableRows(page, /defense$/);
  const special = await tableRows(page, /special teams$/);
  expect(cities).toHaveLength(8);

  await page.getByRole("link", { name: "View team cards" }).click();

  await expect(page.getByRole("heading", { level: 1, name: `${league} team cards` })).toBeVisible();
  await expect(page.getByText("This league is a draft. Its cards may change.")).toBeVisible();
  await expect(cards(page)).toHaveCount(8);

  for (let index = 0; index < 8; index++) {
    const name = `${cities[index]} ${nicknames[index]}`;
    const card = page.getByRole("article", { name: `${name} card`, exact: true });
    await expect(card.locator("header p")).toHaveText([
      cities[index],
      `Head Coach: ${coaches[index]}`,
      nicknames[index],
      "Season 1",
    ]);
    await expect(card.getByRole("region", { name: "Offense" }).getByRole("listitem")).toHaveText(
      cardLines(offense[index][1], offense[index][2]),
    );
    await expect(card.getByRole("region", { name: "Defense" }).getByRole("listitem")).toHaveText(
      cardLines(defense[index][1], defense[index][2]),
    );
    const [, kickReturn, puntReturn, fg, xp] = special[index];
    await expect(card.getByRole("term")).toHaveText([
      "KRKick return",
      "PRPunt return",
      "FGField goal",
      "XPExtra point",
    ]);
    await expect(card.getByRole("definition")).toHaveText([
      kickReturn === "None" ? "none" : kickReturn,
      puntReturn === "None" ? "none" : puntReturn,
      fg,
      xp,
    ]);

    await expect(card).not.toContainText(/Grade|MEDDLING|SAVVY|SELFISH|LOYAL|\bFP\b/);
    const logo = card.getByRole("img", { name: "Fast Drive Football" });
    await expect(logo).toBeVisible();
    await expect
      .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
  }

  await page.getByRole("link", { name: league }).click();
  await expect(page.getByRole("heading", { level: 1, name: league, exact: true })).toBeVisible();
});

test("groups cards under divisions without printing the division on a card", async ({ page }) => {
  await createLeague(page, "Divided Cards", true);
  await generate(page);

  await page.getByRole("link", { name: "View team cards" }).click();

  await expect(page.getByRole("list", { name: "Lakeshore cards" }).getByRole("article")).toHaveCount(
    4,
  );
  await expect(page.getByRole("list", { name: "Prairie cards" }).getByRole("article")).toHaveCount(4);
  for (const card of await cards(page).all()) {
    await expect(card).not.toContainText(/Lakeshore|Prairie/);
  }
});

test("shows an accepted league's cards without the draft line", async ({ page }) => {
  await createLeague(page, "Accepted Cards");
  await generate(page);
  await page.getByRole("button", { name: "Accept league" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();

  await page.getByRole("link", { name: "View team cards" }).click();

  await expect(cards(page)).toHaveCount(8);
  await expect(page.getByText("Its cards may change.")).toHaveCount(0);
});

test("gives the not-found page for a malformed league id", async ({ page }) => {
  await page.goto("/leagues/abc/cards");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});
