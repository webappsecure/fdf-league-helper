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

// A league page list such as "PROLIFIC, SOLID, RELIABLE•" as card lines.
function cardLines(list: string): string[] {
  return list === "None" ? [] : list.split(", ");
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
  await expect(page.getByRole("button", { name: "Print cards" })).toHaveCount(0);
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
      cardLines(offense[index][1]),
    );
    await expect(card.getByRole("region", { name: "Defense" }).getByRole("listitem")).toHaveText(
      cardLines(defense[index][1]),
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

function cardNames(scope: Page | Locator): Promise<string[]> {
  return scope
    .getByRole("article", { name: / card$/ })
    .evaluateAll((articles) => articles.map((article) => article.getAttribute("aria-label") ?? ""));
}

test("prints only sheets of six cards with cut lines between them", async ({ page }) => {
  const league = await createLeague(page, "Printed Cards", true);
  await generate(page);
  await page.getByRole("link", { name: "View team cards" }).click();
  await expect(cards(page)).toHaveCount(8);
  const sheets = page.getByRole("list", { name: /^Sheet \d+$/ });
  await expect(sheets).toHaveCount(0);
  const onScreen = await cardNames(page);

  await page.emulateMedia({ media: "print" });

  await expect(sheets).toHaveCount(2);
  await expect(sheets.nth(0).getByRole("article")).toHaveCount(6);
  await expect(sheets.nth(1).getByRole("article")).toHaveCount(2);
  expect(await cardNames(page)).toEqual(onScreen);

  await expect(page.getByRole("banner")).toBeHidden();
  await expect(page.getByRole("link", { name: league })).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeHidden();
  await expect(page.getByText("Its cards may change.")).toBeHidden();
  await expect(page.getByRole("button", { name: "Print cards" })).toBeHidden();
  await expect(page.getByText("Prints six cards per page")).toBeHidden();
  await expect(page.getByRole("list", { name: "Lakeshore cards" })).toBeHidden();

  // A sheet is the whole page, and a card's printing stands the same distance
  // inside its cell on every side, give or take the width of a cut line.
  const sheet = await sheets.nth(0).evaluate((list) => {
    const box = list.getBoundingClientRect();
    return [box.width / 96, box.height / 96];
  });
  expect(sheet[0]).toBeCloseTo(11, 2);
  expect(sheet[1]).toBeCloseTo(8.5, 2);
  const margins = await sheets
    .nth(0)
    .getByRole("listitem")
    .filter({ has: page.getByRole("article") })
    .evaluateAll((cells) =>
      cells.map((cell) => {
        const outer = cell.getBoundingClientRect();
        const article = cell.querySelector("article")!;
        const card = article.getBoundingClientRect();
        const padding = parseFloat(getComputedStyle(article.firstElementChild!).paddingTop);
        return [
          card.left - outer.left,
          card.top - outer.top,
          outer.right - card.right,
          outer.bottom - card.bottom,
        ].map((gap) => (gap + padding) / 96);
      }),
    );
  for (const sides of margins) {
    expect(Math.min(...sides)).toBeGreaterThan(0.2);
    expect(Math.max(...sides) - Math.min(...sides)).toBeLessThan(0.03);
  }

  // Lines run between cells only: right of the left column, under rows one and two.
  const lines = await sheets
    .nth(0)
    .getByRole("listitem")
    .filter({ has: page.getByRole("article") })
    .evaluateAll((cells) =>
      cells.map((cell) => {
        const style = getComputedStyle(cell);
        return [
          style.borderRightWidth === "0px" ? "" : style.borderRightStyle,
          style.borderBottomWidth === "0px" ? "" : style.borderBottomStyle,
          style.borderTopWidth === "0px" && style.borderLeftWidth === "0px" ? "" : "outside",
        ].join("|");
      }),
    );
  expect(lines).toEqual([
    "dotted|dotted|",
    "|dotted|",
    "dotted|dotted|",
    "|dotted|",
    "dotted||",
    "||",
  ]);
});

test("opens the print dialog from the print button", async ({ page }) => {
  await page.addInitScript(() => {
    const counter = window as unknown as { printCalls: number };
    counter.printCalls = 0;
    window.print = () => {
      counter.printCalls += 1;
    };
  });
  await createLeague(page, "Print Button");
  await generate(page);
  await page.getByRole("link", { name: "View team cards" }).click();
  await expect(
    page.getByText("Prints six cards per page on letter paper in landscape."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Print cards" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { printCalls: number }).printCalls))
    .toBe(1);
});

test("prints eight cards on two landscape letter pages", async ({ page }) => {
  await createLeague(page, "Paged Cards");
  await generate(page);
  await page.getByRole("link", { name: "View team cards" }).click();
  await expect(cards(page)).toHaveCount(8);

  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");

  // Letter in landscape is 792 by 612 points.
  expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  expect(pdf.match(/\/MediaBox\s*\[0 0 792 612\]/g)).toHaveLength(2);
});

function tagSelect(page: Page): Locator {
  return page.getByRole("combobox", { name: / offense tag$/ }).first();
}

// Resolves once the Server Action started by the given step has answered.
async function saved(page: Page, step: () => Promise<unknown>): Promise<void> {
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    step(),
  ]);
}

test("prints a chosen offense tag on the card and removes it when cleared", async ({ page }) => {
  await createLeague(page, "Tagged Cards");
  await generate(page);
  const leaguePage = page.url();

  await saved(page, () => tagSelect(page).selectOption("R+"));
  await page.reload();
  await expect(tagSelect(page)).toHaveValue("R+");

  await page.goto(`${leaguePage}/cards`);
  const tagged = page.getByRole("region", { name: "Offense [R+]" });
  await expect(tagged).toHaveCount(1);
  // The print sheets hold a second copy of every card, hidden on screen.
  await expect(
    page.getByText("OFFENSE [R+]", { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Offense", exact: true })).toHaveCount(7);

  await page.goto(leaguePage);
  await saved(page, () => tagSelect(page).selectOption(""));
  await page.goto(`${leaguePage}/cards`);
  await expect(page.getByRole("region", { name: "Offense", exact: true })).toHaveCount(8);
  await expect(page.getByText(/OFFENSE \[/).filter({ visible: true })).toHaveCount(0);
});

test("keeps an offense tag through a re-roll and an accept, and edits an accepted league", async ({
  page,
}) => {
  await createLeague(page, "Accepted Edits");
  await generate(page);
  await saved(page, () => tagSelect(page).selectOption("P"));

  await saved(page, () => page.getByRole("button", { name: "Re-roll league" }).click());
  await expect(tagSelect(page)).toHaveValue("P");
  await page.getByRole("button", { name: "Accept league" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  // An accepted league opens on the summary; editing happens in the detailed view.
  await page
    .getByRole("navigation", { name: "Teams view" })
    .getByRole("link", { name: "Detailed" })
    .click();
  await expect(tagSelect(page)).toHaveValue("P");

  const row = page.getByRole("table").getByRole("row").nth(1);
  await saved(page, () => tagSelect(page).selectOption("P+"));
  await saved(page, async () => {
    await row.getByRole("textbox").nth(0).fill("Edited City");
    await row.getByRole("textbox").nth(0).press("Enter");
  });
  await saved(page, async () => {
    await row.getByRole("textbox").nth(1).fill("Editors");
    await row.getByRole("textbox").nth(1).press("Enter");
  });
  await saved(page, async () => {
    await row.getByRole("textbox").nth(2).fill("Ed Itor");
    await row.getByRole("textbox").nth(2).press("Enter");
  });
  await saved(page, () => row.locator('input[type="color"]').nth(0).fill("#123456"));

  await page.reload();
  const after = page.getByRole("table").getByRole("row").nth(1);
  await expect(tagSelect(page)).toHaveValue("P+");
  await expect(after.getByRole("textbox").nth(0)).toHaveValue("Edited City");
  await expect(after.getByRole("textbox").nth(1)).toHaveValue("Editors");
  await expect(after.getByRole("textbox").nth(2)).toHaveValue("Ed Itor");
  await expect(after.locator('input[type="color"]').nth(0)).toHaveValue("#123456");
});

test("renames a league everywhere it is shown", async ({ page }) => {
  await createLeague(page, "Before Rename");
  await generate(page);
  const leaguePage = page.url();
  const renamed = uniqueName("After Rename");
  const field = page.getByRole("textbox", { name: "League name", exact: true });

  await saved(page, async () => {
    await field.fill(`  ${renamed}  `);
    await field.press("Enter");
  });

  await expect(page.getByRole("heading", { level: 1, name: renamed, exact: true })).toBeVisible();
  await expect(field).toHaveValue(renamed);
  await page.goto("/");
  await expect(page.getByRole("link", { name: renamed })).toBeVisible();
  await page.goto(`${leaguePage}/cards`);
  await expect(
    page.getByRole("heading", { level: 1, name: `${renamed} team cards` }),
  ).toBeVisible();
});

test("changes the season label on every card and keeps the XP kick distance", async ({ page }) => {
  await createLeague(page, "Relabelled");
  await generate(page);
  const leaguePage = page.url();
  const field = page.getByRole("textbox", {
    name: "Season label",
    exact: true,
  });
  await expect(field).toHaveValue("Season 1");
  const xpKick = page.getByRole("definition").filter({ hasText: "yard line" });
  await expect(xpKick).toHaveText("2-yard line");

  // A year from 2015 on would default to the 15-yard line for a new league.
  await saved(page, async () => {
    await field.fill("2016");
    await field.blur();
  });
  await page.reload();
  await expect(field).toHaveValue("2016");
  await expect(xpKick).toHaveText("2-yard line");

  await page.goto(`${leaguePage}/cards`);
  await expect(cards(page)).toHaveCount(8);
  for (const card of await cards(page).all()) {
    await expect(card.locator("header p").nth(3)).toHaveText("2016");
  }
});

test("shows an empty league name beside the field and keeps the saved name", async ({ page }) => {
  const name = await createLeague(page, "Never Blank");
  const field = page.getByRole("textbox", { name: "League name", exact: true });

  await saved(page, async () => {
    await field.fill("   ");
    await field.press("Enter");
  });

  const alert = page.getByRole("alert").filter({ hasText: "League name is required." });
  await expect(alert).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();

  await field.fill(name);
  await field.blur();
  await expect(alert).toHaveCount(0);
  await expect(field).not.toHaveAttribute("aria-invalid");
  await expect(field).toHaveValue(name);
});

test("edits the name and season label of an accepted league", async ({ page }) => {
  await createLeague(page, "Accepted Names");
  await generate(page);
  await page.getByRole("button", { name: "Accept league" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
  // The page behind the dialog is inert until it closes.
  await expect(page.getByRole("dialog")).toBeHidden();
  const renamed = uniqueName("Accepted Renamed");

  await saved(page, async () => {
    await page.getByRole("textbox", { name: "League name", exact: true }).fill(renamed);
    await page.getByRole("textbox", { name: "League name", exact: true }).press("Enter");
  });
  await saved(page, async () => {
    await page.getByRole("textbox", { name: "Season label", exact: true }).fill("Season 2");
    await page.getByRole("textbox", { name: "Season label", exact: true }).press("Enter");
  });

  await page.reload();
  await expect(page.getByRole("textbox", { name: "League name", exact: true })).toHaveValue(
    renamed,
  );
  await expect(page.getByRole("textbox", { name: "Season label", exact: true })).toHaveValue(
    "Season 2",
  );
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
});
